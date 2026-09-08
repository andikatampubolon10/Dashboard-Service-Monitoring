'use strict';

/**
 * collectors/index.js — Collector Orchestrator
 *
 * Coordinates the polling loop:
 *  1. Scrape all 7 service /metrics endpoints in parallel (every N seconds)
 *  2. Collect host system metrics
 *  3. Push results into the in-memory store
 *  4. Emit real-time updates via Socket.IO
 *  5. Detect service status changes and emit status_change events
 */

const cron = require('node-cron');
const { SERVICES } = require('../config/services.config');
const monitoringConfig = require('../config/monitoring.config');
const { scrapeService } = require('./prometheusCollector');
const { collectSystemMetrics } = require('./systemCollector');
const {
  pushMetrics,
  storePrevMetricMap,
  getPrevMetricMap,
  getStatus,
  pushSystemMetrics,
} = require('../store/metricsStore');

/** @type {import('socket.io').Server|null} */
let io = null;

/** Track the timestamp of the last scrape for accurate interval calculation */
let lastScrapeAt = Date.now();

/**
 * Inject the Socket.IO server so the collector can emit real-time events.
 * Must be called before startCollector().
 *
 * @param {import('socket.io').Server} socketServer
 */
function setSocketServer(socketServer) {
  io = socketServer;
}

/**
 * Run one full scrape cycle across all services.
 * Executes all 7 scrapes in parallel for minimum latency.
 */
async function runScrapeCycle() {
  const now = Date.now();
  const intervalSeconds = (now - lastScrapeAt) / 1000;
  lastScrapeAt = now;

  // Scrape all services in parallel
  const scrapePromises = SERVICES.map((service) => {
    const prevMap = getPrevMetricMap(service.id);
    return scrapeService(service, prevMap, intervalSeconds)
      .then((result) => ({ service, result }));
  });

  // Collect system metrics in parallel with service scrapes
  const systemPromise = collectSystemMetrics().catch(() => null);

  const [scrapeResults, systemMetrics] = await Promise.all([
    Promise.all(scrapePromises),
    systemPromise,
  ]);

  // Process service results
  const upServices = [];
  const downServices = [];

  for (const { service, result } of scrapeResults) {
    const prevStatus = getStatus(service.id);

    // Store raw metric map for next delta computation
    if (result.metricMap) {
      storePrevMetricMap(service.id, result.metricMap);
    }

    // Push to circular buffer
    pushMetrics(service.id, result);

    if (result.status === 'UP') {
      upServices.push({ service, result });
    } else {
      downServices.push({ service, result });
    }

    // Emit real-time update to subscribed clients
    if (io) {
      io.emit('metrics:update', {
        serviceId: service.id,
        serviceName: service.name,
        timestamp: result.timestamp,
        status: result.status,
        scrapeLatencyMs: result.scrapeLatencyMs,
        metrics: result.metrics,
        error: result.error,
      });

      // Emit status change event if UP/DOWN state changed
      if (prevStatus !== 'UNKNOWN' && prevStatus !== result.status) {
        io.emit('service:status_change', {
          serviceId: service.id,
          serviceName: service.name,
          from: prevStatus,
          to: result.status,
          timestamp: result.timestamp,
          error: result.error,
        });

        const icon = result.status === 'UP' ? '🟢' : '🔴';
        console.log(
          `[STATUS CHANGE] ${icon} ${service.name}: ${prevStatus} → ${result.status}${result.error ? ` (${result.error})` : ''}`,
        );
      }
    }
  }

  // Print a clean, readable cycle summary
  const upNames = upServices.map((s) => `${s.service.name} (${s.result.scrapeLatencyMs}ms)`).join(', ');
  const downCount = downServices.length;
  console.log(
    `[Scrape] ${upServices.length}/${SERVICES.length} services UP` +
    (upNames ? ` | UP: [${upNames}]` : '') +
    (downCount > 0 ? ` | ${downCount} offline` : ''),
  );

  // Process system metrics
  if (systemMetrics) {
    pushSystemMetrics(systemMetrics);
    if (io) {
      io.emit('system:update', systemMetrics);
    }
  }
}

/**
 * Start the metrics collection scheduler.
 * Uses node-cron to run the scrape cycle at the configured interval.
 *
 * @returns {{ stop: () => void }} Handle to stop the scheduler
 */
function startCollector() {
  const intervalSeconds = monitoringConfig.pollIntervalSeconds;
  console.log(`[Collector] Starting — scraping ${SERVICES.length} services every ${intervalSeconds}s`);
  SERVICES.forEach((s) => console.log(`  → ${s.name} @ ${s.url}${s.metricsPath}`));

  // Run immediately on startup, then on schedule
  runScrapeCycle().catch(console.error);

  // node-cron supports a minimum interval of 1 second (*/N * * * * *)
  // For intervals < 60s, we use the seconds field.
  let task;
  if (intervalSeconds < 60) {
    task = cron.schedule(`*/${intervalSeconds} * * * * *`, () => {
      runScrapeCycle().catch(console.error);
    });
  } else {
    const intervalMinutes = Math.floor(intervalSeconds / 60);
    task = cron.schedule(`*/${intervalMinutes} * * * *`, () => {
      runScrapeCycle().catch(console.error);
    });
  }

  return {
    stop: () => {
      task.stop();
      console.log('[Collector] Stopped.');
    },
  };
}

module.exports = { startCollector, setSocketServer, runScrapeCycle };
