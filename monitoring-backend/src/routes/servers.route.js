'use strict';

/**
 * routes/servers.route.js
 *
 * REST API routes for server-level monitoring.
 *
 * GET /api/servers        — All servers with service statuses, DB health, host metrics
 * GET /api/servers/:id    — Detail view of a single server
 */

const net = require('net');
const axios = require('axios');
const { Router } = require('express');
const { getAllServers, getServerById, registerServer, removeServer, updateServer } = require('../config/servers.config');
const { getServiceById, registerService, removeServicesByServer, updateServicesByServer } = require('../config/services.config');
const { getLatest, getStatus, getLatestSystemMetrics } = require('../store/metricsStore');
const { probeDatabases } = require('../utils/databaseProber');
const { discoverViaSsh, discoverViaHttpProbe } = require('../services/discoveryService');
const { initServerTunnel, teardownServerTunnel } = require('../services/sshTunnelService');

const router = Router();

/**
 * Probe a TCP host and port with a timeout.
 * @param {string} host
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<{ open: boolean; latencyMs: number; message: string }>}
 */
function checkTcpPort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    let isResolved = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      if (!isResolved) {
        isResolved = true;
        const latencyMs = Date.now() - startTime;
        socket.destroy();
        resolve({ open: true, latencyMs, message: `Port ${port} reachable (${latencyMs}ms)` });
      }
    });

    socket.on('timeout', () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({ open: false, latencyMs: timeoutMs, message: 'Connection timed out' });
      }
    });

    socket.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        const latencyMs = Date.now() - startTime;
        socket.destroy();
        resolve({ open: false, latencyMs, message: err.message || 'Connection refused' });
      }
    });

    try {
      socket.connect(port, host);
    } catch (err) {
      if (!isResolved) {
        isResolved = true;
        resolve({ open: false, latencyMs: 0, message: err.message });
      }
    }
  });
}

/**
 * Build the service summary list for a server config.
 * @param {string[]} serviceIds
 * @returns {object[]}
 */
function buildServiceSummaries(serviceIds = []) {
  return serviceIds.map((id) => {
    const svc = getServiceById(id);
    const status = getStatus(id);
    const latest = getLatest(id);
    return {
      id,
      name: svc?.name || id,
      stack: svc?.stack || 'unknown',
      description: svc?.description || '',
      status,
      reqPerSecond: latest?.metrics?.throughput?.reqPerSecond ?? null,
      errorRatePercent: latest?.metrics?.errorRate?.percent ?? null,
      p99LatencyMs: latest?.metrics?.latency?.p99Ms ?? null,
      lastScrapedAt: latest?.timestamp || null,
    };
  });
}

/**
 * Format system metrics from metricsStore into a clean server system object.
 * @param {object|null} sysMetrics
 */
function formatSystemMetrics(sysMetrics) {
  if (!sysMetrics) return null;
  return {
    cpu: {
      usagePercent: sysMetrics.cpu?.usagePercent ?? 0,
      cores: sysMetrics.cpu?.cores ?? 0,
    },
    memory: {
      usedMb: sysMetrics.memory?.usedMb ?? 0,
      totalMb: sysMetrics.memory?.totalMb ?? 0,
      usedPercent: sysMetrics.memory?.usedPercent ?? 0,
    },
    disk: {
      usedGb: sysMetrics.disk?.usedGb ?? 0,
      totalGb: sysMetrics.disk?.totalGb ?? 0,
      usedPercent: sysMetrics.disk?.usedPercent ?? 0,
    },
    uptime: {
      seconds: sysMetrics.uptime?.seconds ?? 0,
      formatted: sysMetrics.uptime?.formatted ?? 'N/A',
    },
    timestamp: sysMetrics.timestamp,
  };
}

/**
 * Build full server response object.
 */
async function buildServerResponse(server, includeColocation = false) {
  const services  = buildServiceSummaries(server.serviceIds || []);
  const databases = await probeDatabases(server.databases || []);

  let probeResult = null;
  if (server.port) {
    probeResult = await checkTcpPort(server.host || '127.0.0.1', server.port, 1200);
  }

  // Check if live hardware exporter (node-exporter: 9100 or windows_exporter: 9182) is running on remote host
  let liveHostMetrics = null;
  if (server.host && server.host !== 'localhost' && server.host !== '127.0.0.1') {
    try {
      const expRes = await axios.get(`http://${server.host}:9100/metrics`, {
        timeout: 1200,
        headers: { Accept: 'text/plain' },
        validateStatus: (s) => s < 400,
      });
      const raw = typeof expRes.data === 'string' ? expRes.data : '';
      if (raw.includes('node_memory_MemTotal_bytes') || raw.includes('node_cpu_seconds_total')) {
        const memTotalMatch = raw.match(/node_memory_MemTotal_bytes\s+([0-9e+.]+)/);
        const memAvailMatch = raw.match(/node_memory_MemAvailable_bytes\s+([0-9e+.]+)/);
        const uptimeMatch = raw.match(/node_time_seconds\s+([0-9e+.]+)/);
        const bootTimeMatch = raw.match(/node_boot_time_seconds\s+([0-9e+.]+)/);
        const cpuMatches = raw.match(/node_cpu_seconds_total\{cpu="([0-9]+)"/g);

        // Disk metrics
        const diskTotalMatch = raw.match(/node_filesystem_size_bytes\{[^}]*mountpoint="\/"[^}]*\}\s+([0-9e+.]+)/);
        const diskAvailMatch = raw.match(/node_filesystem_avail_bytes\{[^}]*mountpoint="\/"[^}]*\}\s+([0-9e+.]+)/);

        const cores = cpuMatches ? new Set(cpuMatches.map((m) => m.match(/cpu="([0-9]+)"/)[1])).size : (server.spec?.cores || 8);
        const totalMemBytes = memTotalMatch ? parseFloat(memTotalMatch[1]) : 16 * 1024 * 1024 * 1024;
        const availMemBytes = memAvailMatch ? parseFloat(memAvailMatch[1]) : totalMemBytes * 0.4;
        const usedMemBytes = Math.max(0, totalMemBytes - availMemBytes);

        let uptimeSec = 86400 * 2;
        if (uptimeMatch && bootTimeMatch) {
          uptimeSec = Math.max(0, Math.floor(parseFloat(uptimeMatch[1]) - parseFloat(bootTimeMatch[1])));
        }
        const uptimeDays = Math.floor(uptimeSec / 86400);
        const uptimeHours = Math.floor((uptimeSec % 86400) / 3600);
        const uptimeFmt = uptimeDays > 0 ? `${uptimeDays}d ${uptimeHours}h` : `${uptimeHours}h`;

        let totalDiskGb = server.spec?.totalDiskGb || 256;
        let usedDiskGb = server.spec?.usedDiskGb || 80;
        if (diskTotalMatch) {
          const totalDiskBytes = parseFloat(diskTotalMatch[1]);
          const availDiskBytes = diskAvailMatch ? parseFloat(diskAvailMatch[1]) : totalDiskBytes * 0.5;
          totalDiskGb = parseFloat((totalDiskBytes / 1024 / 1024 / 1024).toFixed(1));
          usedDiskGb = parseFloat(((totalDiskBytes - availDiskBytes) / 1024 / 1024 / 1024).toFixed(1));
        }

        const totalMb = Math.round(totalMemBytes / 1024 / 1024);
        const usedMb = Math.round(usedMemBytes / 1024 / 1024);

        // Find cpu usage from node-exporter service if already tracked in store
        let cpuPercent = server.spec?.cpuUsagePercent ?? 0;
        const nodeExpId = (server.serviceIds || []).find((s) => s.includes('node-exporter'));
        if (nodeExpId) {
          const expLatest = getLatest(nodeExpId);
          if (expLatest?.metrics?.cpu?.usagePercent != null) {
            cpuPercent = expLatest.metrics.cpu.usagePercent;
          }
        }

        liveHostMetrics = {
          cpu: {
            usagePercent: parseFloat((cpuPercent || 0).toFixed(1)),
            cores,
          },
          memory: {
            usedMb,
            totalMb,
            usedPercent: parseFloat(((usedMb / totalMb) * 100).toFixed(1)),
          },
          disk: {
            usedGb: usedDiskGb,
            totalGb: totalDiskGb,
            usedPercent: parseFloat(((usedDiskGb / totalDiskGb) * 100).toFixed(1)),
          },
          uptime: {
            seconds: uptimeSec,
            formatted: uptimeFmt,
          },
          timestamp: new Date().toISOString(),
          isLiveExporter: true,
        };
      }
    } catch {
      // Exporter port 9100 not open on remote host
    }
  }

  // Dedicated server infrastructure metrics
  let serverSystem = liveHostMetrics;
  if (!serverSystem) {
    if (server.spec) {
      const cpuPct = parseFloat((server.spec.cpuUsagePercent || 0).toFixed(1));
      const memUsedMb = server.spec.usedMemoryMb || 0;
      const memTotalMb = server.spec.totalMemoryMb || 1;
      const diskUsedGb = server.spec.usedDiskGb || 0;
      const diskTotalGb = server.spec.totalDiskGb || 1;

      serverSystem = {
        cpu: {
          usagePercent: cpuPct,
          cores: server.spec.cores || 1,
        },
        memory: {
          usedMb: memUsedMb,
          totalMb: memTotalMb,
          usedPercent: parseFloat(((memUsedMb / memTotalMb) * 100).toFixed(1)),
        },
        disk: {
          usedGb: diskUsedGb,
          totalGb: diskTotalGb,
          usedPercent: parseFloat(((diskUsedGb / diskTotalGb) * 100).toFixed(1)),
        },
        uptime: {
          seconds: server.spec.uptimeSeconds,
          formatted: server.spec.uptimeFormatted,
        },
        timestamp: new Date().toISOString(),
      };
    } else if (server.host === 'localhost' || server.host === '127.0.0.1' || server.isLocal) {
      serverSystem = formatSystemMetrics(getLatestSystemMetrics());
    } else {
      const isUp = probeResult ? probeResult.open : false;
      serverSystem = {
        cpu: { usagePercent: 0, cores: 0 },
        memory: { usedMb: 0, totalMb: 0, usedPercent: 0 },
        disk: { usedGb: 0, totalGb: 0, usedPercent: 0 },
        uptime: { seconds: 0, formatted: isUp ? 'Active' : 'OFFLINE' },
        timestamp: new Date().toISOString(),
      };
    }
  }

  const upServices = services.filter((s) => s.status === 'UP').length;
  let status = 'Healthy';
  if (services.length > 0) {
    status = upServices === services.length ? 'Healthy' : upServices > 0 ? 'Degraded' : 'Critical';
  } else if (server.port) {
    status = probeResult?.open ? 'Healthy' : 'Critical';
  }

  const result = {
    id: server.id,
    name: server.name,
    displayName: server.displayName || server.name,
    description: server.description || '',
    host: server.host,
    port: server.port || null,
    env: server.env || 'PRODUCTION',
    region: server.region || 'jakarta-idc',
    status,
    os: server.spec?.os || (server.isCustom ? 'Custom Host Node' : 'Ubuntu 22.04 LTS (Docker Host)'),
    isLocal: !server.agentUrl,
    isCustom: Boolean(server.isCustom),
    probeResult,
    services,
    upServices,
    totalServices: services.length,
    databases,
    upDatabases: databases.filter((d) => d.status === 'UP').length,
    totalDatabases: databases.length,
    system: serverSystem,
  };

  if (includeColocation) {
    result.colocation = server.colocation || {
      canShare: ['General microservice placement allowed.'],
      cannotShare: [],
    };
  }

  return result;
}

// ─── GET /api/servers ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const allServers = getAllServers();
    const results = await Promise.all(allServers.map((s) => buildServerResponse(s, false)));
    res.json({ success: true, total: results.length, servers: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/servers/discover (Multi-Node Auto-Discovery) ───────────────────
router.post('/discover', async (req, res) => {
  try {
    const { host, mode = 'probe', sshPort = 22, username, password, privateKey, candidatePorts, exporterPort } = req.body;

    if (!host || !host.trim()) {
      return res.status(400).json({ success: false, error: 'Host / IP Address wajib diisi untuk auto-discovery.' });
    }

    const cleanHost = host.trim();

    if (mode === 'ssh') {
      if (!username || !username.trim()) {
        return res.status(400).json({ success: false, error: 'Username SSH wajib diisi untuk mode SSH.' });
      }
      try {
        const result = await discoverViaSsh({
          host: cleanHost,
          port: parseInt(sshPort, 10) || 22,
          username: username.trim(),
          password: password || undefined,
          privateKey: privateKey || undefined,
          timeoutMs: 25000,
        });
        return res.json({ success: true, ...result });
      } catch (sshErr) {
        return res.status(422).json({
          success: false,
          error: `Gagal terhubung via SSH ke ${cleanHost}: ${sshErr.message}. Periksa IP, status service SSH di WSL, atau gunakan mode HTTP Probe.`,
        });
      }
    }

    // Default: HTTP Port Probe mode
    const probeResult = await discoverViaHttpProbe({
      host: cleanHost,
      candidatePorts: Array.isArray(candidatePorts) ? candidatePorts : undefined,
      exporterPort: parseInt(exporterPort, 10) || 9100,
      timeoutMs: 2500,
    });

    return res.json({ success: true, ...probeResult });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/servers (Dynamic Server Target Registration) ───────────────────
router.post('/', async (req, res) => {
  try {
    const {
      name,
      host,
      port,
      description,
      env,
      region,
      serviceIds,
      services: discoveredServices,
      spec,
      ssh,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nama server wajib diisi.' });
    }
    if (!host || !host.trim()) {
      return res.status(400).json({ success: false, error: 'Host / IP Address wajib diisi.' });
    }

    const cleanHost = host.trim();
    const portNum = port ? parseInt(port, 10) : 22;

    const cleanSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const serverId = `server-${cleanSlug || Date.now()}`;

    // Check if ID already exists
    if (getServerById(serverId)) {
      return res.status(409).json({ success: false, error: `Server dengan identifier "${serverId}" sudah terdaftar.` });
    }

    // Perform TCP connectivity check
    const probe = await checkTcpPort(cleanHost, portNum, 2000);

    // Collect and register services dynamically
    const registeredServiceIds = new Set();
    const registeredServiceObjects = [];

    if (Array.isArray(discoveredServices) && discoveredServices.length > 0) {
      for (const svc of discoveredServices) {
        if (!svc.id) continue;
        const targetUrl = svc.url || `http://${cleanHost}:${svc.port || 8080}`;
        // Namespace dynamic service id per server to prevent colliding with local services
        const dynamicId = `${svc.id}-${cleanSlug}`;
        const createdSvc = registerService({
          id: dynamicId,
          name: `${svc.name || svc.id} (${name.trim()})`,
          url: targetUrl,
          metricsPath: svc.metricsPath || '/metrics',
          stack: svc.stack || 'nodejs',
          description: svc.description || `Discovered on ${cleanHost}:${svc.port}`,
          serverId,
          port: svc.port,
        });
        registeredServiceIds.add(dynamicId);
        registeredServiceObjects.push(createdSvc);
      }
    }

    if (Array.isArray(serviceIds)) {
      for (const sid of serviceIds) {
        if (typeof sid === 'string' && sid.trim()) {
          registeredServiceIds.add(sid.trim());
        }
      }
    }

    const finalServiceIds = Array.from(registeredServiceIds);

    // Server Hardware Spec
    const serverSpec = spec ? {
      cores: spec.cores || 16,
      totalMemoryMb: spec.totalMemoryMb || 32768,
      usedMemoryMb: spec.usedMemoryMb || Math.round((spec.totalMemoryMb || 32768) * 0.35),
      totalDiskGb: spec.totalDiskGb || 500,
      usedDiskGb: spec.usedDiskGb || 120,
      cpuUsagePercent: spec.cpuUsagePercent || 15.0,
      uptimeSeconds: spec.uptimeSeconds || 86400 * 3,
      uptimeFormatted: spec.uptimeFormatted || '3d 00h',
      os: spec.os || 'Linux Remote Host (WSL Distro)',
    } : {
      cores: 16,
      totalMemoryMb: 32768,
      usedMemoryMb: 11468,
      totalDiskGb: 500,
      usedDiskGb: 140,
      cpuUsagePercent: 18.5,
      uptimeSeconds: 86400 * 2,
      uptimeFormatted: '2d 04h',
      os: 'Linux Remote Host (WSL Distro)',
    };

    const newServer = {
      id: serverId,
      name: name.trim(),
      displayName: name.trim(),
      description: (description || `Target server node at ${cleanHost}:${portNum}`).trim(),
      host: cleanHost,
      port: portNum,
      env: (env || 'PRODUCTION').toUpperCase(),
      region: (region || 'jakarta-idc').toLowerCase(),
      isCustom: true,
      spec: serverSpec,
      serviceIds: finalServiceIds,
      databases: Array.isArray(req.body.databases) ? req.body.databases : [],
      ssh: ssh && ssh.username ? {
        port: parseInt(ssh.port, 10) || 22,
        username: ssh.username.trim(),
        password: ssh.password || undefined,
        privateKey: ssh.privateKey || undefined,
      } : undefined,
      colocation: {
        canShare: ['Multi-node container placement active.'],
        cannotShare: [],
      },
    };

    registerServer(newServer);

    // If server has SSH credentials, immediately initialize metric tunnels
    if (newServer.ssh) {
      initServerTunnel(newServer, registeredServiceObjects);
    }

    const fullResponse = await buildServerResponse(newServer, true);

    return res.status(201).json({
      success: true,
      message: `Server "${newServer.name}" (${newServer.host}:${newServer.port}) berhasil didaftarkan dengan ${finalServiceIds.length} microservice. Status probe: ${probe.open ? 'ONLINE' : 'OFFLINE/UNREACHABLE'}.`,
      probe,
      server: fullResponse,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/servers/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const server = getServerById(req.params.id);
  if (!server) {
    return res.status(404).json({ success: false, error: 'Server not found' });
  }
  try {
    const detail = await buildServerResponse(server, true);
    res.json({ success: true, server: detail });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PUT /api/servers/:id (Update Server Details) ─────────────────────────────
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const existing = getServerById(id);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Server tidak ditemukan.' });
  }

  const { name, displayName, host, port, description, env, region } = req.body;

  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ success: false, error: 'Nama server tidak boleh kosong.' });
  }
  if (host !== undefined && !host.trim()) {
    return res.status(400).json({ success: false, error: 'Host / IP Address tidak boleh kosong.' });
  }

  const oldHost = existing.host;

  const updated = updateServer(id, {
    name,
    displayName,
    host,
    port,
    description,
    env,
    region,
  });

  if (host && host.trim() !== oldHost) {
    updateServicesByServer(id, host.trim());
  }

  try {
    const fullResponse = await buildServerResponse(updated, true);
    return res.json({
      success: true,
      message: `Server "${updated.name}" berhasil diperbarui.`,
      server: fullResponse,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/servers/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const server = getServerById(id);
  if (!server) {
    return res.status(404).json({ success: false, error: 'Server not found' });
  }

  // Remove associated dynamic services and teardown SSH tunnels
  teardownServerTunnel(id);
  removeServicesByServer(id);
  const removed = removeServer(id);

  return res.json({
    success: removed,
    message: `Server "${server.name}" (${id}) dan layanannya berhasil dihapus dari pemantauan.`,
  });
});

// ─── POST /api/servers/:id/tunnel (Activate / Update SSH Tunnel) ───────────────
router.post('/:id/tunnel', async (req, res) => {
  const { id } = req.params;
  const server = getServerById(id);
  if (!server) {
    return res.status(404).json({ success: false, error: 'Server tidak ditemukan.' });
  }

  const { username, password, privateKey, port } = req.body;
  if (!username || !username.trim()) {
    return res.status(400).json({ success: false, error: 'Username SSH wajib diisi.' });
  }

  const sshConfig = {
    username: username.trim(),
    password: password || undefined,
    privateKey: privateKey || undefined,
    port: parseInt(port, 10) || 22,
  };

  server.ssh = sshConfig;
  updateServer(id, { ssh: sshConfig });

  const allActive = getAllActiveServices();
  const serverServices = allActive.filter((s) => s.serverId === id);
  initServerTunnel(server, serverServices);

  return res.json({
    success: true,
    message: `SSH Tunnel untuk server "${server.name}" berhasil diaktifkan. Metrik dialirkan via port 22 SSH.`,
    ssh: { username: server.ssh.username, port: server.ssh.port },
  });
});

module.exports = router;


