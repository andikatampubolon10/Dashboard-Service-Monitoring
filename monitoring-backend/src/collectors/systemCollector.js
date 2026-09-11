'use strict';

/**
 * systemCollector.js
 *
 * Collects host-level system metrics (Disk, CPU, RAM) from the OS
 * using the `systeminformation` library.
 *
 * These metrics cover the SERVER tab requirement and complement
 * per-service process metrics from Prometheus.
 */

const os = require('os');
const si = require('systeminformation');

const MONITOR_LOCAL_LAPTOP = process.env.MONITOR_LOCAL_LAPTOP === 'true';

/**
 * Cached disk info (refreshed every 60s to avoid overhead).
 * @type {{ used: number, total: number, percent: number }|null}
 */
let cachedDisk = null;
let diskLastFetch = 0;
const DISK_TTL_MS = 60_000;

/**
 * Collect host disk usage.
 *
 * @returns {Promise<DiskMetrics>}
 */
async function getDiskMetrics() {
  const now = Date.now();
  if (cachedDisk && now - diskLastFetch < DISK_TTL_MS) {
    return cachedDisk;
  }

  try {
    const fsList = await si.fsSize();
    if (!fsList || fsList.length === 0) {
      return { usedGb: 0, totalGb: 0, usedPercent: 0, readMbs: 0, writeMbs: 0 };
    }

    const totalBytes = fsList.reduce((acc, f) => acc + (f.size || 0), 0);
    const usedBytes = fsList.reduce((acc, f) => acc + (f.used || 0), 0);

    const totalGb = parseFloat((totalBytes / 1024 / 1024 / 1024).toFixed(2));
    const usedGb = parseFloat((usedBytes / 1024 / 1024 / 1024).toFixed(2));
    const usedPercent = totalGb > 0 ? parseFloat(((usedGb / totalGb) * 100).toFixed(2)) : 0;

    let readMbs = 0;
    let writeMbs = 0;
    try {
      const diskIO = await si.disksIO();
      readMbs = parseFloat(((diskIO.rIO_sec || 0) * 512 / 1024 / 1024).toFixed(2));
      writeMbs = parseFloat(((diskIO.wIO_sec || 0) * 512 / 1024 / 1024).toFixed(2));
    } catch {
      // disksIO may not be available on all platforms
    }

    cachedDisk = { usedGb, totalGb, usedPercent, readMbs, writeMbs };
    diskLastFetch = now;
    return cachedDisk;
  } catch (err) {
    return { usedGb: 0, totalGb: 0, usedPercent: 0, readMbs: 0, writeMbs: 0 };
  }
}

/**
 * Collect host CPU and RAM metrics.
 *
 * @returns {Promise<HostMetrics>}
 */
async function getHostMetrics() {
  try {
    const [cpuLoad, mem] = await Promise.all([
      si.currentLoad(),
      si.mem(),
    ]);

    const totalMb = parseFloat((mem.total / 1024 / 1024).toFixed(2));
    const activeMb = parseFloat(((mem.active || (mem.total - mem.available)) / 1024 / 1024).toFixed(2));
    const freeMb = parseFloat(((mem.available || mem.free) / 1024 / 1024).toFixed(2));

    return {
      cpu: {
        usagePercent: parseFloat((cpuLoad.currentLoad || 0).toFixed(2)),
        cores: cpuLoad.cpus?.length || os.cpus().length || 1,
      },
      memory: {
        totalMb,
        usedMb: activeMb,
        freeMb,
        usedPercent: totalMb > 0 ? parseFloat(((activeMb / totalMb) * 100).toFixed(2)) : 0,
      },
    };
  } catch (err) {
    const totalMem = os.totalmem() / 1024 / 1024;
    const freeMem = os.freemem() / 1024 / 1024;
    const usedMem = totalMem - freeMem;
    return {
      cpu: { usagePercent: 0, cores: os.cpus().length || 1 },
      memory: {
        totalMb: parseFloat(totalMem.toFixed(2)),
        usedMb: parseFloat(usedMem.toFixed(2)),
        freeMb: parseFloat(freeMem.toFixed(2)),
        usedPercent: parseFloat(((usedMem / totalMem) * 100).toFixed(2)),
      },
    };
  }
}

/**
 * Collect all system metrics in one call.
 * @returns {Promise<SystemMetrics>}
 */
async function collectSystemMetrics() {
  const [host, disk] = await Promise.all([
    getHostMetrics(),
    getDiskMetrics(),
  ]);

  let uptimeSec = 0;
  let uptimeFmt = '0h';

  try {
    uptimeSec = os.uptime ? os.uptime() : (si.time ? si.time().uptime : 0);
    const uptimeDays = Math.floor(uptimeSec / 86400);
    const uptimeHours = Math.floor((uptimeSec % 86400) / 3600);
    uptimeFmt = uptimeDays > 0
      ? `${uptimeDays}d ${uptimeHours}h`
      : `${uptimeHours}h`;
  } catch {
    uptimeSec = 0;
    uptimeFmt = '0h';
  }

  return {
    timestamp: new Date().toISOString(),
    ...host,
    disk,
    uptime: {
      seconds: uptimeSec,
      formatted: uptimeFmt,
    },
  };
}


module.exports = { collectSystemMetrics, getDiskMetrics, getHostMetrics };

/**
 * @typedef {Object} DiskMetrics
 * @property {number} usedGb
 * @property {number} totalGb
 * @property {number} usedPercent
 * @property {number} readMbs
 * @property {number} writeMbs
 */

/**
 * @typedef {Object} HostMetrics
 * @property {{ usagePercent: number, cores: number }} cpu
 * @property {{ totalMb: number, usedMb: number, freeMb: number, usedPercent: number }} memory
 */

/**
 * @typedef {HostMetrics & { timestamp: string, disk: DiskMetrics }} SystemMetrics
 */
