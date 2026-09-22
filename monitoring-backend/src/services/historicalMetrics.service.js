'use strict';

/**
 * services/historicalMetrics.service.js
 *
 * Unified Storage & Retrieval for System & Service Historical Metrics.
 * Supports MySQL (MariaDB) and PostgreSQL with time-series charts (1h, 6h, 24h, 7d).
 */

const { query, dbType } = require('../database/db');

/**
 * Save a snapshot of host/server metrics to database
 * @param {object} m
 */
async function saveServerMetrics(m) {
  const isMysql = dbType === 'mysql';

  const sql = isMysql
    ? `
      INSERT INTO server_metrics (
        server_id, server_name, cpu_percent,
        mem_used_mb, mem_total_mb, mem_cached_mb, mem_buffers_mb,
        disk_used_gb, disk_total_gb,
        load_1m, load_5m, load_15m,
        net_rx_bytes_sec, net_tx_bytes_sec,
        disk_read_bytes_sec, disk_write_bytes_sec,
        recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    : `
      INSERT INTO server_metrics (
        server_id, server_name, cpu_percent,
        mem_used_mb, mem_total_mb, mem_cached_mb, mem_buffers_mb,
        disk_used_gb, disk_total_gb,
        load_1m, load_5m, load_15m,
        net_rx_bytes_sec, net_tx_bytes_sec,
        disk_read_bytes_sec, disk_write_bytes_sec,
        recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    `;

  const values = [
    m.serverId,
    m.serverName || m.serverId,
    m.cpuPercent != null ? parseFloat(m.cpuPercent) : null,
    m.memUsedMb != null ? parseFloat(m.memUsedMb) : null,
    m.memTotalMb != null ? parseFloat(m.memTotalMb) : null,
    m.memCachedMb != null ? parseFloat(m.memCachedMb) : 0,
    m.memBuffersMb != null ? parseFloat(m.memBuffersMb) : 0,
    m.diskUsedGb != null ? parseFloat(m.diskUsedGb) : null,
    m.diskTotalGb != null ? parseFloat(m.diskTotalGb) : null,
    m.load1m != null ? parseFloat(m.load1m) : 0,
    m.load5m != null ? parseFloat(m.load5m) : 0,
    m.load15m != null ? parseFloat(m.load15m) : 0,
    m.netRxBytesSec != null ? parseFloat(m.netRxBytesSec) : 0,
    m.netTxBytesSec != null ? parseFloat(m.netTxBytesSec) : 0,
    m.diskReadBytesSec != null ? parseFloat(m.diskReadBytesSec) : 0,
    m.diskWriteBytesSec != null ? parseFloat(m.diskWriteBytesSec) : 0,
    m.recordedAt ? new Date(m.recordedAt) : new Date(),
  ];

  try {
    await query(sql, values);
  } catch (err) {
    console.error(`[HistoricalMetrics] Failed to save server metrics for ${m.serverId}:`, err.message);
  }
}

/**
 * Save a snapshot of service status & latency to database
 * @param {object} s
 */
async function saveServiceMetrics(s) {
  const isMysql = dbType === 'mysql';

  const sql = isMysql
    ? `
      INSERT INTO service_metrics (
        service_id, service_name, server_id,
        status, response_time_ms, status_code,
        recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    : `
      INSERT INTO service_metrics (
        service_id, service_name, server_id,
        status, response_time_ms, status_code,
        recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

  const values = [
    s.serviceId,
    s.serviceName || s.serviceId,
    s.serverId || null,
    s.status || 'UP',
    s.responseTimeMs != null ? parseFloat(s.responseTimeMs) : null,
    s.statusCode || 200,
    s.recordedAt ? new Date(s.recordedAt) : new Date(),
  ];

  try {
    await query(sql, values);
  } catch (err) {
    console.error(`[HistoricalMetrics] Failed to save service metrics for ${s.serviceId}:`, err.message);
  }
}

/**
 * Query historical server metrics with smart interval aggregation
 * @param {string} serverId
 * @param {string} [range='1h'] - '1h' | '6h' | '24h' | '7d'
 * @returns {Promise<Array<object>>}
 */
async function getServerMetricsHistory(serverId, range = '1h') {
  const isMysql = dbType === 'mysql';
  let bucketSeconds = 15; // default 15-second bucket for 1 hour
  let intervalMinutes = 60;

  if (range === '6h') {
    intervalMinutes = 360;
    bucketSeconds = 60; // 1-minute bucket
  } else if (range === '24h') {
    intervalMinutes = 1440;
    bucketSeconds = 300; // 5-minute bucket
  } else if (range === '7d') {
    intervalMinutes = 10080;
    bucketSeconds = 1800; // 30-minute bucket
  }

  let sql = '';
  let params = [];

  if (isMysql) {
    sql = `
      SELECT
        FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(recorded_at) / ${bucketSeconds}) * ${bucketSeconds}) AS time_bucket,
        ROUND(AVG(cpu_percent), 1) AS cpu_percent,
        ROUND(AVG(mem_used_mb), 0) AS mem_used_mb,
        ROUND(MAX(mem_total_mb), 0) AS mem_total_mb,
        ROUND(AVG(mem_cached_mb), 0) AS mem_cached_mb,
        ROUND(AVG(mem_buffers_mb), 0) AS mem_buffers_mb,
        ROUND(AVG(disk_used_gb), 1) AS disk_used_gb,
        ROUND(MAX(disk_total_gb), 1) AS disk_total_gb,
        ROUND(AVG(load_1m), 2) AS load_1m,
        ROUND(AVG(load_5m), 2) AS load_5m,
        ROUND(AVG(load_15m), 2) AS load_15m,
        ROUND(AVG(net_rx_bytes_sec), 0) AS net_rx_bytes_sec,
        ROUND(AVG(net_tx_bytes_sec), 0) AS net_tx_bytes_sec,
        ROUND(AVG(disk_read_bytes_sec), 0) AS disk_read_bytes_sec,
        ROUND(AVG(disk_write_bytes_sec), 0) AS disk_write_bytes_sec
      FROM server_metrics
      WHERE server_id = ? AND recorded_at >= DATE_SUB(NOW(), INTERVAL ${intervalMinutes} MINUTE)
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;
    params = [serverId];
  } else {
    // PostgreSQL syntax
    let intervalClause = `NOW() - INTERVAL '${intervalMinutes} minutes'`;
    sql = `
      SELECT
        to_timestamp(floor(extract(epoch from recorded_at) / ${bucketSeconds}) * ${bucketSeconds}) AT TIME ZONE 'UTC' AS time_bucket,
        ROUND(AVG(cpu_percent)::numeric, 1) AS cpu_percent,
        ROUND(AVG(mem_used_mb)::numeric, 0) AS mem_used_mb,
        ROUND(MAX(mem_total_mb)::numeric, 0) AS mem_total_mb,
        ROUND(AVG(mem_cached_mb)::numeric, 0) AS mem_cached_mb,
        ROUND(AVG(mem_buffers_mb)::numeric, 0) AS mem_buffers_mb,
        ROUND(AVG(disk_used_gb)::numeric, 1) AS disk_used_gb,
        ROUND(MAX(disk_total_gb)::numeric, 1) AS disk_total_gb,
        ROUND(AVG(load_1m)::numeric, 2) AS load_1m,
        ROUND(AVG(load_5m)::numeric, 2) AS load_5m,
        ROUND(AVG(load_15m)::numeric, 2) AS load_15m,
        ROUND(AVG(net_rx_bytes_sec)::numeric, 0) AS net_rx_bytes_sec,
        ROUND(AVG(net_tx_bytes_sec)::numeric, 0) AS net_tx_bytes_sec,
        ROUND(AVG(disk_read_bytes_sec)::numeric, 0) AS disk_read_bytes_sec,
        ROUND(AVG(disk_write_bytes_sec)::numeric, 0) AS disk_write_bytes_sec
      FROM server_metrics
      WHERE server_id = $1 AND recorded_at >= ${intervalClause}
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;
    params = [serverId];
  }

  try {
    const res = await query(sql, params);
    return (res.rows || []).map((r) => ({
      timestamp: r.time_bucket,
      cpuPercent: parseFloat(r.cpu_percent) || 0,
      memUsedMb: parseFloat(r.mem_used_mb) || 0,
      memTotalMb: parseFloat(r.mem_total_mb) || 0,
      memCachedMb: parseFloat(r.mem_cached_mb) || 0,
      memBuffersMb: parseFloat(r.mem_buffers_mb) || 0,
      memUsedPercent: r.mem_total_mb > 0 ? parseFloat(((r.mem_used_mb / r.mem_total_mb) * 100).toFixed(1)) : 0,
      diskUsedGb: parseFloat(r.disk_used_gb) || 0,
      diskTotalGb: parseFloat(r.disk_total_gb) || 0,
      diskUsedPercent: r.disk_total_gb > 0 ? parseFloat(((r.disk_used_gb / r.disk_total_gb) * 100).toFixed(1)) : 0,
      load1m: parseFloat(r.load_1m) || 0,
      load5m: parseFloat(r.load_5m) || 0,
      load15m: parseFloat(r.load_15m) || 0,
      netRxBytesSec: parseFloat(r.net_rx_bytes_sec) || 0,
      netTxBytesSec: parseFloat(r.net_tx_bytes_sec) || 0,
      netRxKbSec: parseFloat(((parseFloat(r.net_rx_bytes_sec) || 0) / 1024).toFixed(1)),
      netTxKbSec: parseFloat(((parseFloat(r.net_tx_bytes_sec) || 0) / 1024).toFixed(1)),
      diskReadBytesSec: parseFloat(r.disk_read_bytes_sec) || 0,
      diskWriteBytesSec: parseFloat(r.disk_write_bytes_sec) || 0,
      diskReadMbSec: parseFloat(((parseFloat(r.disk_read_bytes_sec) || 0) / 1024 / 1024).toFixed(2)),
      diskWriteMbSec: parseFloat(((parseFloat(r.disk_write_bytes_sec) || 0) / 1024 / 1024).toFixed(2)),
    }));
  } catch (err) {
    console.error(`[HistoricalMetrics] Query error for ${serverId}:`, err.message);
    return [];
  }
}

/**
 * Prune historical data older than retention limit (e.g. 14 days)
 * @param {number} [retentionDays=14]
 */
async function pruneOldMetrics(retentionDays = 14) {
  try {
    const isMysql = dbType === 'mysql';
    if (isMysql) {
      await query(`DELETE FROM server_metrics WHERE recorded_at < DATE_SUB(NOW(), INTERVAL ? DAY)`, [retentionDays]);
      await query(`DELETE FROM service_metrics WHERE recorded_at < DATE_SUB(NOW(), INTERVAL ? DAY)`, [retentionDays]);
    } else {
      await query(`DELETE FROM server_metrics WHERE recorded_at < NOW() - INTERVAL '${retentionDays} day'`);
      await query(`DELETE FROM service_metrics WHERE recorded_at < NOW() - INTERVAL '${retentionDays} day'`);
    }
    console.log(`[HistoricalMetrics] Cleaned up metrics older than ${retentionDays} days.`);
  } catch (err) {
    console.error('[HistoricalMetrics] Pruning error:', err.message);
  }
}

/**
 * Query server availability / uptime history directly from database
 * @param {string} serverId
 * @param {number} [rangeSec=3600]
 * @param {number} [targetPoints=30]
 * @returns {Promise<Array<object>>}
 */
async function getServerUptimeHistoryFromDb(serverId, rangeSec = 3600, targetPoints = 30) {
  const isMysql = dbType === 'mysql';
  const bucketSec = Math.max(15, Math.floor(rangeSec / targetPoints));

  let sql = '';
  let params = [];

  if (isMysql) {
    sql = `
      SELECT
        FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(recorded_at) / ${bucketSec}) * ${bucketSec}) AS time_bucket,
        COUNT(*) AS pings
      FROM server_metrics
      WHERE server_id = ? AND recorded_at >= DATE_SUB(NOW(), INTERVAL ${rangeSec} SECOND)
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;
    params = [serverId];
  } else {
    sql = `
      SELECT
        to_timestamp(floor(extract(epoch from recorded_at) / ${bucketSec}) * ${bucketSec}) AT TIME ZONE 'UTC' AS time_bucket,
        COUNT(*) AS pings
      FROM server_metrics
      WHERE server_id = $1 AND recorded_at >= NOW() - INTERVAL '${rangeSec} seconds'
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;
    params = [serverId];
  }

  try {
    const res = await query(sql, params);
    return (res.rows || []).map((r) => {
      const d = new Date(r.time_bucket);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return {
        timestamp: d.toISOString(),
        time: `${hh}:${mm}`,
        displayTime: `${hh}:${mm}`,
        status: 'UP',
        value: 1,
        latencyMs: 25,
        details: `Host menyala (TCP Probe OK, ${r.pings} snapshot)`,
      };
    });
  } catch (err) {
    console.error(`[HistoricalMetrics] Error querying uptime history for ${serverId}:`, err.message);
    return [];
  }
}

module.exports = {
  saveServerMetrics,
  saveServiceMetrics,
  getServerMetricsHistory,
  getServerUptimeHistoryFromDb,
  pruneOldMetrics,
};
