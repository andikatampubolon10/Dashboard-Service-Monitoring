'use strict';

/**
 * prometheusParser.js
 *
 * Parses Prometheus text format output from GET /metrics into structured JSON,
 * then computes all dashboard metrics:
 *   - Throughput (req/s) from counter deltas
 *   - Latency percentiles (p50, p95, p99) and average from histogram buckets
 *   - Error rate (%) from status code labels
 *   - Active connections / saturation from gauges
 *   - CPU usage from process_cpu_seconds_total rate
 *   - Memory usage from process_resident_memory_bytes and Go memstats
 *
 * Supports both Node.js (prom-client) and Go (prometheus/client_golang) output formats.
 */

/**
 * Parse a single line of Prometheus text format into { name, labels, value }.
 * @param {string} line
 * @returns {{ name: string, labels: Record<string, string>, value: number }|null}
 */
function parseLine(line) {
  line = line.trim();
  if (!line || line.startsWith('#')) return null;

  let name = '';
  let labels = {};
  let valStr = '';

  const braceStart = line.indexOf('{');
  if (braceStart !== -1) {
    name = line.substring(0, braceStart).trim();
    const braceEnd = line.lastIndexOf('}');
    if (braceEnd !== -1) {
      const labelStr = line.substring(braceStart + 1, braceEnd);
      valStr = line.substring(braceEnd + 1).trim();

      const labelRegex = /([a-zA-Z_0-9]+)="([^"\\]*(?:\\.[^"\\]*)*)"/g;
      let m;
      while ((m = labelRegex.exec(labelStr)) !== null) {
        labels[m[1]] = m[2].replace(/\\(\\|"|n)/g, (_, esc) => (esc === 'n' ? '\n' : esc));
      }
    }
  } else {
    const spaceIdx = line.search(/\s/);
    if (spaceIdx !== -1) {
      name = line.substring(0, spaceIdx).trim();
      valStr = line.substring(spaceIdx + 1).trim();
    } else {
      name = line;
      valStr = '0';
    }
  }

  const spaceInVal = valStr.search(/\s/);
  if (spaceInVal !== -1) {
    valStr = valStr.substring(0, spaceInVal);
  }

  let value = parseFloat(valStr);
  if (valStr === '+Inf') value = Infinity;
  else if (valStr === '-Inf') value = -Infinity;

  return { name, labels, value };
}

/**
 * Parse raw Prometheus text format into a flat metric map.
 * @param {string} rawText - Raw Prometheus text from /metrics
 * @returns {Map<string, { labels: Record<string, string>, value: number }[]>}
 */
function parseRawMetrics(rawText) {
  const lines = rawText.split('\n');
  const map = new Map();

  for (const line of lines) {
    const sample = parseLine(line);
    if (!sample) continue;

    let list = map.get(sample.name);
    if (!list) {
      list = [];
      map.set(sample.name, list);
    }
    list.push({ labels: sample.labels, value: sample.value });
  }

  return map;
}

/**
 * Extract a scalar value from a metric map.
 * @param {Map} metricMap
 * @param {string} name - Metric name
 * @param {Record<string,string>} [labelFilter] - Optional label filters
 * @returns {number}
 */
function getScalar(metricMap, name, labelFilter = {}) {
  const samples = metricMap.get(name);
  if (!samples || samples.length === 0) return 0;

  // Apply label filter if provided
  const filtered = Object.keys(labelFilter).length === 0
    ? samples
    : samples.filter((s) => {
        const labels = s.labels || {};
        return Object.entries(labelFilter).every(([k, v]) => String(labels[k]) === String(v));
      });

  if (filtered.length === 0) return 0;

  // Sum matching samples (e.g. multiple label combos)
  return filtered.reduce((sum, s) => sum + (Number.isFinite(s.value) ? s.value : 0), 0);
}

/**
 * Sum a counter across all label combinations matching a filter.
 * @param {Map} metricMap
 * @param {string} name
 * @param {Function} [labelMatch] - Optional predicate (labels) => boolean
 * @returns {number}
 */
function sumCounter(metricMap, name, labelMatch = null) {
  const samples = metricMap.get(name);
  if (!samples || samples.length === 0) return 0;

  return samples.reduce((sum, s) => {
    if (labelMatch && !labelMatch(s.labels || {})) return sum;
    return sum + (Number.isFinite(s.value) ? s.value : 0);
  }, 0);
}

/**
 * Compute p50/p95/p99 from a Prometheus histogram metric.
 * Prometheus histograms expose _bucket, _count, _sum.
 * We reconstruct the CDF from cumulative bucket counts.
 *
 * @param {Map} metricMap
 * @param {string} baseName - e.g. 'http_request_duration_seconds'
 * @returns {{ p50: number, p95: number, p99: number, avg: number, count: number }}
 */
function computeHistogramPercentiles(metricMap, baseName) {
  const bucketName = `${baseName}_bucket`;
  const countName = `${baseName}_count`;
  const sumName = `${baseName}_sum`;

  const buckets = metricMap.get(bucketName) || [];
  const totalCount = getScalar(metricMap, countName);
  const totalSum = getScalar(metricMap, sumName);

  if (totalCount === 0 || buckets.length === 0) {
    return { p50: 0, p95: 0, p99: 0, avg: 0, count: 0 };
  }

  // Aggregate buckets across all label combos (except 'le')
  // Group by 'le' label, sum counts
  const leMap = new Map();
  for (const sample of buckets) {
    const le = sample.labels?.le;
    if (le === undefined) continue;
    const leKey = le === '+Inf' ? Infinity : parseFloat(le);
    const existing = leMap.get(leKey) || 0;
    leMap.set(leKey, existing + (Number.isFinite(sample.value) ? sample.value : 0));
  }

  // Sort by le ascending
  const sortedBuckets = Array.from(leMap.entries()).sort((a, b) => a[0] - b[0]);

  const totalInf = sortedBuckets.find(([le]) => le === Infinity)?.[1] || totalCount;

  /**
   * Interpolate the value at a given quantile using linear interpolation
   * between histogram buckets.
   */
  function quantile(q) {
    const target = q * totalInf;
    let prevLe = 0;
    let prevCount = 0;

    for (const [le, count] of sortedBuckets) {
      if (le === Infinity) break;
      if (count >= target) {
        if (count === prevCount) return prevLe;
        const fraction = (target - prevCount) / (count - prevCount);
        return prevLe + fraction * (le - prevLe);
      }
      prevLe = le;
      prevCount = count;
    }
    // If all counts < target, return the last finite le
    const lastFinite = sortedBuckets.filter(([le]) => le !== Infinity).at(-1);
    return lastFinite ? lastFinite[0] : 0;
  }

  return {
    p50: quantile(0.5),
    p90: quantile(0.9),
    p95: quantile(0.95),
    p99: quantile(0.99),
    avg: totalCount > 0 ? totalSum / totalCount : 0,
    count: totalCount,
  };
}

/**
 * Compute throughput and error rate from http_requests_total counter.
 * Requires previous snapshot to compute delta.
 *
 * @param {Map} metricMap - Current metrics map
 * @param {Map|null} prevMetricMap - Previous metrics map (null on first scrape)
 * @param {number} intervalSeconds - Time since last scrape in seconds
 * @returns {{ reqPerSecond: number, reqTotal: number, deltaRequests: number, errorRate: number, total5xx: number, total4xx: number, delta5xx: number, delta4xx: number }}
 */
function computeHttpThroughput(metricMap, prevMetricMap, intervalSeconds) {
  const metricName = 'http_requests_total';

  // Total requests (all status codes)
  const currentTotal = sumCounter(metricMap, metricName);

  // 5xx errors
  const current5xx = sumCounter(metricMap, metricName, (labels) => {
    const sc = String(labels.status_code || labels.status || '');
    return sc.startsWith('5');
  });

  // 4xx errors
  const current4xx = sumCounter(metricMap, metricName, (labels) => {
    const sc = String(labels.status_code || labels.status || '');
    return sc.startsWith('4');
  });

  // On first scrape or invalid interval, delta cannot be established yet
  if (!prevMetricMap || intervalSeconds <= 0) {
    return {
      reqPerSecond: 0,
      reqTotal: Math.round(currentTotal),
      deltaRequests: 0,
      errorRate: 0,
      total5xx: Math.round(current5xx),
      total4xx: Math.round(current4xx),
      delta5xx: 0,
      delta4xx: 0,
    };
  }

  const prevTotal = sumCounter(prevMetricMap, metricName);
  const prev5xx = sumCounter(prevMetricMap, metricName, (labels) => {
    const sc = String(labels.status_code || labels.status || '');
    return sc.startsWith('5');
  });
  const prev4xx = sumCounter(prevMetricMap, metricName, (labels) => {
    const sc = String(labels.status_code || labels.status || '');
    return sc.startsWith('4');
  });

  // Prevent negative deltas on service restart (counter reset)
  const deltaTotal = Math.max(0, currentTotal - prevTotal);
  const delta5xx = Math.max(0, current5xx - prev5xx);
  const delta4xx = Math.max(0, current4xx - prev4xx);

  const reqPerSecond = intervalSeconds > 0 ? deltaTotal / intervalSeconds : 0;
  const errorRate = deltaTotal > 0 ? (delta5xx / deltaTotal) * 100 : 0;

  return {
    reqPerSecond: parseFloat(reqPerSecond.toFixed(2)),
    reqTotal: Math.round(currentTotal),
    deltaRequests: Math.round(deltaTotal),
    errorRate: parseFloat(errorRate.toFixed(2)),
    total5xx: Math.round(current5xx),
    total4xx: Math.round(current4xx),
    delta5xx: Math.round(delta5xx),
    delta4xx: Math.round(delta4xx),
  };
}

/**
 * Compute CPU usage percentage from process_cpu_seconds_total.
 * CPU usage = delta(cpu_seconds) / delta(wall_clock_seconds) * 100
 *
 * @param {Map} metricMap
 * @param {Map|null} prevMetricMap
 * @param {number} intervalSeconds
 * @returns {number} CPU usage percentage (0–100+, can exceed 100 for multi-core)
 */
function computeCpuUsage(metricMap, prevMetricMap, intervalSeconds) {
  const current = getScalar(metricMap, 'process_cpu_seconds_total');
  const prev = prevMetricMap
    ? getScalar(prevMetricMap, 'process_cpu_seconds_total')
    : null;

  if (prev === null || intervalSeconds === 0) return 0;

  const deltaCpu = Math.max(0, current - prev);
  const cpuPercent = (deltaCpu / intervalSeconds) * 100;
  return parseFloat(cpuPercent.toFixed(2));
}

/**
 * Compute memory usage from process_resident_memory_bytes (RSS).
 * Also extracts Node.js heap and Go memstats metrics.
 *
 * @param {Map} metricMap
 * @returns {{ rssMb: number, heapUsedMb: number, heapTotalMb: number, externalMb: number, goAllocMb: number, goSysMb: number }}
 */
function computeMemoryUsage(metricMap) {
  const rssBytes = getScalar(metricMap, 'process_resident_memory_bytes');
  const heapUsedBytes = getScalar(metricMap, 'nodejs_heap_size_used_bytes');
  const heapTotalBytes = getScalar(metricMap, 'nodejs_heap_size_total_bytes');
  const externalBytes = getScalar(metricMap, 'nodejs_external_memory_bytes');

  // Go memstats
  const goAllocBytes = getScalar(metricMap, 'go_memstats_alloc_bytes');
  const goSysBytes = getScalar(metricMap, 'go_memstats_sys_bytes');

  return {
    rssMb: parseFloat((rssBytes / 1024 / 1024).toFixed(2)),
    heapUsedMb: parseFloat((heapUsedBytes / 1024 / 1024).toFixed(2)),
    heapTotalMb: parseFloat((heapTotalBytes / 1024 / 1024).toFixed(2)),
    externalMb: parseFloat((externalBytes / 1024 / 1024).toFixed(2)),
    goAllocMb: parseFloat((goAllocBytes / 1024 / 1024).toFixed(2)),
    goSysMb: parseFloat((goSysBytes / 1024 / 1024).toFixed(2)),
  };
}

/**
 * Compute active connections / saturation indicators.
 * Uses open file descriptors (cross-platform) + service-specific gauges.
 *
 * @param {Map} metricMap
 * @returns {{ openFds: number, activeSseSessions: number, activeWsConnections: number, activeSessions: number, goGoroutines: number }}
 */
function computeConnections(metricMap) {
  return {
    // Cross-service: open file descriptors
    openFds: Math.round(getScalar(metricMap, 'process_open_fds')),

    // ai-consultation-service: active SSE streaming sessions
    activeSseSessions: Math.round(
      getScalar(metricMap, 'consultation_active_sse_sessions'),
    ),

    // live-consult-service: WebSocket connections & sessions
    activeWsConnections: Math.round(
      getScalar(metricMap, 'liveconsult_active_connections'),
    ),
    activeSessions: Math.round(
      getScalar(metricMap, 'liveconsult_active_sessions') ||
      getScalar(metricMap, 'bpjs_active_sessions'),
    ),

    // Go: goroutines
    goGoroutines: Math.round(getScalar(metricMap, 'go_goroutines')),
  };
}

/**
 * Extract service-specific custom metrics.
 * @param {string} serviceId
 * @param {Map} metricMap
 * @returns {Record<string, number>}
 */
function extractCustomMetrics(serviceId, metricMap) {
  const custom = {};

  switch (serviceId) {
    case 'identity':
      custom.bpjsVerificationTotal = Math.round(
        sumCounter(metricMap, 'bpjs_verification_requests_total'),
      );
      custom.bpjsVerificationSuccess = Math.round(
        sumCounter(metricMap, 'bpjs_verification_success_total'),
      );
      custom.bpjsVerificationFailed = Math.round(
        sumCounter(metricMap, 'bpjs_verification_failed_total'),
      );
      custom.bpjsActiveSessions = Math.round(
        getScalar(metricMap, 'bpjs_active_sessions'),
      );
      custom.bpjsSessionCreated = Math.round(
        sumCounter(metricMap, 'bpjs_session_created_total'),
      );
      custom.bpjsSessionInvalidated = Math.round(
        sumCounter(metricMap, 'bpjs_session_invalidated_total'),
      );
      custom.consentAcceptanceTotal = Math.round(
        sumCounter(metricMap, 'consent_acceptance_total'),
      );
      custom.kafkaPublishSuccess = Math.round(
        sumCounter(metricMap, 'kafka_publish_success_total'),
      );
      custom.kafkaPublishFailure = Math.round(
        sumCounter(metricMap, 'kafka_publish_failure_total'),
      );
      break;

    case 'audit':
      custom.eventsIngestedTotal = Math.round(
        sumCounter(metricMap, 'audit_events_ingested_total'),
      );
      custom.eventsDuplicateTotal = Math.round(
        sumCounter(metricMap, 'audit_events_duplicate_total'),
      );
      custom.eventsDeadLetteredTotal = Math.round(
        sumCounter(metricMap, 'audit_events_dead_lettered_total'),
      );
      break;

    case 'ai-consultation':
      custom.chatTotal = Math.round(sumCounter(metricMap, 'consultation_chat_total'));
      custom.chatFailuresTotal = Math.round(
        sumCounter(metricMap, 'consultation_chat_failures_total'),
      );
      custom.feedbackTotal = Math.round(sumCounter(metricMap, 'consultation_feedback_total'));
      {
        const aiLatency = computeHistogramPercentiles(metricMap, 'ai_backend_request_duration_seconds');
        custom.aiLatencyAvgMs = parseFloat((aiLatency.avg * 1000).toFixed(2));
        custom.aiLatencyP95Ms = parseFloat((aiLatency.p95 * 1000).toFixed(2));
      }
      break;

    case 'health-profile':
      custom.profileCreatedTotal = Math.round(sumCounter(metricMap, 'profile_created_total'));
      custom.profileUpdatedTotal = Math.round(sumCounter(metricMap, 'profile_updated_total'));
      custom.syncSuccessTotal = Math.round(sumCounter(metricMap, 'profile_sync_success_total'));
      custom.syncFailedTotal = Math.round(sumCounter(metricMap, 'profile_sync_failed_total'));
      custom.duplicateEventTotal = Math.round(sumCounter(metricMap, 'duplicate_event_total'));
      break;

    case 'live-consult':
      custom.sessionStartedTotal = Math.round(
        sumCounter(metricMap, 'liveconsult_session_started_total'),
      );
      custom.sessionCompletedTotal = Math.round(
        sumCounter(metricMap, 'liveconsult_session_completed_total'),
      );
      custom.sessionFailedTotal = Math.round(
        sumCounter(metricMap, 'liveconsult_session_failed_total'),
      );
      custom.wsErrorsTotal = Math.round(
        sumCounter(metricMap, 'liveconsult_ws_errors_total'),
      );
      break;

    case 'medical-record':
      {
        const db = computeHistogramPercentiles(metricMap, 'db_operation_duration_seconds');
        const es = computeHistogramPercentiles(
          metricMap,
          'elasticsearch_operation_duration_seconds',
        );
        custom.dbLatencyAvgMs = parseFloat((db.avg * 1000).toFixed(2));
        custom.dbLatencyP95Ms = parseFloat((db.p95 * 1000).toFixed(2));
        custom.esLatencyAvgMs = parseFloat((es.avg * 1000).toFixed(2));
        custom.esLatencyP95Ms = parseFloat((es.p95 * 1000).toFixed(2));
      }
      break;

    case 'lifestyle':
      custom.auditPublishSuccess = Math.round(
        sumCounter(metricMap, 'lifestyle_audit_publish_total', (l) => l.result === 'success'),
      );
      custom.auditPublishFailure = Math.round(
        sumCounter(metricMap, 'lifestyle_audit_publish_total', (l) => l.result === 'failure'),
      );
      break;

    default:
      break;
  }

  return custom;
}

/**
 * Extract per-route metrics from http_requests_total and histogram sums.
 * @param {Map} metricMap
 * @returns {RouteMetric[]}
 */
function extractRoutes(metricMap) {
  const httpSamples = metricMap.get('http_requests_total') || [];
  const durationSamples = metricMap.get('http_request_duration_seconds_sum') || [];
  const countSamples = metricMap.get('http_request_duration_seconds_count') || [];

  const routes = [];

  for (const s of httpSamples) {
    const method = s.labels?.method || 'GET';
    const path = s.labels?.path || s.labels?.route || '/';
    const status = parseInt(s.labels?.status_code || s.labels?.status || '200', 10);
    const count = Math.round(s.value || 0);

    // Compute route-specific average latency if available
    const sumMatch = durationSamples.find(
      (d) => (d.labels?.path === path || d.labels?.route === path) &&
             (d.labels?.method === method || !d.labels?.method),
    );
    const countMatch = countSamples.find(
      (c) => (c.labels?.path === path || c.labels?.route === path) &&
             (c.labels?.method === method || !c.labels?.method),
    );

    let avgLatencyMs = 0;
    if (sumMatch && countMatch && countMatch.value > 0) {
      avgLatencyMs = parseFloat(((sumMatch.value / countMatch.value) * 1000).toFixed(2));
    }

    routes.push({
      method,
      path,
      status,
      count,
      avgLatencyMs,
    });
  }

  return routes;
}

/**
 * Full parse + compute pipeline.
 * Takes raw Prometheus text and previous raw map, returns structured metrics object.
 *
 * @param {string} serviceId
 * @param {string} rawText - Current raw Prometheus text from /metrics
 * @param {Map|null} prevMetricMap - Previous parsed metric map (for delta computation)
 * @param {number} intervalSeconds - Seconds since last scrape
 * @returns {{ metricMap: Map, computed: ComputedMetrics }}
 */
function parseAndCompute(serviceId, rawText, prevMetricMap, intervalSeconds) {
  const metricMap = parseRawMetrics(rawText);

  const throughput = computeHttpThroughput(metricMap, prevMetricMap, intervalSeconds);
  const latencyRaw = computeHistogramPercentiles(metricMap, 'http_request_duration_seconds');
  const cpu = computeCpuUsage(metricMap, prevMetricMap, intervalSeconds);
  const memory = computeMemoryUsage(metricMap);
  const connections = computeConnections(metricMap);
  const custom = extractCustomMetrics(serviceId, metricMap);
  const routes = extractRoutes(metricMap);

  const computed = {
    throughput,
    latency: {
      avgMs: parseFloat((latencyRaw.avg * 1000).toFixed(2)),
      p50Ms: parseFloat((latencyRaw.p50 * 1000).toFixed(2)),
      p90Ms: parseFloat((latencyRaw.p90 * 1000).toFixed(2)),
      p95Ms: parseFloat((latencyRaw.p95 * 1000).toFixed(2)),
      p99Ms: parseFloat((latencyRaw.p99 * 1000).toFixed(2)),
      totalObservations: latencyRaw.count,
    },
    errorRate: {
      percent: throughput.errorRate,
      total5xx: throughput.total5xx,
      total4xx: throughput.total4xx,
      delta5xx: throughput.delta5xx,
      delta4xx: throughput.delta4xx,
    },
    connections,
    cpu: {
      usagePercent: cpu,
    },
    memory,
    custom,
    routes,
  };

  return { metricMap, computed };
}

module.exports = {
  parseLine,
  parseRawMetrics,
  parseAndCompute,
  extractRoutes,
  getScalar,
  sumCounter,
  computeHistogramPercentiles,
};

/**
 * @typedef {Object} ComputedMetrics
 * @property {Object} throughput
 * @property {Object} latency
 * @property {Object} errorRate
 * @property {Object} connections
 * @property {Object} cpu
 * @property {Object} memory
 * @property {Object} custom
 */

