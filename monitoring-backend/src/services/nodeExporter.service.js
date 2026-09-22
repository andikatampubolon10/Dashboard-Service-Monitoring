'use strict';

/**
 * services/nodeExporter.service.js
 *
 * Scrapes and parses Prometheus node_exporter metrics:
 *  - CPU % (from node_cpu_seconds_total delta)
 *  - Memory breakdown: Total, Used, Available, Cached, Buffers
 *  - Disk usage: Total, Used, Free (mountpoint: /)
 *  - Load Average: 1m, 5m, 15m
 *  - Network I/O: RX & TX bytes/sec (delta)
 *  - Disk I/O: Read & Write bytes/sec (delta)
 *  - Host Uptime
 */

const axios = require('axios');

// Store previous scrape values for delta rate calculations
// Map of host -> { timestamp, cpu: { idle, total }, net: { rx, tx }, disk: { read, write } }
const prevHostScrapes = new Map();

/**
 * Fetch raw metrics from node_exporter on host:port
 * @param {string} host
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<string|null>}
 */
async function fetchNodeExporterRaw(host, port = 9100, timeoutMs = 2500) {
  try {
    const res = await axios.get(`http://${host}:${port}/metrics`, {
      timeout: timeoutMs,
      headers: { Accept: 'text/plain' },
      validateStatus: (status) => status < 400,
    });
    return typeof res.data === 'string' ? res.data : '';
  } catch {
    return null;
  }
}

/**
 * Parse raw node_exporter text into comprehensive metrics
 * @param {string} rawText
 * @param {string} hostKey
 * @returns {object|null}
 */
function parseNodeExporterText(rawText, hostKey) {
  if (!rawText || (!rawText.includes('node_memory_MemTotal_bytes') && !rawText.includes('node_cpu_seconds_total'))) {
    return null;
  }

  const now = Date.now();
  const lines = rawText.split('\n');

  let memTotal = 0;
  let memAvail = 0;
  let memCached = 0;
  let memBuffers = 0;

  let diskTotal = 0;
  let diskAvail = 0;

  let load1 = 0;
  let load5 = 0;
  let load15 = 0;

  let timeSec = 0;
  let bootTimeSec = 0;

  let totalNetRx = 0;
  let totalNetTx = 0;

  let totalDiskRead = 0;
  let totalDiskWrite = 0;

  // CPU counters: mode -> seconds
  let cpuTotalSeconds = 0;
  let cpuIdleSeconds = 0;
  const cpuCores = new Set();

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;

    // Memory
    if (line.startsWith('node_memory_MemTotal_bytes ')) {
      memTotal = parseFloat(line.split(' ')[1]) || 0;
    } else if (line.startsWith('node_memory_MemAvailable_bytes ')) {
      memAvail = parseFloat(line.split(' ')[1]) || 0;
    } else if (line.startsWith('node_memory_Cached_bytes ')) {
      memCached = parseFloat(line.split(' ')[1]) || 0;
    } else if (line.startsWith('node_memory_Buffers_bytes ')) {
      memBuffers = parseFloat(line.split(' ')[1]) || 0;
    }

    // Load Average
    else if (line.startsWith('node_load1 ')) {
      load1 = parseFloat(line.split(' ')[1]) || 0;
    } else if (line.startsWith('node_load5 ')) {
      load5 = parseFloat(line.split(' ')[1]) || 0;
    } else if (line.startsWith('node_load15 ')) {
      load15 = parseFloat(line.split(' ')[1]) || 0;
    }

    // Uptime
    else if (line.startsWith('node_time_seconds ')) {
      timeSec = parseFloat(line.split(' ')[1]) || 0;
    } else if (line.startsWith('node_boot_time_seconds ')) {
      bootTimeSec = parseFloat(line.split(' ')[1]) || 0;
    }

    // Disk usage (root mountpoint)
    else if (line.startsWith('node_filesystem_size_bytes{') && line.includes('mountpoint="/"')) {
      const parts = line.split(' ');
      diskTotal = parseFloat(parts[parts.length - 1]) || 0;
    } else if (line.startsWith('node_filesystem_avail_bytes{') && line.includes('mountpoint="/"')) {
      const parts = line.split(' ');
      diskAvail = parseFloat(parts[parts.length - 1]) || 0;
    }

    // CPU seconds
    else if (line.startsWith('node_cpu_seconds_total{')) {
      const coreMatch = line.match(/cpu="(\d+)"/);
      if (coreMatch) cpuCores.add(coreMatch[1]);

      const parts = line.split(' ');
      const val = parseFloat(parts[parts.length - 1]) || 0;
      cpuTotalSeconds += val;
      if (line.includes('mode="idle"')) {
        cpuIdleSeconds += val;
      }
    }

    // Network I/O (exclude lo, docker, veth)
    else if (line.startsWith('node_network_receive_bytes_total{')) {
      if (!line.includes('device="lo"') && !line.includes('device="veth"') && !line.includes('device="docker0"') && !line.includes('device="br-')) {
        const parts = line.split(' ');
        totalNetRx += parseFloat(parts[parts.length - 1]) || 0;
      }
    } else if (line.startsWith('node_network_transmit_bytes_total{')) {
      if (!line.includes('device="lo"') && !line.includes('device="veth"') && !line.includes('device="docker0"') && !line.includes('device="br-')) {
        const parts = line.split(' ');
        totalNetTx += parseFloat(parts[parts.length - 1]) || 0;
      }
    }

    // Disk I/O (standard device names like sda, vda, nvme0n1)
    else if (line.startsWith('node_disk_read_bytes_total{')) {
      if (line.includes('device="sda"') || line.includes('device="vda"') || line.includes('device="nvme0n1"')) {
        const parts = line.split(' ');
        totalDiskRead += parseFloat(parts[parts.length - 1]) || 0;
      }
    } else if (line.startsWith('node_disk_written_bytes_total{')) {
      if (line.includes('device="sda"') || line.includes('device="vda"') || line.includes('device="nvme0n1"')) {
        const parts = line.split(' ');
        totalDiskWrite += parseFloat(parts[parts.length - 1]) || 0;
      }
    }
  }

  // Calculate delta rates
  let netRxRate = 0; // bytes/sec
  let netTxRate = 0; // bytes/sec
  let diskReadRate = 0; // bytes/sec
  let diskWriteRate = 0; // bytes/sec
  let cpuUsagePercent = 0;

  const prev = prevHostScrapes.get(hostKey);
  if (prev && now > prev.timestamp) {
    const elapsedSec = (now - prev.timestamp) / 1000;
    if (elapsedSec > 0.5) {
      // Net rates
      netRxRate = Math.max(0, (totalNetRx - prev.net.rx) / elapsedSec);
      netTxRate = Math.max(0, (totalNetTx - prev.net.tx) / elapsedSec);

      // Disk rates
      diskReadRate = Math.max(0, (totalDiskRead - prev.disk.read) / elapsedSec);
      diskWriteRate = Math.max(0, (totalDiskWrite - prev.disk.write) / elapsedSec);

      // CPU delta %
      const deltaTotal = cpuTotalSeconds - prev.cpu.total;
      const deltaIdle = cpuIdleSeconds - prev.cpu.idle;
      if (deltaTotal > 0) {
        const activeRatio = (deltaTotal - deltaIdle) / deltaTotal;
        cpuUsagePercent = Math.min(100, Math.max(0, parseFloat((activeRatio * 100).toFixed(1))));
      }
    }
  }

  // Store for next delta
  prevHostScrapes.set(hostKey, {
    timestamp: now,
    cpu: { total: cpuTotalSeconds, idle: cpuIdleSeconds },
    net: { rx: totalNetRx, tx: totalNetTx },
    disk: { read: totalDiskRead, write: totalDiskWrite },
  });

  // Calculate human-friendly numbers
  const cores = cpuCores.size > 0 ? cpuCores.size : 2;
  const memTotalMb = Math.round(memTotal / 1024 / 1024);
  const memAvailMb = Math.round(memAvail / 1024 / 1024);
  const memUsedMb = Math.max(0, memTotalMb - memAvailMb);
  const memCachedMb = Math.round(memCached / 1024 / 1024);
  const memBuffersMb = Math.round(memBuffers / 1024 / 1024);
  const memUsedPercent = memTotalMb > 0 ? parseFloat(((memUsedMb / memTotalMb) * 100).toFixed(1)) : 0;

  const totalDiskGb = diskTotal > 0 ? parseFloat((diskTotal / 1024 / 1024 / 1024).toFixed(1)) : 0;
  const availDiskGb = diskAvail > 0 ? parseFloat((diskAvail / 1024 / 1024 / 1024).toFixed(1)) : 0;
  const usedDiskGb = Math.max(0, parseFloat((totalDiskGb - availDiskGb).toFixed(1)));
  const diskUsedPercent = totalDiskGb > 0 ? parseFloat(((usedDiskGb / totalDiskGb) * 100).toFixed(1)) : 0;

  let uptimeSec = 0;
  if (timeSec && bootTimeSec) {
    uptimeSec = Math.max(0, Math.floor(timeSec - bootTimeSec));
  }
  const uptimeDays = Math.floor(uptimeSec / 86400);
  const uptimeHours = Math.floor((uptimeSec % 86400) / 3600);
  const uptimeFormatted = uptimeDays > 0 ? `${uptimeDays}d ${uptimeHours}h` : `${uptimeHours}h`;

  return {
    isLiveExporter: true,
    cpu: {
      usagePercent: cpuUsagePercent,
      cores,
    },
    memory: {
      totalMb: memTotalMb,
      usedMb: memUsedMb,
      freeMb: memAvailMb,
      cachedMb: memCachedMb,
      buffersMb: memBuffersMb,
      usedPercent: memUsedPercent,
    },
    disk: {
      totalGb: totalDiskGb,
      usedGb: usedDiskGb,
      freeGb: availDiskGb,
      usedPercent: diskUsedPercent,
      readBytesSec: Math.round(diskReadRate),
      writeBytesSec: Math.round(diskWriteRate),
      readMbSec: parseFloat((diskReadRate / 1024 / 1024).toFixed(2)),
      writeMbSec: parseFloat((diskWriteRate / 1024 / 1024).toFixed(2)),
    },
    loadAverage: {
      load1: parseFloat(load1.toFixed(2)),
      load5: parseFloat(load5.toFixed(2)),
      load15: parseFloat(load15.toFixed(2)),
    },
    network: {
      rxBytesSec: Math.round(netRxRate),
      txBytesSec: Math.round(netTxRate),
      rxKbSec: parseFloat((netRxRate / 1024).toFixed(1)),
      txKbSec: parseFloat((netTxRate / 1024).toFixed(1)),
      rxMbSec: parseFloat((netRxRate / 1024 / 1024).toFixed(3)),
      txMbSec: parseFloat((netTxRate / 1024 / 1024).toFixed(3)),
    },
    uptime: {
      seconds: uptimeSec,
      formatted: uptimeFormatted,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fetch and parse node_exporter metrics for a host
 * @param {string} host
 * @param {number} port
 * @returns {Promise<object|null>}
 */
async function scrapeHostNodeExporter(host, port = 9100) {
  const raw = await fetchNodeExporterRaw(host, port);
  if (!raw) return null;
  return parseNodeExporterText(raw, `${host}:${port}`);
}

module.exports = {
  scrapeHostNodeExporter,
  parseNodeExporterText,
  fetchNodeExporterRaw,
};
