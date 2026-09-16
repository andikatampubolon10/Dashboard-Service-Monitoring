'use strict';

/**
 * routes/services.route.js
 *
 * REST API routes for service information and per-service metrics.
 *
 * GET /api/services              — List all services with current status
 * GET /api/services/:id          — Single service detail + latest metrics
 * GET /api/services/:id/metrics  — Current metrics snapshot
 * GET /api/services/:id/metrics/history — Historical metrics (query: range, interval)
 * GET /api/services/:id/status   — Quick health check of a service
 */

const { Router } = require('express');
const { SERVICES, getAllActiveServices, getServiceById, setServiceDatabases } = require('../config/services.config');
const { getAllServers } = require('../config/servers.config');
const { probeDatabases } = require('../utils/databaseProber');
const {
  getLatest,
  getStatus,
  getHistory,
  getChartSeries,
  getRequests,
  getDailyMetrics,
} = require('../store/metricsStore');

const router = Router();

// Default database dependencies by service family
const SERVICE_DEFAULT_DBS = {
  'ai-consultation': [
    { id: 'postgresql', name: 'PostgreSQL', defaultPort: 5436 },
    { id: 'redis', name: 'Redis', defaultPort: 6380 },
    { id: 'mongodb', name: 'MongoDB', defaultPort: 27018 },
  ],
  'identity': [
    { id: 'postgresql', name: 'PostgreSQL', defaultPort: 5432 },
    { id: 'redis', name: 'Redis', defaultPort: 6379 },
  ],
  'health-profile': [
    { id: 'postgresql', name: 'PostgreSQL', defaultPort: 5438 },
  ],
  'lifestyle': [
    { id: 'postgresql', name: 'PostgreSQL', defaultPort: 5437 },
  ],
  'live-consult': [
    { id: 'postgresql', name: 'PostgreSQL', defaultPort: 5439 },
    { id: 'redis', name: 'Redis', defaultPort: 6382 },
  ],
  'medical-record': [
    { id: 'postgresql', name: 'PostgreSQL', defaultPort: 5439 },
  ],
  'audit': [
    { id: 'postgresql', name: 'PostgreSQL', defaultPort: 5437 },
  ],
};

/**
 * Resolve and probe databases for a given service.
 * @param {object} service
 * @returns {Promise<{ databases: Array, upDatabases: number, totalDatabases: number }>}
 */
async function resolveAndProbeServiceDatabases(service) {
  if (!service) return { databases: [], upDatabases: 0, totalDatabases: 0 };

  const allServers = getAllServers();
  const matchedServer = allServers.find((srv) => {
    if (srv.id === service.serverId) return true;
    if (Array.isArray(srv.serviceIds) && srv.serviceIds.includes(service.id)) return true;
    if (service.url && srv.host && service.url.includes(srv.host)) return true;
    return false;
  });

  const host = matchedServer?.host || service.serverHost || (service.url?.split('://')[1]?.split(':')[0]) || 'localhost';

  let targetDbs = [];

  // 1. If service has explicitly defined databases, use ONLY those databases
  if (Array.isArray(service.databases) && service.databases.length > 0) {
    const seenKeys = new Set();
    for (const db of service.databases) {
      if (!db || !db.port) continue;
      const key = `${db.id || db.name}-${db.port}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        targetDbs.push({
          id: db.id || `${db.name}-${db.port}`,
          name: db.name || 'Database',
          containerName: db.containerName || undefined,
          host: db.host || host,
          port: db.port,
          server: matchedServer,
        });
      }
    }
  } else if (service.databases === undefined) {
    // 2. Fallback to default DB mapping ONLY for this service family if databases was never set
    const svcKey = Object.keys(SERVICE_DEFAULT_DBS).find((k) => service.id.includes(k));
    if (svcKey) {
      const dbTemplates = SERVICE_DEFAULT_DBS[svcKey];
      targetDbs = dbTemplates.map((tmpl) => ({
        id: tmpl.id,
        name: tmpl.name,
        host,
        port: tmpl.defaultPort,
        server: matchedServer,
      }));
    }
  }
  // Note: If service.databases is explicitly an empty array [], targetDbs remains empty (stateless microservice)

  if (targetDbs.length === 0) {
    return { databases: [], upDatabases: 0, totalDatabases: 0 };
  }

  try {
    const probed = await probeDatabases(targetDbs);
    const upDatabases = probed.filter((d) => d.status === 'UP').length;
    return {
      databases: probed,
      upDatabases,
      totalDatabases: probed.length,
    };
  } catch (err) {
    console.warn(`[services.route] probeDatabases error for ${service.id}:`, err.message);
    return {
      databases: targetDbs.map((d) => ({ ...d, status: 'DOWN', latencyMs: null })),
      upDatabases: 0,
      totalDatabases: targetDbs.length,
    };
  }
}

// ─── GET /api/services ─────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const allActive = getAllActiveServices();
  const services = allActive.map((service) => {
    const latest = getLatest(service.id);
    const status = getStatus(service.id);

    return {
      id: service.id,
      name: service.name,
      description: service.description,
      url: service.url,
      metricsUrl: `${service.url}${service.metricsPath}`,
      stack: service.stack,
      status,
      serverName: service.serverName || (service.isRemote ? 'Remote Server' : 'Server Host'),
      serverHost: service.serverHost || (service.isRemote ? (service.url?.split('://')[1]?.split(':')[0] || 'remote') : 'localhost'),
      isRemote: Boolean(service.isRemote),
      lastScrapedAt: latest?.timestamp || null,
      scrapeLatencyMs: latest?.scrapeLatencyMs || null,
      error: latest?.error || null,
      // Summary metrics for the services table
      summary: latest
        ? {
          reqPerSecond: latest.metrics.throughput?.reqPerSecond ?? 0,
          reqTotal: latest.metrics.throughput?.reqTotal ?? 0,
          errorRatePercent: latest.metrics.errorRate?.percent ?? 0,
          errorCount: (latest.metrics.errorRate?.total5xx ?? 0) + (latest.metrics.errorRate?.total4xx ?? 0),
          p95LatencyMs: latest.metrics.latency?.p95Ms ?? latest.metrics.latency?.p99Ms ?? 0,
          p99LatencyMs: latest.metrics.latency?.p99Ms ?? 0,
          cpuPercent: latest.metrics.cpu?.usagePercent ?? 0,
          memoryRssMb: latest.metrics.memory?.rssMb ?? 0,
        }
        : null,
    };
  });

  res.json({
    success: true,
    total: services.length,
    upCount: services.filter((s) => s.status === 'UP').length,
    downCount: services.filter((s) => s.status === 'DOWN').length,
    services,
  });
});

// ─── GET /api/services/:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const service = getServiceById(req.params.id);
  if (!service) {
    return res.status(404).json({ success: false, error: 'Service not found' });
  }

  const latest = getLatest(service.id);
  const status = getStatus(service.id);
  const dbInfo = await resolveAndProbeServiceDatabases(service);

  res.json({
    success: true,
    service: {
      id: service.id,
      name: service.name,
      description: service.description,
      url: service.url,
      metricsUrl: `${service.url}${service.metricsPath}`,
      stack: service.stack,
      status,
      lastScrapedAt: latest?.timestamp || null,
      scrapeLatencyMs: latest?.scrapeLatencyMs || null,
      error: latest?.error || null,
      metrics: latest?.metrics || null,
      databases: dbInfo.databases,
      upDatabases: dbInfo.upDatabases,
      totalDatabases: dbInfo.totalDatabases,
    },
  });
});

// ─── GET /api/services/:id/databases ──────────────────────────────────────
router.get('/:id/databases', async (req, res) => {
  const service = getServiceById(req.params.id);
  if (!service) {
    return res.status(404).json({ success: false, error: 'Service not found' });
  }

  const dbInfo = await resolveAndProbeServiceDatabases(service);
  res.json({
    success: true,
    serviceId: service.id,
    serviceName: service.name,
    ...dbInfo,
  });
});

// ─── PUT /api/services/:id/databases ──────────────────────────────────────
router.put('/:id/databases', async (req, res) => {
  const service = getServiceById(req.params.id);
  if (!service) {
    return res.status(404).json({ success: false, error: 'Service not found' });
  }

  const databases = Array.isArray(req.body.databases) ? req.body.databases : [];
  const updated = setServiceDatabases(service.id, databases);

  const dbInfo = await resolveAndProbeServiceDatabases(updated || service);
  res.json({
    success: true,
    message: 'Referensi database service berhasil diperbarui',
    serviceId: service.id,
    ...dbInfo,
  });
});

// ─── GET /api/services/:id/metrics ─────────────────────────────────────────
router.get('/:id/metrics', (req, res) => {
  const service = getServiceById(req.params.id);
  if (!service) {
    return res.status(404).json({ success: false, error: 'Service not found' });
  }

  const latest = getLatest(service.id);
  if (!latest) {
    return res.json({
      success: true,
      serviceId: service.id,
      serviceName: service.name,
      status: 'UNKNOWN',
      message: 'No data collected yet — scraping in progress',
      metrics: null,
    });
  }

  res.json({
    success: true,
    serviceId: service.id,
    serviceName: service.name,
    status: latest.status,
    timestamp: latest.timestamp,
    scrapeLatencyMs: latest.scrapeLatencyMs,
    error: latest.error,
    metrics: latest.metrics,
  });
});

// ─── GET /api/services/:id/metrics/history ─────────────────────────────────
router.get('/:id/metrics/history', (req, res) => {
  const service = getServiceById(req.params.id);
  if (!service) {
    return res.status(404).json({ success: false, error: 'Service not found' });
  }

  // Query params: range (seconds, default 3600 = 1h), maxPoints (default 120)
  const rangeSec = parseInt(req.query.range || '3600', 10);
  const maxPoints = parseInt(req.query.maxPoints || '120', 10);

  // Validate
  if (isNaN(rangeSec) || rangeSec < 60 || rangeSec > 86400) {
    return res.status(400).json({
      success: false,
      error: 'range must be between 60 and 86400 seconds',
    });
  }
  if (isNaN(maxPoints) || maxPoints < 10 || maxPoints > 1000) {
    return res.status(400).json({
      success: false,
      error: 'maxPoints must be between 10 and 1000',
    });
  }

  const history = getHistory(service.id, rangeSec, maxPoints);

  res.json({
    success: true,
    serviceId: service.id,
    serviceName: service.name,
    range: `${rangeSec}s`,
    dataPoints: history.length,
    history,
  });
});

// ─── GET /api/services/:id/requests ───────────────────────────────────────
// Table of recent requests matching Image 1
router.get('/:id/requests', (req, res) => {
  const service = getServiceById(req.params.id);
  if (!service) {
    return res.status(404).json({ success: false, error: 'Service not found' });
  }

  const { search, method, status, page, limit } = req.query;
  const result = getRequests(service.id, { search, method, status, page, limit });

  res.json({
    success: true,
    serviceId: service.id,
    serviceName: service.name,
    ...result,
  });
});

// ─── GET /api/services/:id/endpoints ──────────────────────────────────────
// Breakdown of all endpoints/routes discovered in the service
router.get('/:id/endpoints', (req, res) => {
  const service = getServiceById(req.params.id);
  if (!service) {
    return res.status(404).json({ success: false, error: 'Service not found' });
  }

  const latest = getLatest(service.id);
  const routes = latest?.metrics?.routes || [];

  res.json({
    success: true,
    serviceId: service.id,
    serviceName: service.name,
    totalEndpoints: routes.length,
    endpoints: routes,
  });
});

// ─── GET /api/services/:id/charts ─────────────────────────────────────────
// Pre-formatted chart series for Image 2:
// - Latency percentiles (p50, p90, p95, p99, avg)
// - Throughput (req/s)
// - Errors over time
router.get('/:id/charts', (req, res) => {
  const service = getServiceById(req.params.id);
  if (!service) {
    return res.status(404).json({ success: false, error: 'Service not found' });
  }

  const rangeSec = parseInt(req.query.range || '3600', 10);
  const points = parseInt(req.query.points || '60', 10);

  if (isNaN(rangeSec) || rangeSec < 60 || rangeSec > 86400) {
    return res.status(400).json({ success: false, error: 'range must be between 60 and 86400 seconds' });
  }
  if (isNaN(points) || points < 5 || points > 500) {
    return res.status(400).json({ success: false, error: 'points must be between 5 and 500' });
  }

  const series = getChartSeries(service.id, rangeSec, points);

  res.json({
    success: true,
    serviceId: service.id,
    serviceName: service.name,
    ...series,
  });
});

// ─── GET /api/services/:id/daily ──────────────────────────────────────────
// Daily requests volume for "Grafik Request Daily"
router.get('/:id/daily', (req, res) => {
  const service = getServiceById(req.params.id);
  if (!service) {
    return res.status(404).json({ success: false, error: 'Service not found' });
  }

  const days = parseInt(req.query.days || '14', 10);
  const daily = getDailyMetrics(service.id, isNaN(days) ? 14 : days);

  res.json({
    success: true,
    serviceId: service.id,
    serviceName: service.name,
    ...daily,
  });
});

// ─── GET /api/services/:id/status ──────────────────────────────────────────
router.get('/:id/status', (req, res) => {
  const service = getServiceById(req.params.id);
  if (!service) {
    return res.status(404).json({ success: false, error: 'Service not found' });
  }

  const latest = getLatest(service.id);
  const status = getStatus(service.id);

  res.json({
    success: true,
    serviceId: service.id,
    serviceName: service.name,
    status,
    lastCheckedAt: latest?.timestamp || null,
    error: latest?.error || null,
  });
});

module.exports = router;
