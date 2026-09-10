'use strict';

/**
 * routes/health.route.js
 *
 * Health check endpoint for the monitoring backend itself.
 * GET /health - Returns backend health status, uptime, system memory, and service count.
 */

const { Router } = require('express');
const { SERVICES, getAllActiveServices } = require('../config/services.config');
const { getAllLatest, getStatus } = require('../store/metricsStore');

const router = Router();
const startTime = Date.now();

router.get('/', (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const allLatest = getAllLatest();
  const allActive = getAllActiveServices();
  const upCount = allActive.filter((s) => getStatus(s.id) === 'UP').length;

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    memoryUsage: process.memoryUsage(),
    monitoring: {
      totalServices: allActive.length,
      servicesUp: upCount,
      servicesDown: allActive.length - upCount,
      hasMetricsData: Object.keys(allLatest).length > 0,
    },
  });
});

module.exports = router;
