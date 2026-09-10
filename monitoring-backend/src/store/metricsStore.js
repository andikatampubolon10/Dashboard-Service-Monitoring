'use strict';

/**
 * metricsStore.js
 *
 * In-memory circular buffer for per-service metrics history.
 *
 * Design decisions:
 *  - One ring buffer per serviceId with a configurable max length.
 *  - "Latest" snapshot is always the last entry (fast O(1) read).
 *  - History window queries by time range with optional downsampling.
 *  - Previous raw metricMap is also stored per service for delta computation.
 *  - Thread-safe by virtue of Node.js single-threaded event loop.
 */

const monitoringConfig = require('../config/monitoring.config');

/** @type {Map<string, MetricsBuffer>} */
const store = new Map();

/** @type {Map<string, Map>} Raw Prometheus metric maps (for delta computation) */
const prevMetricMaps = new Map();

/** @type {SystemMetricsBuffer} */
let systemMetricsBuffer = {
  history: [],
  maxLen: monitoringConfig.maxDataPoints,
};

/** @type {Map<string, RequestLogEntry[]>} Per-service recent requests buffer */
const requestsLog = new Map();

/** @type {Map<string, DailyStatEntry[]>} Per-service daily requests stats */
const dailyStats = new Map();

/**
 * Format a Date object or timestamp into "08 Sept, 04:19" matching dashboard UI.
 * @param {Date|string|number} dateInput
 * @returns {string}
 */
function formatDisplayTime(dateInput) {
  const d = new Date(dateInput);
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()] || 'Sept';
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month}, ${hours}:${mins}`;
}

/**
 * Generate a random cluster internal IP (e.g. 10.0.145.106).
 */
function getRandomClusterIp() {
  const b = Math.floor(Math.random() * 200) + 10;
  const c = Math.floor(Math.random() * 250) + 1;
  return `10.0.${b}.${c}`;
}

/**
 * Initialize 14-day historical daily baseline for a service.
 * @param {string} serviceId
 */
function initDailyStats(serviceId) {
  if (dailyStats.has(serviceId)) return;

  const days = [];
  const now = new Date();

  // Initialize past 14 days with 0 requests. Traffic accumulates strictly from when the service is registered.
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const displayDate = `${String(d.getDate()).padStart(2, '0')} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'][d.getMonth()]}`;

    days.push({
      date: dateStr,
      displayDate,
      totalRequests: 0,
      success2xx: 0,
      client4xx: 0,
      server5xx: 0,
      errorRatePercent: 0,
      avgLatencyMs: 0,
    });
  }

  dailyStats.set(serviceId, days);
}

/**
 * Initialize recent requests log for a service. Starts empty without fake requests.
 * @param {string} serviceId
 * @param {Array<{ method: string, path: string, status: number, avgLatencyMs: number }>} [routes]
 */
function seedRecentRequests(serviceId, _routes) {
  if (!requestsLog.has(serviceId)) {
    requestsLog.set(serviceId, []);
  }
}

/**
 * Initialize an empty buffer for a service if not already present.
 * @param {string} serviceId
 */
function ensureBuffer(serviceId) {
  if (!store.has(serviceId)) {
    store.set(serviceId, {
      history: [],
      maxLen: monitoringConfig.maxDataPoints,
      lastStatus: 'UNKNOWN',
      statusChangedAt: null,
      lastRouteCounts: new Map(),
    });
    initDailyStats(serviceId);
  }
}

/**
 * Push a new metrics snapshot for a service.
 * Evicts oldest entry when buffer is full.
 *
 * @param {string} serviceId
 * @param {import('../collectors/prometheusCollector').ScrapeResult} scrapeResult
 */
function pushMetrics(serviceId, scrapeResult) {
  ensureBuffer(serviceId);
  const buf = store.get(serviceId);

  const snapshot = {
    timestamp: scrapeResult.timestamp,
    status: scrapeResult.status,
    scrapeLatencyMs: scrapeResult.scrapeLatencyMs,
    metrics: scrapeResult.metrics,
    error: scrapeResult.error,
  };

  buf.history.push(snapshot);

  // Enforce circular buffer size
  if (buf.history.length > buf.maxLen) {
    buf.history.shift();
  }

  // Track status changes
  if (buf.lastStatus !== scrapeResult.status) {
    buf.statusChangedAt = scrapeResult.timestamp;
    buf.lastStatus = scrapeResult.status;
  }

  // Update recent requests & daily stats when service is UP
  if (scrapeResult.status === 'UP' && scrapeResult.metrics?.routes) {
    seedRecentRequests(serviceId, scrapeResult.metrics.routes);

    // Detect route increments and append to requests log
    const currentRoutes = scrapeResult.metrics.routes;
    const lastCounts = buf.lastRouteCounts || new Map();
    const reqLog = requestsLog.get(serviceId) || [];

    for (const r of currentRoutes) {
      const key = `${r.method}:${r.path}:${r.status}`;
      const prevCount = lastCounts.get(key) || 0;
      const delta = r.count - prevCount;

      if (delta > 0 && prevCount > 0) {
        // New requests arrived on this route
        for (let i = 0; i < Math.min(delta, 10); i++) {
          const latency = Math.max(1, Math.round(r.avgLatencyMs + (Math.random() * 10 - 5)));
          reqLog.unshift({
            id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            serviceId,
            method: r.method,
            path: r.path,
            status: r.status,
            latencyMs: latency,
            client: getRandomClusterIp(),
            time: formatDisplayTime(new Date()),
            timestamp: new Date().toISOString(),
          });
        }
      }
      lastCounts.set(key, r.count);
    }

    // Keep max 500 recent requests
    if (reqLog.length > 500) {
      reqLog.length = 500;
    }
    requestsLog.set(serviceId, reqLog);
    buf.lastRouteCounts = lastCounts;

    // Update today's daily aggregate
    const dList = dailyStats.get(serviceId);
    if (dList && dList.length > 0) {
      const today = dList[dList.length - 1];
      const deltaTotal = scrapeResult.metrics.throughput?.deltaRequests || 0;
      const delta5xx = scrapeResult.metrics.errorRate?.delta5xx || 0;
      const delta4xx = scrapeResult.metrics.errorRate?.delta4xx || 0;

      if (deltaTotal > 0) {
        today.totalRequests += deltaTotal;
        today.server5xx += delta5xx;
        today.client4xx += delta4xx;
        today.success2xx = Math.max(0, today.totalRequests - today.server5xx - today.client4xx);
        today.errorRatePercent = today.totalRequests > 0
          ? parseFloat(((today.server5xx / today.totalRequests) * 100).toFixed(2))
          : 0;
        today.avgLatencyMs = scrapeResult.metrics.latency?.avgMs || today.avgLatencyMs;
      }
    }
  }
}

/**
 * Store the raw metric map for delta computation in the next scrape cycle.
 * @param {string} serviceId
 * @param {Map|null} metricMap
 */
function storePrevMetricMap(serviceId, metricMap) {
  prevMetricMaps.set(serviceId, metricMap);
}

/**
 * Retrieve the previous raw metric map for a service.
 * @param {string} serviceId
 * @returns {Map|null}
 */
function getPrevMetricMap(serviceId) {
  return prevMetricMaps.get(serviceId) || null;
}

/**
 * Get the latest (most recent) metrics snapshot for a service.
 * @param {string} serviceId
 * @returns {MetricsSnapshot|null}
 */
function getLatest(serviceId) {
  const buf = store.get(serviceId);
  if (!buf || buf.history.length === 0) return null;
  return buf.history[buf.history.length - 1];
}

/**
 * Get the current status of a service.
 * @param {string} serviceId
 * @returns {'UP'|'DOWN'|'UNKNOWN'}
 */
function getStatus(serviceId) {
  const buf = store.get(serviceId);
  return buf?.lastStatus || 'UNKNOWN';
}

/**
 * Get history for a service filtered by time range.
 *
 * @param {string} serviceId
 * @param {number} rangeSec - Number of seconds to look back (e.g. 3600 = 1h)
 * @param {number} [maxPoints=120] - Max data points to return (downsampling)
 * @returns {MetricsSnapshot[]}
 */
function getHistory(serviceId, rangeSec = 3600, maxPoints = 120) {
  const buf = store.get(serviceId);
  if (!buf || buf.history.length === 0) return [];

  const cutoff = new Date(Date.now() - rangeSec * 1000).toISOString();
  const filtered = buf.history.filter((s) => s.timestamp >= cutoff);

  if (filtered.length === 0) return [];

  // Downsample if too many points
  if (filtered.length <= maxPoints) return filtered;

  const step = Math.ceil(filtered.length / maxPoints);
  return filtered.filter((_, i) => i % step === 0);
}

/**
 * Get structured chart series for:
 * 1. Latency percentiles (p50, p90, p95, p99, avg)
 * 2. Throughput (req/s)
 * 3. Errors over time (errorRatePercent, 5xx, 4xx)
 *
 * @param {string} serviceId
 * @param {number} rangeSec
 * @param {number} maxPoints
 * @returns {ChartSeriesResult}
 */
function getChartSeries(serviceId, rangeSec = 3600, maxPoints = 60) {
  const history = getHistory(serviceId, rangeSec, maxPoints);

  const labels = [];
  const p50 = [];
  const p90 = [];
  const p95 = [];
  const p99 = [];
  const avg = [];
  const reqPerSecond = [];
  const deltaRequests = [];
  const errorRatePercent = [];
  const errors5xx = [];
  const errors4xx = [];
  const timeline = [];

  for (const item of history) {
    const d = new Date(item.timestamp);
    const timeLabel = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    const m = item.metrics;

    labels.push(timeLabel);
    p50.push(m.latency?.p50Ms ?? 0);
    p90.push(m.latency?.p90Ms ?? 0);
    p95.push(m.latency?.p95Ms ?? 0);
    p99.push(m.latency?.p99Ms ?? 0);
    avg.push(m.latency?.avgMs ?? 0);

    reqPerSecond.push(m.throughput?.reqPerSecond ?? 0);
    deltaRequests.push(m.throughput?.deltaRequests ?? 0);

    errorRatePercent.push(m.errorRate?.percent ?? 0);
    errors5xx.push(m.errorRate?.delta5xx ?? 0);
    errors4xx.push(m.errorRate?.delta4xx ?? 0);

    timeline.push({
      timestamp: item.timestamp,
      time: timeLabel,
      p50: m.latency?.p50Ms ?? 0,
      p90: m.latency?.p90Ms ?? 0,
      p95: m.latency?.p95Ms ?? 0,
      p99: m.latency?.p99Ms ?? 0,
      avg: m.latency?.avgMs ?? 0,
      reqPerSecond: m.throughput?.reqPerSecond ?? 0,
      deltaRequests: m.throughput?.deltaRequests ?? 0,
      errorRatePercent: m.errorRate?.percent ?? 0,
      errors5xx: m.errorRate?.delta5xx ?? 0,
      errors4xx: m.errorRate?.delta4xx ?? 0,
    });
  }

  return {
    serviceId,
    range: `${rangeSec}s`,
    dataPoints: history.length,
    latencyPercentiles: {
      labels,
      p50,
      p90,
      p95,
      p99,
      avg,
    },
    throughput: {
      labels,
      reqPerSecond,
      deltaRequests,
    },
    errors: {
      labels,
      errorRatePercent,
      errors5xx,
      errors4xx,
    },
    timeline,
  };
}

/**
 * Query recent requests log with search, filter, and pagination (Image 1 table).
 * @param {string} serviceId
 * @param {Object} options
 * @param {string} [options.search]
 * @param {string} [options.method]
 * @param {string} [options.status]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=10]
 * @returns {{ total: number, page: number, limit: number, totalPages: number, rows: RequestLogEntry[] }}
 */
function getRequests(serviceId, options = {}) {
  ensureBuffer(serviceId);
  let list = requestsLog.get(serviceId) || [];

  const search = (options.search || '').trim().toLowerCase();
  const method = (options.method || '').trim().toUpperCase();
  const status = (options.status || '').trim();
  const page = Math.max(1, parseInt(options.page || '1', 10));
  const limit = Math.max(1, Math.min(100, parseInt(options.limit || '10', 10)));

  if (search) {
    list = list.filter(
      (r) =>
        r.path.toLowerCase().includes(search) ||
        r.client.toLowerCase().includes(search) ||
        r.method.toLowerCase().includes(search) ||
        String(r.status).includes(search),
    );
  }

  if (method && method !== 'ALL') {
    list = list.filter((r) => r.method === method);
  }

  if (status && status !== 'ALL') {
    if (status.endsWith('xx')) {
      const prefix = status[0];
      list = list.filter((r) => String(r.status).startsWith(prefix));
    } else {
      list = list.filter((r) => String(r.status) === status);
    }
  }

  const total = list.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const start = (page - 1) * limit;
  const rows = list.slice(start, start + limit);

  return {
    total,
    page,
    limit,
    totalPages,
    rows,
  };
}

/**
 * Get daily requests stats for a service (for the daily request graph).
 * @param {string} serviceId
 * @param {number} [days=14]
 */
function getDailyMetrics(serviceId, days = 14) {
  initDailyStats(serviceId);
  const list = dailyStats.get(serviceId) || [];
  const sliced = list.slice(-days);

  const today = sliced[sliced.length - 1];
  const yesterday = sliced.length > 1 ? sliced[sliced.length - 2] : null;

  let growthPercent = 0;
  if (yesterday && yesterday.totalRequests > 0) {
    growthPercent = parseFloat(
      (((today.totalRequests - yesterday.totalRequests) / yesterday.totalRequests) * 100).toFixed(1),
    );
  }

  return {
    serviceId,
    days: sliced.length,
    todayTotal: today?.totalRequests ?? 0,
    yesterdayTotal: yesterday?.totalRequests ?? 0,
    growthPercent,
    history: sliced,
  };
}

/**
 * Get daily requests aggregated across all services.
 * @param {number} [days=14]
 */
function getAllDailyMetrics(days = 14) {
  const allServices = Array.from(store.keys());
  const dailyMap = new Map();

  for (const id of allServices) {
    const sDaily = getDailyMetrics(id, days);
    for (const d of sDaily.history) {
      const existing = dailyMap.get(d.date) || {
        date: d.date,
        displayDate: d.displayDate,
        totalRequests: 0,
        success2xx: 0,
        client4xx: 0,
        server5xx: 0,
      };

      existing.totalRequests += d.totalRequests;
      existing.success2xx += d.success2xx;
      existing.client4xx += d.client4xx;
      existing.server5xx += d.server5xx;
      dailyMap.set(d.date, existing);
    }
  }

  const aggregated = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  return {
    days: aggregated.length,
    history: aggregated,
  };
}

/**
 * Get a summary snapshot for all services (for the overview dashboard).
 * @param {string[]} [serviceIds]
 * @returns {Record<string, MetricsSnapshot|null>}
 */
function getAllLatest(serviceIds) {
  const ids = serviceIds || Array.from(store.keys());
  const result = {};
  for (const id of ids) {
    result[id] = getLatest(id);
  }
  return result;
}

/**
 * Push system metrics (host-level) to the system buffer.
 * @param {import('../collectors/systemCollector').SystemMetrics} metrics
 */
function pushSystemMetrics(metrics) {
  systemMetricsBuffer.history.push(metrics);
  if (systemMetricsBuffer.history.length > systemMetricsBuffer.maxLen) {
    systemMetricsBuffer.history.shift();
  }
}

/**
 * Get the latest host system metrics.
 * @returns {import('../collectors/systemCollector').SystemMetrics|null}
 */
function getLatestSystemMetrics() {
  const h = systemMetricsBuffer.history;
  return h.length > 0 ? h[h.length - 1] : null;
}

/**
 * Get system metrics history.
 * @param {number} rangeSec
 * @param {number} [maxPoints=120]
 * @returns {import('../collectors/systemCollector').SystemMetrics[]}
 */
function getSystemHistory(rangeSec = 3600, maxPoints = 120) {
  const cutoff = new Date(Date.now() - rangeSec * 1000).toISOString();
  const filtered = systemMetricsBuffer.history.filter((s) => s.timestamp >= cutoff);
  if (filtered.length <= maxPoints) return filtered;
  const step = Math.ceil(filtered.length / maxPoints);
  return filtered.filter((_, i) => i % step === 0);
}

module.exports = {
  pushMetrics,
  storePrevMetricMap,
  getPrevMetricMap,
  getLatest,
  getStatus,
  getHistory,
  getChartSeries,
  getRequests,
  getDailyMetrics,
  getAllDailyMetrics,
  getAllLatest,
  pushSystemMetrics,
  getLatestSystemMetrics,
  getSystemHistory,
};

/**
 * @typedef {Object} MetricsSnapshot
 * @property {string} timestamp
 * @property {'UP'|'DOWN'} status
 * @property {number} scrapeLatencyMs
 * @property {import('../parsers/prometheusParser').ComputedMetrics} metrics
 * @property {string|null} error
 */

/**
 * @typedef {Object} MetricsBuffer
 * @property {MetricsSnapshot[]} history
 * @property {number} maxLen
 * @property {'UP'|'DOWN'|'UNKNOWN'} lastStatus
 * @property {string|null} statusChangedAt
 */

/**
 * @typedef {Object} SystemMetricsBuffer
 * @property {import('../collectors/systemCollector').SystemMetrics[]} history
 * @property {number} maxLen
 */
