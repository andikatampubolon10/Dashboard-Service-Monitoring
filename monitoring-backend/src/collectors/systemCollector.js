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

const si = require('systeminformation');

/**
 * Cached disk info (refreshed every 60s to avoid overhead).
 * @type {{ used: number, total: number, percent: number }|null}
 */
let cachedDisk = null;
let diskLastFetch = 0;
const DISK_TTL_MS = 60_000;

/**
 * Collect host disk usage.
 * Uses the first disk mount (usually root /). Falls back to total if no root.
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

    // Aggregate total & used bytes across all storage mounts
    const totalBytes = fsList.reduce((acc, f) => acc + (f.size || 0), 0);
    const usedBytes = fsList.reduce((acc, f) => acc + (f.used || 0), 0);

    const totalGb = parseFloat((totalBytes / 1024 / 1024 / 1024).toFixed(2));
    const usedGb = parseFloat((usedBytes / 1024 / 1024 / 1024).toFixed(2));
    const usedPercent = totalGb > 0 ? parseFloat(((usedGb / totalGb) * 100).toFixed(2)) : 0;

    // I/O stats
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
 * Collect host CPU and RAM metrics (not per-process — that comes from /metrics).
 *
 * @returns {Promise<HostMetrics>}
 */
async function getHostMetrics() {
  try {
    const [cpuLoad, mem] = await Promise.all([
      si.currentLoad(),
      si.mem(),
    ]);

    return {
      cpu: {
        usagePercent: parseFloat((cpuLoad.currentLoad || 0).toFixed(2)),
        cores: cpuLoad.cpus?.length || 0,
      },
      memory: {
        totalMb: parseFloat((mem.total / 1024 / 1024).toFixed(2)),
        usedMb: parseFloat((mem.active / 1024 / 1024).toFixed(2)),
        freeMb: parseFloat((mem.available / 1024 / 1024).toFixed(2)),
        usedPercent: parseFloat(
          ((mem.active / mem.total) * 100).toFixed(2),
        ),
      },
    };
  } catch (err) {
    return {
      cpu: { usagePercent: 0, cores: 0 },
      memory: { totalMb: 0, usedMb: 0, freeMb: 0, usedPercent: 0 },
    };
  }
}

/**
 * Collect all system metrics in one call.
 * @returns {Promise<SystemMetrics>}
 */
async function collectSystemMetrics() {
  const [host, disk] = await Promise.all([getHostMetrics(), getDiskMetrics()]);
  return {
    timestamp: new Date().toISOString(),
    ...host,
    disk,
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
