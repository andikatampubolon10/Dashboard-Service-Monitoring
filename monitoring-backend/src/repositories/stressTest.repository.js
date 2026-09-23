'use strict';

/**
 * repositories/stressTest.repository.js
 * Data Access Layer for Stress Test History supporting MySQL (MariaDB) and PostgreSQL.
 */

const { query, dbType } = require('../database/db');

function parseJsonField(val, fallback = null) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

/**
 * Simpan hasil pengujian beban k6 ke tabel stress_test_runs
 */
async function saveTestRun(data) {
  const isMysql = dbType === 'mysql';

  const insertSql = isMysql
    ? `
      INSERT INTO stress_test_runs (
        id, project_id, project_name, flow_id, flow_name, test_type,
        target_vus, duration_sec, total_requests, success_requests, failed_requests,
        error_rate_percent, current_rps, p95_latency_ms, p90_latency_ms, avg_latency_ms,
        min_latency_ms, max_latency_ms, health_grade, health_verdict, failure_point,
        checks, target_endpoints, k6_metrics, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
      ON DUPLICATE KEY UPDATE
        total_requests = VALUES(total_requests),
        success_requests = VALUES(success_requests),
        failed_requests = VALUES(failed_requests),
        error_rate_percent = VALUES(error_rate_percent),
        current_rps = VALUES(current_rps),
        p95_latency_ms = VALUES(p95_latency_ms),
        p90_latency_ms = VALUES(p90_latency_ms),
        avg_latency_ms = VALUES(avg_latency_ms),
        min_latency_ms = VALUES(min_latency_ms),
        max_latency_ms = VALUES(max_latency_ms),
        health_grade = VALUES(health_grade),
        health_verdict = VALUES(health_verdict),
        failure_point = VALUES(failure_point),
        checks = VALUES(checks),
        target_endpoints = VALUES(target_endpoints),
        k6_metrics = VALUES(k6_metrics);
    `
    : `
      INSERT INTO stress_test_runs (
        id, project_id, project_name, flow_id, flow_name, test_type,
        target_vus, duration_sec, total_requests, success_requests, failed_requests,
        error_rate_percent, current_rps, p95_latency_ms, p90_latency_ms, avg_latency_ms,
        min_latency_ms, max_latency_ms, health_grade, health_verdict, failure_point,
        checks, target_endpoints, k6_metrics, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21,
        $22, $23, $24, $25
      )
      ON CONFLICT (id) DO UPDATE SET
        total_requests = EXCLUDED.total_requests,
        success_requests = EXCLUDED.success_requests,
        failed_requests = EXCLUDED.failed_requests,
        error_rate_percent = EXCLUDED.error_rate_percent,
        current_rps = EXCLUDED.current_rps,
        p95_latency_ms = EXCLUDED.p95_latency_ms,
        p90_latency_ms = EXCLUDED.p90_latency_ms,
        avg_latency_ms = EXCLUDED.avg_latency_ms,
        min_latency_ms = EXCLUDED.min_latency_ms,
        max_latency_ms = EXCLUDED.max_latency_ms,
        health_grade = EXCLUDED.health_grade,
        health_verdict = EXCLUDED.health_verdict,
        failure_point = EXCLUDED.failure_point,
        checks = EXCLUDED.checks,
        k6_metrics = EXCLUDED.k6_metrics;
    `;

  const runId = data.id || `run-${Date.now()}`;
  const values = [
    runId,
    data.projectId || null,
    data.projectName || null,
    data.flowId || String(data.flow || '1'),
    data.flowName || (data.flow === '1' ? 'Konsultasi Chat Dokter AI' : data.flow === '2' ? 'Membaca Artikel Kesehatan' : 'Pencarian Dokter'),
    data.testType || 'load_test',
    parseInt(data.targetVUs || 1, 10),
    parseInt(data.durationSec || 30, 10),
    parseInt(data.totalRequests || 0, 10),
    parseInt(data.successRequests || 0, 10),
    parseInt(data.failedRequests || 0, 10),
    parseFloat(data.errorRatePercent || 0),
    parseInt(data.currentRps || 0, 10),
    parseInt(data.p95LatencyMs || 0, 10),
    parseInt(data.p90LatencyMs || 0, 10),
    parseInt(data.avgLatencyMs || 0, 10),
    parseInt(data.minLatencyMs || 0, 10),
    parseInt(data.maxLatencyMs || 0, 10),
    data.healthGrade || 'HEALTHY',
    data.healthVerdict || '',
    data.failurePoint ? JSON.stringify(data.failurePoint) : null,
    JSON.stringify(data.checks || []),
    JSON.stringify(data.targetEndpoints || {}),
    JSON.stringify(data.k6Metrics || {}),
    data.createdAt ? new Date(data.createdAt) : new Date(),
  ];

  await query(insertSql, values);
  return {
    ...data,
    id: runId,
  };
}

/**
 * Ambil riwayat pengujian dengan filter opsional projectId
 */
async function getRuns({ projectId, limit = 20, offset = 0 } = {}) {
  const isMysql = dbType === 'mysql';
  let selectSql = `
    SELECT 
      id, project_id, project_name, flow_id, flow_name, test_type,
      target_vus, duration_sec, total_requests, success_requests, failed_requests,
      error_rate_percent, current_rps, p95_latency_ms, p90_latency_ms, avg_latency_ms,
      min_latency_ms, max_latency_ms, health_grade, health_verdict, failure_point,
      checks, target_endpoints, k6_metrics, created_at
    FROM stress_test_runs
  `;
  const params = [];

  if (projectId) {
    params.push(projectId);
    selectSql += isMysql ? ' WHERE project_id = ?' : ' WHERE project_id = $1';
  }

  selectSql += isMysql
    ? ' ORDER BY created_at DESC LIMIT ? OFFSET ?;'
    : ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;

  params.push(parseInt(limit, 10));
  params.push(parseInt(offset, 10));

  const res = await query(selectSql, params);

  // Ambil total count
  let countSql = 'SELECT COUNT(*) AS total FROM stress_test_runs';
  const countParams = [];
  if (projectId) {
    countParams.push(projectId);
    countSql += isMysql ? ' WHERE project_id = ?' : ' WHERE project_id = $1';
  }
  const countRes = await query(countSql, countParams);

  const formattedRows = (res.rows || []).map((r) => ({
    ...r,
    failure_point: parseJsonField(r.failure_point),
    checks: parseJsonField(r.checks, []),
    target_endpoints: parseJsonField(r.target_endpoints, {}),
    k6_metrics: parseJsonField(r.k6_metrics, {}),
  }));

  return {
    total: parseInt(countRes.rows[0]?.total || 0, 10),
    runs: formattedRows,
  };
}

/**
 * Ambil metrik analitik teragregasi untuk satu Project
 */
async function getProjectAnalytics(projectId) {
  if (!projectId) return null;
  const isMysql = dbType === 'mysql';

  const summarySql = `
    SELECT 
      COUNT(*) AS total_runs,
      COALESCE(AVG(p95_latency_ms), 0) AS avg_p95_latency,
      COALESCE(MIN(p95_latency_ms), 0) AS min_p95_latency,
      COALESCE(MAX(p95_latency_ms), 0) AS max_p95_latency,
      COALESCE(AVG(error_rate_percent), 0) AS avg_error_rate,
      COALESCE(MAX(target_vus), 0) AS peak_vus_tested,
      COALESCE(SUM(total_requests), 0) AS total_requests_served
    FROM stress_test_runs
    WHERE project_id = ${isMysql ? '?' : '$1'};
  `;

  const runsSql = `
    SELECT 
      id, flow_id, flow_name, test_type, target_vus, duration_sec,
      p95_latency_ms, avg_latency_ms, error_rate_percent, current_rps,
      health_grade, health_verdict, created_at
    FROM stress_test_runs
    WHERE project_id = ${isMysql ? '?' : '$1'}
    ORDER BY created_at ASC
    LIMIT 30;
  `;

  const [summaryRes, runsRes] = await Promise.all([
    query(summarySql, [projectId]),
    query(runsSql, [projectId]),
  ]);

  const summary = summaryRes.rows[0] || {};
  const history = runsRes.rows || [];

  return {
    projectId,
    totalRuns: parseInt(summary.total_runs || 0, 10),
    avgP95LatencyMs: Math.round(parseFloat(summary.avg_p95_latency || 0)),
    minP95LatencyMs: Math.round(parseFloat(summary.min_p95_latency || 0)),
    maxP95LatencyMs: Math.round(parseFloat(summary.max_p95_latency || 0)),
    avgErrorRatePercent: parseFloat(parseFloat(summary.avg_error_rate || 0).toFixed(2)),
    peakVUsTested: parseInt(summary.peak_vus_tested || 0, 10),
    totalRequestsServed: parseInt(summary.total_requests_served || 0, 10),
    historyTrends: history.map((h) => ({
      id: h.id,
      timestamp: h.created_at,
      flowName: h.flow_name,
      targetVUs: h.target_vus,
      p95LatencyMs: h.p95_latency_ms,
      errorRatePercent: parseFloat(h.error_rate_percent || 0),
      healthGrade: h.health_grade,
    })),
  };
}

module.exports = {
  saveTestRun,
  getRuns,
  getProjectAnalytics,
};
