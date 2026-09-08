'use strict';

/**
 * prometheusCollector.js
 *
 * Scrapes GET /metrics from a single service, parses the Prometheus text format,
 * and returns computed metrics. Handles errors gracefully — a down service
 * is marked as DOWN, not crashing the whole collector.
 */

const axios = require('axios');
const { parseAndCompute } = require('../parsers/prometheusParser');

// Timeout per scrape request (ms) — must be < poll interval
const SCRAPE_TIMEOUT_MS = 4000;

/**
 * Scrape a service's /metrics endpoint and compute structured metrics.
 *
 * @param {import('../config/services.config').ServiceConfig} service
 * @param {Map|null} prevMetricMap - Previous raw metric map for delta computation
 * @param {number} intervalSeconds - Seconds since last successful scrape
 * @returns {Promise<ScrapeResult>}
 */
async function scrapeService(service, prevMetricMap, intervalSeconds) {
  const url = `${service.url}${service.metricsPath}`;
  const startMs = Date.now();

  try {
    const response = await axios.get(url, {
      timeout: SCRAPE_TIMEOUT_MS,
      // Prometheus text format — accept both text/plain variants
      headers: {
        Accept: 'text/plain; version=0.0.4; charset=utf-8, text/plain',
      },
      // Don't throw on non-2xx for cleaner error handling
      validateStatus: (status) => status < 500,
    });

    if (response.status !== 200) {
      return buildErrorResult(service, `HTTP ${response.status}`, Date.now() - startMs);
    }

    const rawText = typeof response.data === 'string'
      ? response.data
      : String(response.data);

    const { metricMap, computed } = parseAndCompute(
      service.id,
      rawText,
      prevMetricMap,
      intervalSeconds,
    );

    return {
      serviceId: service.id,
      status: 'UP',
      timestamp: new Date().toISOString(),
      scrapeLatencyMs: Date.now() - startMs,
      metricMap,    // Raw map stored for next delta computation
      metrics: computed,
      error: null,
    };
  } catch (err) {
    const message = err.code === 'ECONNREFUSED'
      ? 'Connection refused — service may be down'
      : err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED'
      ? `Scrape timeout after ${SCRAPE_TIMEOUT_MS}ms`
      : err.message || 'Unknown error';

    return buildErrorResult(service, message, Date.now() - startMs);
  }
}

/**
 * Build a DOWN result when scraping fails.
 * Returns zero-value metrics so consumers don't need to null-check.
 *
 * @param {import('../config/services.config').ServiceConfig} service
 * @param {string} errorMessage
 * @param {number} scrapeLatencyMs
 * @returns {ScrapeResult}
 */
function buildErrorResult(service, errorMessage, scrapeLatencyMs) {
  return {
    serviceId: service.id,
    status: 'DOWN',
    timestamp: new Date().toISOString(),
    scrapeLatencyMs,
    metricMap: null,
    metrics: {
      throughput: { reqPerSecond: 0, reqTotal: 0, deltaRequests: 0 },
      latency: { avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, totalObservations: 0 },
      errorRate: { percent: 0, total5xx: 0, total4xx: 0, delta5xx: 0, delta4xx: 0 },
      connections: { openFds: 0, activeSseSessions: 0, activeWsConnections: 0, activeSessions: 0, goGoroutines: 0 },
      cpu: { usagePercent: 0 },
      memory: { rssMb: 0, heapUsedMb: 0, heapTotalMb: 0, externalMb: 0, goAllocMb: 0, goSysMb: 0 },
      custom: {},
    },
    error: errorMessage,
  };
}

module.exports = { scrapeService };

/**
 * @typedef {Object} ScrapeResult
 * @property {string} serviceId
 * @property {'UP'|'DOWN'} status
 * @property {string} timestamp - ISO 8601
 * @property {number} scrapeLatencyMs
 * @property {Map|null} metricMap - Raw parsed metric map (stored for delta)
 * @property {import('../parsers/prometheusParser').ComputedMetrics} metrics
 * @property {string|null} error
 */
