'use strict';

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
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
  avgLatencyMs: 0,
  totalRequests: 0,
  failedRequests: 0,
  errorRatePercent: 0,
  healthGrade: 'HEALTHY',
  healthVerdict: 'Sistem siap diuji',
  recentLogs: [],
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

    const avgMatch = text.match(/avg=([\d.]+)(µs|us|ms|s)/i);
    if (avgMatch) {
      currentTestStatus.avgLatencyMs = parseDurationToMs(avgMatch[1], avgMatch[2]);
    }
  }

  const reqsMatch = text.match(/http_reqs[\s.]+:\s*(\d+)/i);
  if (reqsMatch) {
    currentTestStatus.totalRequests = parseInt(reqsMatch[1], 10);
  }

  const failedMatch = text.match(/http_req_failed[\s.]+:\s*([\d.]+)%/i);
  if (failedMatch) {
    currentTestStatus.errorRatePercent = parseFloat(failedMatch[1]);
  }

  // Update Health Grade & Verdict
  if (text.includes('thresholds on metrics') && text.includes('crossed')) {
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

  const args = [
    'run',
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
      ? `Identity (${identityUrl}) | Health Profile (${healthProfileUrl}) | Lifestyle (${lifestyleUrl})`
      : `Identity (${identityUrl}) | Live Consult (${liveConsultUrl})`;

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
      avgLatencyMs: 0,
      totalRequests: 0,
      failedRequests: 0,
      errorRatePercent: 0,
      healthGrade: 'HEALTHY',
      healthVerdict: `Menguji Flow ${flow} (${activeEndpointsDesc}) dengan ${targetVUs} VUs selama ${durationSec} detik...`,
      recentLogs: [
        `[k6] Memulai pengujian Grafana k6 untuk Flow ${flow} (${targetVUs} VUs, ${durationSec}s)...`,
        `[k6 Target] ${activeEndpointsDesc}`,
      ],
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
      if (currentTestStatus.currentRps === 0) {
        currentTestStatus.currentRps = Math.floor(targetVUs * 1.5);
      }
      broadcastProgress();
    }, 1000);

    activeK6Process.stdout.on('data', (data) => {
      const output = data.toString();
      const lines = output.split(/\r?\n/);
      lines.forEach((line) => {
        if (line.trim()) {
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
      activeK6Process = null;

      if (code !== 0) {
        if (currentTestStatus.errorRatePercent > 5.0 || currentTestStatus.p95LatencyMs > 2000) {
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
      }

      broadcastLog(`[k6] Pengujian selesai dengan kode keluar: ${code}`);
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

module.exports = {
  router,
  setSocketServer,
};
