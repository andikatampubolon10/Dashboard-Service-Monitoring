'use strict';

/**
 * routes/metrics.route.js
 *
 * Aggregated metrics endpoints — overview of all services at once.
 *
 * GET /api/metrics/summary  — All services' latest metrics in one response
 * GET /api/metrics/alerts   — Services exceeding alert thresholds
 * GET /api/metrics/system   — Host-level system metrics (CPU, RAM, Disk)
 * GET /api/metrics/system/history — System metrics history
 */

const { Router } = require('express');
const { SERVICES, getAllActiveServices } = require('../config/services.config');
const monitoringConfig = require('../config/monitoring.config');
const {
  getLatest,
  getStatus,
  getLatestSystemMetrics,
  getSystemHistory,
} = require('../store/metricsStore');

const router = Router();

// ─── GET /api/metrics/summary ──────────────────────────────────────────────
router.get('/summary', (req, res) => {
  const allActive = getAllActiveServices();
  const services = allActive.map((service) => {
    const latest = getLatest(service.id);
    const status = getStatus(service.id);
    const m = latest?.metrics;

    return {
      id: service.id,
      name: service.name,
      stack: service.stack,
      status,
      timestamp: latest?.timestamp || null,
      scrapeLatencyMs: latest?.scrapeLatencyMs || null,
      error: latest?.error || null,
      // All key metrics in flat structure for dashboard charts
      reqPerSecond: m?.throughput?.reqPerSecond ?? 0,
      reqTotal: m?.throughput?.reqTotal ?? 0,
      errorRatePercent: m?.errorRate?.percent ?? 0,
      total5xx: m?.errorRate?.total5xx ?? 0,
      total4xx: m?.errorRate?.total4xx ?? 0,
      latencyAvgMs: m?.latency?.avgMs ?? 0,
      latencyP50Ms: m?.latency?.p50Ms ?? 0,
      latencyP95Ms: m?.latency?.p95Ms ?? 0,
      latencyP99Ms: m?.latency?.p99Ms ?? 0,
      cpuPercent: m?.cpu?.usagePercent ?? 0,
      memoryRssMb: m?.memory?.rssMb ?? 0,
      memoryHeapUsedMb: m?.memory?.heapUsedMb ?? 0,
      openFds: m?.connections?.openFds ?? 0,
      activeConnections: (m?.connections?.activeWsConnections ?? 0) +
                         (m?.connections?.activeSseSessions ?? 0),
    };
  });

  const upCount = services.filter((s) => s.status === 'UP').length;
  const downCount = services.filter((s) => s.status === 'DOWN').length;

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    overview: {
      total: services.length,
      up: upCount,
      down: downCount,
      unknown: services.length - upCount - downCount,
    },
    services,
  });
});

// ─── GET /api/metrics/alerts ───────────────────────────────────────────────
router.get('/alerts', (req, res) => {
  const thresholds = monitoringConfig.alerts;
  const alerts = [];

  for (const service of SERVICES) {
    const latest = getLatest(service.id);
    const status = getStatus(service.id);

    // Service down alert
    if (status === 'DOWN') {
      alerts.push({
        serviceId: service.id,
        serviceName: service.name,
        severity: 'critical',
        type: 'SERVICE_DOWN',
        message: `${service.name} is DOWN`,
        value: null,
        threshold: null,
        timestamp: latest?.timestamp || new Date().toISOString(),
        error: latest?.error,
      });
      continue;
    }

    if (!latest?.metrics) continue;
    const m = latest.metrics;

    // CPU threshold
    const cpu = m.cpu?.usagePercent ?? 0;
    if (cpu > thresholds.cpuPercent) {
      alerts.push({
        serviceId: service.id,
        serviceName: service.name,
        severity: cpu > thresholds.cpuPercent * 1.25 ? 'critical' : 'warning',
        type: 'HIGH_CPU',
        message: `CPU usage at ${cpu}% (threshold: ${thresholds.cpuPercent}%)`,
        value: cpu,
        threshold: thresholds.cpuPercent,
        timestamp: latest.timestamp,
      });
    }

    // Error rate threshold
    const errorRate = m.errorRate?.percent ?? 0;
    if (errorRate > thresholds.errorRatePercent) {
      alerts.push({
        serviceId: service.id,
        serviceName: service.name,
        severity: errorRate > thresholds.errorRatePercent * 2 ? 'critical' : 'warning',
        type: 'HIGH_ERROR_RATE',
        message: `Error rate at ${errorRate}% (threshold: ${thresholds.errorRatePercent}%)`,
        value: errorRate,
        threshold: thresholds.errorRatePercent,
        timestamp: latest.timestamp,
      });
    }

    // P99 latency threshold
    const p99 = m.latency?.p99Ms ?? 0;
    if (p99 > thresholds.latencyP99Ms) {
      alerts.push({
        serviceId: service.id,
        serviceName: service.name,
        severity: p99 > thresholds.latencyP99Ms * 2 ? 'critical' : 'warning',
        type: 'HIGH_LATENCY',
        message: `P99 latency at ${p99}ms (threshold: ${thresholds.latencyP99Ms}ms)`,
        value: p99,
        threshold: thresholds.latencyP99Ms,
        timestamp: latest.timestamp,
      });
    }
  }

  // Sort by severity: critical first
  alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1 };
    return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
  });

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    alertCount: alerts.length,
    criticalCount: alerts.filter((a) => a.severity === 'critical').length,
    warningCount: alerts.filter((a) => a.severity === 'warning').length,
    thresholds,
    alerts,
  });
});

// ─── GET /api/metrics/system ───────────────────────────────────────────────
router.get('/system', (req, res) => {
  const system = getLatestSystemMetrics();
  res.json({
    success: true,
    timestamp: system?.timestamp || new Date().toISOString(),
    system: system || null,
  });
});

// ─── GET /api/metrics/system/history ──────────────────────────────────────
router.get('/system/history', (req, res) => {
  const rangeSec = parseInt(req.query.range || '3600', 10);
  const maxPoints = parseInt(req.query.maxPoints || '120', 10);

  if (isNaN(rangeSec) || rangeSec < 60 || rangeSec > 86400) {
    return res.status(400).json({ success: false, error: 'range must be 60–86400 seconds' });
  }

  const history = getSystemHistory(rangeSec, maxPoints);
  res.json({
    success: true,
    range: `${rangeSec}s`,
    dataPoints: history.length,
    history,
  });
});

module.exports = router;
