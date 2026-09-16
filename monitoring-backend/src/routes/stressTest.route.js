'use strict';

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const aiInsightService = require('../services/aiInsight.service');
const router = express.Router();

let ioServer = null;
let activeK6Process = null;

let currentTestStatus = {
  isRunning: false,
  flow: '1',
  targetVUs: 50,
  durationSec: 30,
  startTime: null,
  activeVUs: 0,
  currentRps: 0,
  p95LatencyMs: 0,
  p90LatencyMs: 0,
  avgLatencyMs: 0,
  minLatencyMs: 0,
  medLatencyMs: 0,
  maxLatencyMs: 0,
  totalRequests: 0,
  failedRequests: 0,
  successRequests: 0,
  errorRatePercent: 0,
  healthGrade: 'HEALTHY',
  healthVerdict: 'Sistem siap diuji',
  recentLogs: [],
  checks: [],
  k6Metrics: null,
  rawSummaryText: '',
};

function setSocketServer(io) {
  ioServer = io;
}

function broadcastProgress() {
  if (ioServer) {
    ioServer.emit('stress-test:progress', currentTestStatus);
  }
}

function broadcastLog(line) {
  if (!line || !line.trim()) return;
  const cleanLine = line.trim();
  currentTestStatus.recentLogs.push(cleanLine);
  if (currentTestStatus.recentLogs.length > 200) {
    currentTestStatus.recentLogs.shift();
  }

  if (ioServer) {
    ioServer.emit('stress-test:log', {
      line: cleanLine,
      timestamp: Date.now(),
    });
  }
}

/**
 * Parse k6 console output to extract real-time metrics
 */
function parseK6Output(text) {
  // Parsing running line: e.g. "running (00m10.2s), 050/050 VUs, 85 reqs/s"
  const vuMatch = text.match(/(\d+)\/(\d+)\s+VUs/i);
  if (vuMatch) {
    currentTestStatus.activeVUs = parseInt(vuMatch[1], 10);
  }

  const rpsMatch = text.match(/([\d.]+)\s+reqs?\/s/i);
  if (rpsMatch) {
    currentTestStatus.currentRps = Math.round(parseFloat(rpsMatch[1]));
  }

  // Helper to parse time string with units: '11.27s', '238.38ms', '540µs'
  function parseDurationToMs(valStr, unitStr) {
    const val = parseFloat(valStr);
    const unit = (unitStr || 'ms').toLowerCase();
    if (unit === 's') return Math.round(val * 1000);
    if (unit === 'µs' || unit === 'us') return parseFloat((val / 1000).toFixed(2));
    return Math.round(val);
  }

  // Parse HTTP duration metrics specifically from http_req_duration or real_server_latency_ms
  if (text.includes('http_req_duration') || text.includes('real_server_latency_ms')) {
    const p95Match = text.match(/p\(95\)=([\d.]+)(µs|us|ms|s)/i);
    if (p95Match) {
      currentTestStatus.p95LatencyMs = parseDurationToMs(p95Match[1], p95Match[2]);
    }

    const p90Match = text.match(/p\(90\)=([\d.]+)(µs|us|ms|s)/i);
    if (p90Match) {
      currentTestStatus.p90LatencyMs = parseDurationToMs(p90Match[1], p90Match[2]);
    }

    const avgMatch = text.match(/avg=([\d.]+)(µs|us|ms|s)/i);
    if (avgMatch) {
      currentTestStatus.avgLatencyMs = parseDurationToMs(avgMatch[1], avgMatch[2]);
    }

    const minMatch = text.match(/min=([\d.]+)(µs|us|ms|s)/i);
    if (minMatch) {
      currentTestStatus.minLatencyMs = parseDurationToMs(minMatch[1], minMatch[2]);
    }

    const medMatch = text.match(/med=([\d.]+)(µs|us|ms|s)/i);
    if (medMatch) {
      currentTestStatus.medLatencyMs = parseDurationToMs(medMatch[1], medMatch[2]);
    }

    const maxMatch = text.match(/max=([\d.]+)(µs|us|ms|s)/i);
    if (maxMatch) {
      currentTestStatus.maxLatencyMs = parseDurationToMs(maxMatch[1], maxMatch[2]);
    }
  }

  const reqsMatch = text.match(/http_reqs[\s.]+:\s*(\d+)/i);
  if (reqsMatch) {
    currentTestStatus.totalRequests = parseInt(reqsMatch[1], 10);
  }

  // Parse failure counts and percentage directly from k6 output
  const failedMatch = text.match(/http_req_failed[\s.]+:\s*([\d.]+)%/i);
  if (failedMatch) {
    currentTestStatus.errorRatePercent = parseFloat(failedMatch[1]);
  }

  // Parse detailed failed passes / total if printed (e.g. 15.62% ✓ 125 ✗ 675 or 100.00% 35 out of 35)
  const failedCountMatch = text.match(/http_req_failed[\s.]+:\s*[\d.]+%\s+(?:✓|v)?\s*(\d+)\s+(?:out of|\/|✗|x)?\s*(\d+)?/i);
  if (failedCountMatch) {
    currentTestStatus.failedRequests = parseInt(failedCountMatch[1], 10);
    if (failedCountMatch[2]) {
      currentTestStatus.totalRequests = parseInt(failedCountMatch[2], 10);
    }
    currentTestStatus.successRequests = Math.max(0, currentTestStatus.totalRequests - currentTestStatus.failedRequests);
  }

  // Update Health Grade & Verdict based strictly on SLA
  if (text.includes('setup() execution timed out')) {
    currentTestStatus.healthGrade = 'CRITICAL';
    currentTestStatus.healthVerdict = 'Inisialisasi Akun Timeout: Persiapan akun melebihi batas waktu (setupTimeout). Pengujian belum sempat berjalan.';
  } else if (text.includes('thresholds on metrics') && text.includes('crossed')) {
    currentTestStatus.healthGrade = 'CRITICAL';
    currentTestStatus.healthVerdict = 'Kapasitas Terlampaui: Waktu Respon Server Melampaui Batas SLA Toleransi';
  } else if (currentTestStatus.errorRatePercent > 5.0 || currentTestStatus.p95LatencyMs > 2000) {
    currentTestStatus.healthGrade = 'CRITICAL';
    currentTestStatus.healthVerdict = 'Kapasitas Server Terlampaui (Tinggi Error / Latensi Ekstrem)';
  } else if (currentTestStatus.errorRatePercent > 1.0 || currentTestStatus.p95LatencyMs > 1000) {
    currentTestStatus.healthGrade = 'DEGRADED';
    currentTestStatus.healthVerdict = 'Kinerja Melambat (SLA Latensi P95 Mendekati Ambang Batas)';
  } else {
    currentTestStatus.healthGrade = 'HEALTHY';
    currentTestStatus.healthVerdict = 'Sistem Sangat Stabil & Responsif Di Bawah Beban';
  }

  broadcastProgress();
}

/**
 * GET /api/stress-test/status
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: currentTestStatus,
  });
});

/**
 * POST /api/stress-test/start
 * Body: { flow: '1'|'2'|'3', targetVUs: 50, durationSec: 30 }
 */
router.post('/start', (req, res) => {
  if (activeK6Process) {
    return res.status(409).json({
      success: false,
      message: 'Stress test k6 sedang berjalan. Hentikan dulu atau tunggu selesai.',
      data: currentTestStatus,
    });
  }

  const flow = String(req.body.flow || '1');
  const targetVUs = Math.max(1, parseInt(req.body.targetVUs || '50', 10));
  const durationSec = Math.max(5, parseInt(req.body.durationSec || '30', 10));

  // Dynamic Service Endpoints (per-service custom/preset URLs)
  const endpoints = req.body.serviceEndpoints || req.body.targetUrls || {};
  const identityUrl = endpoints.identity || process.env.SERVICE_IDENTITY_URL || 'http://localhost:8081';
  const aiConsultUrl = endpoints.aiConsult || process.env.STRESS_TEST_AI_CONSULT_URL || process.env.SERVICE_AI_CONSULTATION_URL || 'http://localhost:4006';
  const lifestyleUrl = endpoints.lifestyle || process.env.SERVICE_LIFESTYLE_URL || 'http://localhost:4007';
  const liveConsultUrl = endpoints.liveConsult || process.env.SERVICE_LIVE_CONSULT_URL || 'http://localhost:4004';
  const healthProfileUrl = endpoints.healthProfile || process.env.SERVICE_HEALTH_PROFILE_URL || 'http://localhost:3001';
  const medicalUrl = endpoints.medical || process.env.SERVICE_MEDICAL_RECORD_URL || 'http://localhost:3002';

  // Path ke bin/k6.exe dan stress-test.js
  const rootDir = path.resolve(__dirname, '../../../');
  const k6ExePath = path.join(rootDir, 'bin', 'k6.exe');
  const scriptPath = path.join(rootDir, 'stress-test.js');
  const summaryJsonPath = path.join(rootDir, `k6-summary-${Date.now()}.json`);

  const args = [
    'run',
    '--summary-export', summaryJsonPath,
    '--env', `FLOW=${flow}`,
    '--env', `VUS=${targetVUs}`,
    '--env', `DURATION=${durationSec}s`,
    '--env', `IDENTITY_URL=${identityUrl}`,
    '--env', `AI_CONSULT_URL=${aiConsultUrl}`,
    '--env', `LIFESTYLE_URL=${lifestyleUrl}`,
    '--env', `LIVE_CONSULT_URL=${liveConsultUrl}`,
    '--env', `HEALTH_PROFILE_URL=${healthProfileUrl}`,
    '--env', `MEDICAL_URL=${medicalUrl}`,
    scriptPath,
  ];

  console.log(`[k6] Spawning: ${k6ExePath} ${args.join(' ')}`);

  const activeEndpointsDesc = flow === '1'
    ? `Identity (${identityUrl}) | AI Consult (${aiConsultUrl})`
    : flow === '2'
      ? `Identity (${identityUrl}) | Lifestyle (${lifestyleUrl})`
      : `Identity (${identityUrl}) | Live Consult (${liveConsultUrl})`;

  const allStdoutLines = [];

  try {
    activeK6Process = spawn(k6ExePath, args, {
      cwd: rootDir,
      windowsHide: true,
    });

    currentTestStatus = {
      isRunning: true,
      flow,
      targetVUs,
      durationSec,
      targetEndpoints: {
        identity: identityUrl,
        aiConsult: aiConsultUrl,
        lifestyle: lifestyleUrl,
        liveConsult: liveConsultUrl,
        healthProfile: healthProfileUrl,
      },
      startTime: Date.now(),
      activeVUs: targetVUs,
      currentRps: 0,
      p95LatencyMs: 0,
      p90LatencyMs: 0,
      avgLatencyMs: 0,
      minLatencyMs: 0,
      medLatencyMs: 0,
      maxLatencyMs: 0,
      totalRequests: 0,
      failedRequests: 0,
      successRequests: 0,
      errorRatePercent: 0,
      healthGrade: 'HEALTHY',
      healthVerdict: `Menguji Flow ${flow} (${activeEndpointsDesc}) dengan ${targetVUs} Pasien (Closed Workload: 1 Siklus Pasien Lengkap)...`,
      recentLogs: [
        `[k6] Memulai pengujian Grafana k6 untuk Flow ${flow} (${targetVUs} VUs, Closed Workload: 1 Siklus Pasien Penuh)...`,
        `[k6 Target] ${activeEndpointsDesc}`,
      ],
      checks: [],
      k6Metrics: null,
      rawSummaryText: '',
    };

    broadcastProgress();
    broadcastLog(`[k6] Eksekusi binary Grafana k6 berhasil dimulai...`);

    // Setup periodic interval update during test
    const progressTicker = setInterval(() => {
      if (!activeK6Process) {
        clearInterval(progressTicker);
        return;
      }
      const elapsed = Math.floor((Date.now() - currentTestStatus.startTime) / 1000);
      if (elapsed > 0 && currentTestStatus.totalRequests > 0 && currentTestStatus.currentRps === 0) {
        currentTestStatus.currentRps = Math.round(currentTestStatus.totalRequests / elapsed);
      }
      broadcastProgress();
    }, 1000);

    activeK6Process.stdout.on('data', (data) => {
      const output = data.toString();
      const lines = output.split(/\r?\n/);
      lines.forEach((line) => {
        if (line.trim()) {
          allStdoutLines.push(line);
          broadcastLog(line);
          parseK6Output(line);
        }
      });
    });

    activeK6Process.stderr.on('data', (data) => {
      const output = data.toString();
      const lines = output.split(/\r?\n/);
      lines.forEach((line) => {
        if (line.trim()) {
          allStdoutLines.push(line);
          broadcastLog(line);
          parseK6Output(line);
        }
      });
    });

    activeK6Process.on('error', (err) => {
      console.error('[k6] Error executing k6 process:', err);
      broadcastLog(`[k6 ERROR] ${err.message}`);
      currentTestStatus.isRunning = false;
      activeK6Process = null;
      clearInterval(progressTicker);
      broadcastProgress();
    });

    activeK6Process.on('close', (code) => {
      console.log(`[k6] Process exited with code ${code}`);
      clearInterval(progressTicker);
      currentTestStatus.isRunning = false;
      currentTestStatus.activeVUs = 0;
      const actualElapsedSec = Math.max(1, Math.round((Date.now() - currentTestStatus.startTime) / 1000));
      currentTestStatus.durationSec = actualElapsedSec;
      activeK6Process = null;

      // 1. Check and parse authentic k6 summary JSON file
      if (fs.existsSync(summaryJsonPath)) {
        try {
          const rawSummary = fs.readFileSync(summaryJsonPath, 'utf8');
          const parsed = JSON.parse(rawSummary);

          const m = parsed.metrics || {};
          const httpReqs = m.http_reqs ? (m.http_reqs.values || m.http_reqs) : {};
          const httpReqDuration = m.http_req_duration ? (m.http_req_duration.values || m.http_req_duration) : {};
          const httpReqFailed = m.http_req_failed ? (m.http_req_failed.values || m.http_req_failed) : {};
          const checksMetric = m.checks ? (m.checks.values || m.checks) : {};
          const dataRecv = m.data_received ? (m.data_received.values || m.data_received) : {};
          const dataSent = m.data_sent ? (m.data_sent.values || m.data_sent) : {};
          const iters = m.iterations ? (m.iterations.values || m.iterations) : {};
          const iterDuration = m.iteration_duration ? (m.iteration_duration.values || m.iteration_duration) : {};
          const vusMetric = m.vus ? (m.vus.values || m.vus) : {};

          // In k6 http_req_failed: passes is count of failed requests, fails is count of non-failed (successful) requests
          const totalReq = httpReqs.count || currentTestStatus.totalRequests || 0;
          const failedReq = httpReqFailed.passes !== undefined ? httpReqFailed.passes : Math.round(totalReq * (httpReqFailed.value || 0));
          const successReq = httpReqFailed.fails !== undefined ? httpReqFailed.fails : Math.max(0, totalReq - failedReq);
          const errRate = httpReqFailed.value !== undefined ? httpReqFailed.value * 100 : (totalReq > 0 ? (failedReq / totalReq) * 100 : 0);

          currentTestStatus.totalRequests = totalReq;
          currentTestStatus.failedRequests = failedReq;
          currentTestStatus.successRequests = successReq;
          currentTestStatus.errorRatePercent = parseFloat(errRate.toFixed(2));
          currentTestStatus.currentRps = Math.round(httpReqs.rate || 0);

          if (httpReqDuration['p(95)'] !== undefined) {
            currentTestStatus.p95LatencyMs = Math.round(httpReqDuration['p(95)']);
          }
          if (httpReqDuration['p(90)'] !== undefined) {
            currentTestStatus.p90LatencyMs = Math.round(httpReqDuration['p(90)']);
          }
          if (httpReqDuration.avg !== undefined) {
            currentTestStatus.avgLatencyMs = Math.round(httpReqDuration.avg);
          }
          if (httpReqDuration.min !== undefined) {
            currentTestStatus.minLatencyMs = Math.round(httpReqDuration.min);
          }
          if (httpReqDuration.med !== undefined) {
            currentTestStatus.medLatencyMs = Math.round(httpReqDuration.med);
          }
          if (httpReqDuration.max !== undefined) {
            currentTestStatus.maxLatencyMs = Math.round(httpReqDuration.max);
          }

          // Recursive check extractor
          const extractedChecks = [];
          function collectChecks(grp) {
            if (!grp) return;
            if (grp.checks) {
              for (const [key, chk] of Object.entries(grp.checks)) {
                const p = chk.passes || 0;
                const f = chk.fails || 0;
                const tot = p + f;
                const rate = tot > 0 ? ((p / tot) * 100).toFixed(1) : '0.0';
                extractedChecks.push({
                  name: chk.name || key,
                  passes: p,
                  fails: f,
                  total: tot,
                  passRate: `${rate}%`,
                  passed: f === 0 && p > 0,
                });
              }
            }
            if (grp.groups) {
              for (const sub of Object.values(grp.groups)) {
                collectChecks(sub);
              }
            }
          }
          collectChecks(parsed.root_group);

          currentTestStatus.checks = extractedChecks;
          currentTestStatus.k6Metrics = {
            http_reqs: { count: totalReq, rate: httpReqs.rate || 0 },
            http_req_duration: {
              avg: httpReqDuration.avg || 0,
              min: httpReqDuration.min || 0,
              med: httpReqDuration.med || 0,
              max: httpReqDuration.max || 0,
              p90: httpReqDuration['p(90)'] || 0,
              p95: httpReqDuration['p(95)'] || 0,
            },
            http_req_failed: {
              rate: currentTestStatus.errorRatePercent,
              passes: failedReq,
              fails: successReq,
            },
            checks: {
              passes: checksMetric.passes || 0,
              fails: checksMetric.fails || 0,
              rate: checksMetric.value !== undefined ? (checksMetric.value * 100).toFixed(1) : '0.0',
            },
            data_received: { count: dataRecv.count || 0, rate: dataRecv.rate || 0 },
            data_sent: { count: dataSent.count || 0, rate: dataSent.rate || 0 },
            iterations: { count: iters.count || 0, rate: iters.rate || 0 },
            iteration_duration: {
              avg: iterDuration.avg || 0,
              min: iterDuration.min || 0,
              med: iterDuration.med || 0,
              max: iterDuration.max || 0,
              p90: iterDuration['p(90)'] || 0,
              p95: iterDuration['p(95)'] || 0,
            },
            vus: { value: vusMetric.value || currentTestStatus.targetVUs },
          };
        } catch (e) {
          console.error('[k6] Error parsing summary JSON:', e);
        } finally {
          try { fs.unlinkSync(summaryJsonPath); } catch (_) {}
        }
      }

      currentTestStatus.rawSummaryText = allStdoutLines.join('\n');

      if (code !== 0) {
        if (currentTestStatus.rawSummaryText && currentTestStatus.rawSummaryText.includes('setup() execution timed out')) {
          currentTestStatus.healthGrade = 'CRITICAL';
          currentTestStatus.healthVerdict = 'Inisialisasi Akun Timeout: Persiapan akun melebihi batas waktu default k6 (setupTimeout). Pengujian belum sempat berjalan.';
        } else if (currentTestStatus.errorRatePercent > 5.0 || currentTestStatus.p95LatencyMs > 2000) {
          currentTestStatus.healthGrade = 'CRITICAL';
          if (currentTestStatus.p95LatencyMs > 2000) {
            currentTestStatus.healthVerdict = `SLA Terlampaui (Kritis): Latensi P95 mencapai ${currentTestStatus.p95LatencyMs}ms (Batas Kritis: 2000ms)`;
          } else {
            currentTestStatus.healthVerdict = `SLA Terlampaui (Kritis): Tingkat Error ${currentTestStatus.errorRatePercent}% melampaui batas toleransi 5%`;
          }
        } else if (currentTestStatus.errorRatePercent > 1.0 || currentTestStatus.p95LatencyMs > 1000) {
          currentTestStatus.healthGrade = 'DEGRADED';
          currentTestStatus.healthVerdict = `Kinerja Melambat (Peringatan): Respon server tertekan (Error: ${currentTestStatus.errorRatePercent}%, P95: ${currentTestStatus.p95LatencyMs}ms)`;
        } else {
          currentTestStatus.healthGrade = 'CRITICAL';
          currentTestStatus.healthVerdict = `Uji Beban Gagal (Exit Code ${code}): Threshold SLA terlampaui`;
        }
      } else {
        currentTestStatus.healthGrade = 'HEALTHY';
        currentTestStatus.healthVerdict = `Sistem Sangat Sehat: Sebanyak ${currentTestStatus.targetVUs} pasien berhasil menyelesaikan seluruh tahapan Flow ${flow} dalam ${actualElapsedSec} detik tanpa kegagalan (Error: 0.00%, Latensi P95: ${currentTestStatus.p95LatencyMs}ms).`;
      }

      broadcastLog(`[k6] Pengujian selesai dalam ${actualElapsedSec} detik dengan kode keluar: ${code}`);
      if (ioServer) {
        ioServer.emit('stress-test:completed', currentTestStatus);
      }
      broadcastProgress();
    });

    return res.json({
      success: true,
      message: `Grafana k6 berhasil dijalankan untuk Flow ${flow}`,
      data: currentTestStatus,
    });
  } catch (error) {
    console.error('[k6] Failed to spawn k6:', error);
    currentTestStatus.isRunning = false;
    activeK6Process = null;
    return res.status(500).json({
      success: false,
      message: `Gagal menjalankan k6: ${error.message}`,
    });
  }
});

/**
 * POST /api/stress-test/stop
 */
router.post('/stop', (req, res) => {
  if (!activeK6Process) {
    return res.json({
      success: true,
      message: 'Tidak ada pengujian k6 yang sedang berjalan',
      data: currentTestStatus,
    });
  }

  try {
    // Terminate process tree on Windows
    spawn('taskkill', ['/pid', String(activeK6Process.pid), '/f', '/t']);
    activeK6Process = null;
    currentTestStatus.isRunning = false;
    currentTestStatus.activeVUs = 0;

    broadcastLog('[k6] Pengujian dihentikan secara manual oleh pengguna');
    broadcastProgress();

    return res.json({
      success: true,
      message: 'Pengujian k6 berhasil dihentikan',
      data: currentTestStatus,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Gagal menghentikan proses k6: ${err.message}`,
    });
  }
});

/**
 * GET /api/stress-test/ai-insight/status
 * Check if Gemini AI Key is configured
 */
router.get('/ai-insight/status', (req, res) => {
  const isConfigured = aiInsightService.isGeminiConfigured();
  return res.json({
    success: true,
    isConfigured,
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  });
});

/**
 * POST /api/stress-test/ai-insight
 * Generate or retrieve cached AI insight based on stress test history
 */
router.post('/ai-insight', async (req, res) => {
  try {
    const { records = [], forceRefresh = false } = req.body || {};

    // If no records passed in payload, attempt to construct one from currentTestStatus if available
    let testRecords = Array.isArray(records) ? records : [];
    if (testRecords.length === 0 && currentTestStatus.totalRequests > 0) {
      testRecords = [
        {
          id: `live-${Date.now()}`,
          selectedFlow: currentTestStatus.flow,
          flowTitle: currentTestStatus.flow === '1' ? 'Konsultasi Chat AI' : currentTestStatus.flow === '2' ? 'Artikel Kesehatan' : 'Pencarian Dokter',
          targetVUs: currentTestStatus.targetVUs,
          durationSec: currentTestStatus.durationSec,
          p95LatencyMs: currentTestStatus.p95LatencyMs,
          avgLatencyMs: currentTestStatus.avgLatencyMs,
          currentRps: currentTestStatus.currentRps,
          errorRatePercent: currentTestStatus.errorRatePercent,
          healthGrade: currentTestStatus.healthGrade,
          healthVerdict: currentTestStatus.healthVerdict,
          breachedReasons: [],
          timestamp: new Date().toLocaleTimeString(),
        },
      ];
    }

    const insight = await aiInsightService.generateStressTestInsight(testRecords, Boolean(forceRefresh));

    return res.json({
      success: true,
      data: insight,
    });
  } catch (error) {
    console.error('[k6 AI Route] Failed to generate AI insight:', error);
    return res.status(500).json({
      success: false,
      message: `Gagal menghasilkan insight: ${error.message}`,
    });
  }
});

module.exports = {
  router,
  setSocketServer,
};

