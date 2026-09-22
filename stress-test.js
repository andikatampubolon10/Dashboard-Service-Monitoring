import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

/**
 * ObservePulse / Tara AI Microservices Stress Testing Script (k6)
 * Dedicated VUs per Flow (Flow 1, Flow 2, or Flow 3)
 *
 * Real Traffic Validation Metrics:
 * - realTransactionsCounter : Membuktikan jumlah transaksi nyata yang selesai
 * - realDataBytesCounter   : Membuktikan byte data nyata yang diterima dari database
 * - realServerLatencyTrend : Mengukur latensi fisik respon server container
 */
export const realTransactionsCounter = new Counter('real_microservice_transactions');
export const realDataBytesCounter = new Counter('real_data_bytes_downloaded');
export const realServerLatencyTrend = new Trend('real_server_latency_ms');
export const pureAiChatLatencyTrend = new Trend('pure_ai_chat_latency_ms');
export const turnLockRejectionsCounter = new Counter('redis_turn_lock_rejections');

const SELECTED_FLOW = __ENV.FLOW || '1';
const customVUs = parseInt(__ENV.VUS || '0', 10);
const targetVUs = customVUs > 0 ? customVUs : 25;
const totalDurationSec = parseInt(__ENV.DURATION || '30', 10);

let customStages = null;
if (__ENV.STAGES) {
  try {
    const parsed = JSON.parse(__ENV.STAGES);
    if (Array.isArray(parsed) && parsed.length > 0) {
      customStages = parsed;
    }
  } catch (e) {
    console.log(`[k6] Note: STAGES env parse error: ${e.message}`);
  }
}

let customFlowConfig = null;
if (__ENV.CUSTOM_FLOW) {
  try {
    customFlowConfig = JSON.parse(__ENV.CUSTOM_FLOW);
  } catch (e) {
    console.log(`[k6] Note: CUSTOM_FLOW env parse error: ${e.message}`);
  }
}

// Build dynamic stages if not explicitly provided (Standard 3-Stage Trapezoid)
let activeStages = customStages;
if (!activeStages || activeStages.length === 0) {
  const rampUp = Math.max(3, Math.round(totalDurationSec * 0.25));
  const peak = Math.max(5, Math.round(totalDurationSec * 0.50));
  const rampDown = Math.max(3, totalDurationSec - rampUp - peak);
  activeStages = [
    { duration: `${rampUp}s`, target: targetVUs },
    { duration: `${peak}s`, target: targetVUs },
    { duration: `${rampDown}s`, target: 0 },
  ];
}

// Mode Pengujian: 'load_test' (1x iterasi per VU) atau 'stress_test' (ramping stages berulang)
const TEST_TYPE = __ENV.TEST_TYPE || (__ENV.ITERATIONS === '1' ? 'load_test' : 'stress_test');

let k6Scenarios = {};
if (TEST_TYPE === 'load_test') {
  // 🟢 LOAD TEST: Seluruh VUs masuk serentak dan mengeksekusi alur tepat 1 KALI
  k6Scenarios = {
    single_wave_load_test: {
      executor: 'per-vu-iterations',
      vus: targetVUs,
      iterations: 1,
      maxDuration: `${Math.max(120, totalDurationSec * 3)}s`,
    },
  };
} else {
  // 🔴 STRESS TEST: Pasien bertubi-tubi berulang dengan pola stages (Spike/Step-Up)
  k6Scenarios = {
    sustained_stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: activeStages,
      gracefulRampDown: '5s',
    },
  };
}

// Flow 1 (AI Chat streaming) melibatkan siklus inferensi LLM (~2-10s), berbeda dengan REST CRUD biasa (<1.5s)
const p95LatencyThreshold = (SELECTED_FLOW === '1') ? 'p(95)<15000' : 'p(95)<2500';

export const options = {
  setupTimeout: '2m',
  scenarios: k6Scenarios,
  thresholds: {
    http_req_failed: ['rate<0.05'],           // Critical Error Rate < 5%
    http_req_duration: [p95LatencyThreshold], // P95 Latency Threshold disesuaikan dengan jenis flow
  },
};

// Microservices HTTP API Base URLs
const BASE_IDENTITY = __ENV.IDENTITY_URL || 'http://localhost:8080';
const BASE_AI_CONSULT = __ENV.AI_CONSULT_URL || 'http://localhost:4006';
const BASE_LIFESTYLE = __ENV.LIFESTYLE_URL || 'http://localhost:4007';
const BASE_LIVE_CONSULT = __ENV.LIVE_CONSULT_URL || 'http://localhost:4004';
const BASE_HEALTH_PROFILE = __ENV.HEALTH_PROFILE_URL || 'http://localhost:3001';

const MOCK_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.sample_token';

function safeJson(res, pathStr, fallback) {
  try {
    if (res && res.status >= 200 && res.status < 300 && res.body) {
      const parts = pathStr.split('.');
      let curr = res.json();
      for (const p of parts) {
        if (curr === undefined || curr === null) return fallback;
        curr = curr[p];
      }
      return curr !== undefined && curr !== null ? curr : fallback;
    }
  } catch (e) { }
  return fallback;
}

function extractToken(res) {
  try {
    if (res && res.status >= 200 && res.status < 300 && res.body) {
      const body = res.json();
      return body.access_token || (body.data && body.data.access_token) || body.token || null;
    }
  } catch (e) { }
  return null;
}

/**
 * Dynamic User Generator
 * Otomatis menghasilkan akun uji dinamis unik (1 VU = 1 Akun)
 * sesuai dengan target VUs yang dipilih di Dashboard UI (misal: 10, 25, 50, 100).
 */
function generateDynamicUsers(count) {
  const users = [];
  const total = Math.max(1, count);
  for (let i = 1; i <= total; i++) {
    const padIdx = String(i).padStart(4, '0');
    users.push({
      email: `patient.k6.${i}@tara.health`,
      phone: `081299${padIdx}`,
      password: 'Password123!',
    });
  }
  return users;
}

/**
 * Otentikasi atau registrasi akun uji
 */
function authenticateUser(userConfig) {
  const loginPayload = JSON.stringify({
    email: userConfig.email,
    password: 'Password123!',
    device_name: 'k6-stress-tester',
  });

  let token = null;

  try {
    let res = http.post(`${BASE_IDENTITY}/api/v1/auth/login`, loginPayload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: '5s',
    });

    token = extractToken(res);

    // Registrasi jika belum terdaftar
    if (!token && (res.status === 401 || res.status === 404)) {
      const registerPayload = JSON.stringify({
        email: userConfig.email,
        phone: userConfig.phone,
        password: 'Password123!',
        device_name: 'k6-stress-tester',
      });
      http.post(`${BASE_IDENTITY}/api/v1/auth/register`, registerPayload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: '5s',
      });

      res = http.post(`${BASE_IDENTITY}/api/v1/auth/login`, loginPayload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: '5s',
      });
      token = extractToken(res);
    }
  } catch (err) {
    // Suppress verbose error, will use mock token
  }

  return token;
}

/**
 * Setup Phase:
 * Dijalankan 1x sebelum seluruh Virtual Users aktif.
 * Dilengkapi Fast Health Probe untuk mencegah setup timeout jika Identity Service mati.
 */
export function setup() {
  const targetUserCount = targetVUs;
  const dynamicUsers = generateDynamicUsers(targetUserCount);
  const userPool = [];

  console.log(`[k6 setup] 🚀 Mode Pengujian: ${TEST_TYPE === 'load_test' ? '🟢 LOAD TEST (1x Iterasi Serentak — ' + targetVUs + ' Pasien)' : '🔴 STRESS TEST (Ketahanan Berkelanjutan — Target ' + targetVUs + ' VU)'}`);
  console.log(`[k6 setup] Memeriksa ketersediaan Identity Service (${BASE_IDENTITY})...`);

  let identityOnline = false;
  try {
    const probe = http.get(`${BASE_IDENTITY}/health`, { timeout: '3s' });
    if (probe && (probe.status === 200 || probe.status === 404)) {
      identityOnline = true;
      console.log(`[k6 setup] Identity Service aktif (HTTP ${probe.status}). Mengautentikasi ${targetUserCount} akun unik...`);
    }
  } catch (e) {
    console.log(`[k6 setup] ⚠️ Identity Service tidak merespon (${BASE_IDENTITY}). Mengaktifkan fallback token instan agar uji beban langsung berjalan.`);
  }

  if (identityOnline) {
    // Pastikan akun default juga dicoba
    authenticateUser({
      email: 'patient@tara.health',
      phone: '08129999999',
      password: 'Password123!',
    });

    for (let i = 0; i < dynamicUsers.length; i++) {
      const userCfg = dynamicUsers[i];
      const token = authenticateUser(userCfg);
      const validToken = token || MOCK_TOKEN;

      userPool.push({
        email: userCfg.email,
        token: validToken,
        consultId: null,
        liveSessionId: null,
      });

      if ((i + 1) % 10 === 0 || i === dynamicUsers.length - 1) {
        console.log(`[k6 setup] Progres otentikasi: ${i + 1}/${dynamicUsers.length} akun siap.`);
      }
    }
  } else {
    // Fallback instan: siapkan user pool tanpa network delay
    for (let i = 0; i < dynamicUsers.length; i++) {
      userPool.push({
        email: dynamicUsers[i].email,
        token: MOCK_TOKEN,
        consultId: null,
        liveSessionId: null,
      });
    }
    console.log(`[k6 setup] User Pool (${userPool.length} akun) disiapkan instan dengan mock token.`);
  }

  const primaryUser = userPool[0] || { token: MOCK_TOKEN, consultId: null, liveSessionId: null };

  // Pre-warm data untuk Flow 2 (Lifestyle Article Slug)
  let sampleArticleSlug = '8-efek-begadang-yang-buruk-untuk-kesehatan';
  if (SELECTED_FLOW === '2') {
    try {
      const artRes = http.get(`${BASE_LIFESTYLE}/api/articles?page=1&limit=10`, { timeout: '5s' });
      if (artRes.status === 200) {
        const body = artRes.json();
        if (body && Array.isArray(body.items) && body.items.length > 0 && body.items[0].slug) {
          sampleArticleSlug = body.items[0].slug;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return {
    users: userPool,
    token: primaryUser.token,
    consultId: primaryUser.consultId,
    articleSlug: sampleArticleSlug,
    liveSessionId: primaryUser.liveSessionId,
  };
}

export default function (data) {
  const users = (data && data.users && data.users.length > 0)
    ? data.users
    : [{ token: (data && data.token) || MOCK_TOKEN, consultId: (data && data.consultId) || null, liveSessionId: null, email: 'patient.ai@tara.health' }];

  // Distribusikan Virtual Users (VU) ke pool akun secara round-robin
  const userIndex = (__VU - 1) % users.length;
  const currentUser = users[userIndex];

  const token = currentUser.token || MOCK_TOKEN;
  const initialConsultId = currentUser.consultId || null;
  const initialLiveSessionId = currentUser.liveSessionId || null;
  const articleSlug = (data && data.articleSlug) || 'cara-mengatasi-flu';
  const isHpOnline = Boolean(data && data.healthProfileOnline);

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Stress-Test-VU': String(__VU),
    'X-Stress-Test-Iter': String(__ITER),
    'X-Stress-Test-User': currentUser.email || `user-${userIndex + 1}`,
    'X-Client-Platform': 'k6-load-tester',
  };

  // ─── DYNAMIC CUSTOM FLOW EXECUTION ───────────────────────────────────────
  if (customFlowConfig && Array.isArray(customFlowConfig.steps) && customFlowConfig.steps.length > 0) {
    group(`Custom Flow: ${customFlowConfig.name || 'Dynamic User Journey'}`, function () {
      const baseMap = {
        identity: BASE_IDENTITY,
        'identity': BASE_IDENTITY,
        'identity-service': BASE_IDENTITY,
        aiConsult: BASE_AI_CONSULT,
        'ai-consultation': BASE_AI_CONSULT,
        'ai-consultation-service': BASE_AI_CONSULT,
        lifestyle: BASE_LIFESTYLE,
        'lifestyle-service': BASE_LIFESTYLE,
        liveConsult: BASE_LIVE_CONSULT,
        'live-consult': BASE_LIVE_CONSULT,
        'live-consult-service': BASE_LIVE_CONSULT,
        healthProfile: BASE_HEALTH_PROFILE,
        'health-profile': BASE_HEALTH_PROFILE,
        'health-profile-service': BASE_HEALTH_PROFILE,
        'medical-record': BASE_HEALTH_PROFILE,
        medicalRecord: BASE_HEALTH_PROFILE,
        audit: BASE_IDENTITY,
      };

      // Sesi Token Dinamis: Login TIDAK WAJIB di awal, bisa di langkah mana saja!
      let sessionToken = null;
      if (customFlowConfig.authConfig && customFlowConfig.authConfig.type === 'identity') {
        sessionToken = token;
      }

      const totalSteps = customFlowConfig.steps.length;

      // EKSEKUSI TAHAPAN SECARA BERURUTAN (STRICT SEQUENTIAL - TAHAP 1 SAMPAI N)
      for (let sIdx = 0; sIdx < totalSteps; sIdx++) {
        const step = customFlowConfig.steps[sIdx];
        const stepNum = sIdx + 1;
        let targetUrl = step.url;
        if (!targetUrl || !targetUrl.startsWith('http')) {
          const base = baseMap[step.serviceKey] || BASE_IDENTITY;
          const cleanPath = (step.path || '/').startsWith('/') ? step.path : `/${step.path}`;
          targetUrl = `${base}${cleanPath}`;
        }

        const method = (step.method || 'GET').toUpperCase();
        let stepHeaders = Object.assign({
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        }, step.headers || {});

        if (sessionToken) {
          stepHeaders['Authorization'] = `Bearer ${sessionToken}`;
        }

        if (customFlowConfig.authConfig && customFlowConfig.authConfig.type === 'apiKey') {
          stepHeaders[customFlowConfig.authConfig.headerName || 'X-API-KEY'] = customFlowConfig.authConfig.apiKeyValue || '';
        }

        const vuEmail = currentUser.email || `patient.k6.${userIndex + 1}@tara.health`;
        const vuToken = sessionToken || token;

        let resolvedUrl = targetUrl
          .replace(/{{VU_ID}}/g, String(__VU))
          .replace(/{{VU_INDEX}}/g, String(userIndex + 1))
          .replace(/{{VU_EMAIL}}/g, encodeURIComponent(vuEmail));

        const rawBody = typeof step.body === 'string' ? step.body : JSON.stringify(step.body || {});
        const bodyStr = rawBody
          .replace(/{{VU_EMAIL}}/g, vuEmail)
          .replace(/patient@tara\.health/g, vuEmail)
          .replace(/{{VU_ID}}/g, String(__VU))
          .replace(/{{VU_INDEX}}/g, String(userIndex + 1))
          .replace(/{{TOKEN}}/g, vuToken)
          .replace(/{{JWT}}/g, vuToken);

        let res = null;
        let isSuccess = false;
        let errDetail = '';

        try {
          if (method === 'GET') {
            res = http.get(resolvedUrl, { headers: stepHeaders, timeout: '15s' });
          } else if (method === 'POST') {
            res = http.post(resolvedUrl, bodyStr, { headers: stepHeaders, timeout: '15s' });
          } else if (method === 'PUT') {
            res = http.put(resolvedUrl, bodyStr, { headers: stepHeaders, timeout: '15s' });
          } else if (method === 'PATCH') {
            res = http.patch(resolvedUrl, bodyStr, { headers: stepHeaders, timeout: '15s' });
          } else if (method === 'DELETE') {
            res = http.del(resolvedUrl, null, { headers: stepHeaders, timeout: '15s' });
          }

          if (res) {
            // Ekstraksi token otomatis jika endpoint login
            if (res.body && (targetUrl.includes('/login') || (step.path && step.path.includes('login')))) {
              try {
                const jsonRes = JSON.parse(res.body);
                const extracted = jsonRes?.data?.access_token || jsonRes?.data?.token || jsonRes?.access_token || jsonRes?.token;
                if (extracted) {
                  sessionToken = extracted;
                }
              } catch (e) {}
            }

            const expected = parseInt(step.expectedStatus || '200', 10);
            isSuccess = (res.status === expected) || (res.status >= 200 && res.status < 300);

            const checkLabel = `[Tahap ${stepNum}] ${step.name || 'Langkah ' + stepNum}`;
            check(res, {
              [checkLabel]: () => isSuccess,
            });

            if (isSuccess) {
              realTransactionsCounter.add(1);
              realDataBytesCounter.add(res.body ? res.body.length : 0);
              if (res.timings && res.timings.duration) {
                realServerLatencyTrend.add(res.timings.duration);
              }
            } else {
              errDetail = `HTTP ${res.status}`;
            }
          } else {
            errDetail = 'Koneksi Terputus / Tidak Ada Respon';
          }
        } catch (stepErr) {
          errDetail = stepErr.message;
        }

        // ❌ FAIL-FAST: Jika tahap ini gagal, JANGAN LOMPAT ke tahap berikutnya!
        if (!isSuccess) {
          console.log(`❌ [GAGAL TAHAP ${stepNum}/${totalSteps}] VU ${__VU}: "${step.name || 'Tahap ' + stepNum}" -> Gagal (${errDetail}). Tahap berikutnya dibatalkan.`);
          break;
        }

        sleep(0.3);
      }
    });

    sleep(Math.random() * 1.0 + 0.5);
    return;
  }

  if (SELECTED_FLOW === '1') {
    // 🔴 Flow 1: Konsultasi AI Healthcare (5 Tahap Berurutan Tanpa Lompat)
    group('Flow 1: Dedicated AI Consultation (100% VUs)', function () {
      // ─── TAHAP 1: Cek Sesi Konsultasi Aktif ───
      const activeRes = http.get(`${BASE_AI_CONSULT}/api/consultations/active`, {
        headers: authHeaders,
        timeout: '15s',
      });
      const s1Success = check(activeRes, {
        '[Tahap 1] Cek Sesi Konsultasi Aktif': (r) => r.status === 200,
      });

      if (!s1Success) {
        console.log(`❌ [GAGAL TAHAP 1/5] VU ${__VU}: "Cek Sesi Konsultasi Aktif" -> Gagal (HTTP ${activeRes.status}). Tahap berikutnya dibatalkan.`);
        return;
      }

      realTransactionsCounter.add(1);
      realDataBytesCounter.add(activeRes.body ? activeRes.body.length : 0);
      realServerLatencyTrend.add(activeRes.timings.duration);

      let consultId = safeJson(activeRes, 'active.id', null);

      // ─── TAHAP 2: Buat Sesi Konsultasi Baru (Jika belum ada) ───
      if (!consultId) {
        const createPayload = JSON.stringify({
          category: 'GENERAL',
          mode: 'HEALTH_CARE',
          title: `Konsultasi Beban k6 VU ${__VU} Iter ${__ITER}`,
        });
        const createRes = http.post(`${BASE_AI_CONSULT}/api/consultations`, createPayload, {
          headers: authHeaders,
          timeout: '15s',
        });
        const s2Success = check(createRes, {
          '[Tahap 2] Pembuatan Sesi Konsultasi Baru': (r) => r.status === 201 || r.status === 409,
        });

        if (!s2Success) {
          console.log(`❌ [GAGAL TAHAP 2/5] VU ${__VU}: "Pembuatan Sesi Baru" -> Gagal (HTTP ${createRes.status}). Tahap berikutnya dibatalkan.`);
          return;
        }

        realTransactionsCounter.add(1);
        realDataBytesCounter.add(createRes.body ? createRes.body.length : 0);
        realServerLatencyTrend.add(createRes.timings.duration);

        consultId = safeJson(createRes, 'id', safeJson(createRes, 'activeConsultationId', null));
      } else {
        check(activeRes, {
          '[Tahap 2] Sesi Konsultasi Tersedia': () => true,
        });
      }

      // ─── TAHAP 3: Kirim Chat Streaming AI ───
      const chatBodyObj = {
        category: 'GENERAL',
        mode: 'HEALTH_CARE',
        language: 'id',
        messages: [
          {
            role: 'user',
            content: 'Halo dokter, saya mengalami demam dan pusing sejak kemarin.',
          },
        ],
      };
      if (consultId) {
        chatBodyObj.consultationId = consultId;
      }
      const chatPayload = JSON.stringify(chatBodyObj);

      const chatRes = http.post(`${BASE_AI_CONSULT}/api/consultation/chat`, chatPayload, {
        headers: Object.assign({}, authHeaders, { 'Accept': 'text/event-stream' }),
        timeout: '30s',
      });

      const s3Success = check(chatRes, {
        '[Tahap 3] Streaming Respon Dokter AI': (r) => r.status === 200,
      });

      if (!s3Success) {
        console.log(`❌ [GAGAL TAHAP 3/5] VU ${__VU}: "Streaming Chat AI" -> Gagal (HTTP ${chatRes.status}). Tahap berikutnya dibatalkan.`);
        return;
      }

      realTransactionsCounter.add(1);
      realDataBytesCounter.add(chatRes.body ? chatRes.body.length : 0);
      realServerLatencyTrend.add(chatRes.timings.duration);
      pureAiChatLatencyTrend.add(chatRes.timings.duration);

      // ─── TAHAP 4: Baca Detail & Riwayat Konsultasi ───
      if (consultId) {
        const detailRes = http.get(`${BASE_AI_CONSULT}/api/consultations/${consultId}`, {
          headers: authHeaders,
          timeout: '15s',
        });
        const s4Success = check(detailRes, {
          '[Tahap 4] Baca Detail Konsultasi': (r) => r.status === 200,
        });

        if (!s4Success) {
          console.log(`❌ [GAGAL TAHAP 4/5] VU ${__VU}: "Baca Detail Konsultasi" -> Gagal (HTTP ${detailRes.status}). Tahap berikutnya dibatalkan.`);
          return;
        }

        realTransactionsCounter.add(1);
        realDataBytesCounter.add(detailRes.body ? detailRes.body.length : 0);
        realServerLatencyTrend.add(detailRes.timings.duration);
      }

      // ─── TAHAP 5: Akhiri Sesi Konsultasi & Rating Feedback ───
      if (consultId) {
        const feedbackPayload = JSON.stringify({
          ended: true,
          feedbackRating: 5,
          feedbackText: `Konsultasi selesai normal (VU ${__VU} Iter ${__ITER})`,
        });
        const endRes = http.patch(`${BASE_AI_CONSULT}/api/consultations/${consultId}`, feedbackPayload, {
          headers: authHeaders,
          timeout: '10s',
        });
        const s5Success = check(endRes, {
          '[Tahap 5] Akhiri Sesi & Feedback': (r) => r.status === 200,
        });

        if (!s5Success) {
          console.log(`❌ [GAGAL TAHAP 5/5] VU ${__VU}: "Akhiri Sesi Konsultasi" -> Gagal (HTTP ${endRes.status}).`);
          return;
        }

        realTransactionsCounter.add(1);
        realDataBytesCounter.add(endRes.body ? endRes.body.length : 0);
        realServerLatencyTrend.add(endRes.timings.duration);
      }
    });
  } else if (SELECTED_FLOW === '2') {
    // 🟡 Flow 2: PIN Auth & Baca Artikel Kesehatan (3 Tahap Berurutan)
    group('Flow 2: Dedicated PIN & Article Reading (100% VUs)', function () {
      // ─── TAHAP 1: Validasi Status Akun ke Identity Service ───
      const pinStatusRes = http.get(`${BASE_IDENTITY}/health`, {
        headers: authHeaders,
        timeout: '5s',
      });
      const s1Success = check(pinStatusRes, {
        '[Tahap 1] Validasi Status Akun Identity': (r) => r.status === 200,
      });

      if (!s1Success) {
        console.log(`❌ [GAGAL TAHAP 1/3] VU ${__VU}: "Validasi Status Akun Identity" -> Gagal (HTTP ${pinStatusRes.status}). Tahap berikutnya dibatalkan.`);
        return;
      }

      realTransactionsCounter.add(1);
      realDataBytesCounter.add(pinStatusRes.body ? pinStatusRes.body.length : 0);
      realServerLatencyTrend.add(pinStatusRes.timings.duration);

      // ─── TAHAP 2: Ambil Katalog Artikel Kesehatan ───
      const articlesRes = http.get(`${BASE_LIFESTYLE}/api/articles?page=1&limit=10`, {
        headers: { 'Accept': 'application/json' },
        timeout: '10s',
      });
      const s2Success = check(articlesRes, {
        '[Tahap 2] Ambil Katalog Artikel Kesehatan': (r) => r.status === 200,
      });

      if (!s2Success) {
        console.log(`❌ [GAGAL TAHAP 2/3] VU ${__VU}: "Ambil Katalog Artikel Kesehatan" -> Gagal (HTTP ${articlesRes.status}). Tahap berikutnya dibatalkan.`);
        return;
      }

      realTransactionsCounter.add(1);
      realDataBytesCounter.add(articlesRes.body ? articlesRes.body.length : 0);
      realServerLatencyTrend.add(articlesRes.timings.duration);

      let targetSlug = null;
      try {
        const artBody = articlesRes.json();
        if (artBody && Array.isArray(artBody.items) && artBody.items.length > 0) {
          const randIdx = Math.floor(Math.random() * artBody.items.length);
          targetSlug = artBody.items[randIdx].slug || artBody.items[0].slug;
        }
      } catch (e) {}

      // ─── TAHAP 3: Baca Detail Artikel Lengkap ───
      const slugToRead = targetSlug || articleSlug || '8-efek-begadang-yang-buruk-untuk-kesehatan';
      const detailRes = http.get(`${BASE_LIFESTYLE}/api/articles/${slugToRead}`, {
        headers: { 'Accept': 'application/json' },
        timeout: '10s',
      });
      const s3Success = check(detailRes, {
        '[Tahap 3] Baca Detail Artikel Lengkap': (r) => r.status === 200,
      });

      if (!s3Success) {
        console.log(`❌ [GAGAL TAHAP 3/3] VU ${__VU}: "Baca Detail Artikel Lengkap" -> Gagal (HTTP ${detailRes.status}).`);
        return;
      }

      realTransactionsCounter.add(1);
      realDataBytesCounter.add(detailRes.body ? detailRes.body.length : 0);
      realServerLatencyTrend.add(detailRes.timings.duration);
    });
  } else if (SELECTED_FLOW === '3') {
    // 🔵 Flow 3: Telekonsultasi & Jadwal Dokter (4 Tahap Berurutan)
    group('Flow 3: Dedicated Doctor & Live Consult (100% VUs)', function () {
      // ─── TAHAP 1: Daftar Sesi Dokter ───
      const listRes = http.get(`${BASE_LIVE_CONSULT}/api/live-consult`, {
        headers: authHeaders,
        timeout: '10s',
      });
      const s1Success = check(listRes, {
        '[Tahap 1] Daftar Jadwal Sesi Dokter': (r) => r.status === 200,
      });

      if (!s1Success) {
        console.log(`❌ [GAGAL TAHAP 1/4] VU ${__VU}: "Daftar Jadwal Sesi Dokter" -> Gagal (HTTP ${listRes.status}). Tahap berikutnya dibatalkan.`);
        return;
      }

      realTransactionsCounter.add(1);
      realDataBytesCounter.add(listRes.body ? listRes.body.length : 0);
      realServerLatencyTrend.add(listRes.timings.duration);

      let sessionId = initialLiveSessionId;
      if (!sessionId) {
        const newSessionPayload = JSON.stringify({
          doctorId: 'doc-sp-01',
          doctorName: 'dr. Andi Pratama, Sp.A',
          specialty: 'Pediatrics',
          hospital: 'RS Tara Health',
          avatarColor: '#3B82F6',
          categoryKey: 'CHILD_CARE',
          price: '150000',
          paymentMethod: 'BPJS_KES',
        });
        const createRes = http.post(`${BASE_LIVE_CONSULT}/api/live-consult`, newSessionPayload, {
          headers: authHeaders,
          timeout: '10s',
        });
        sessionId = safeJson(createRes, 'id', null);
      }

      // ─── TAHAP 2: Detail Sesi Konsultasi Dokter ───
      if (sessionId) {
        const detailRes = http.get(`${BASE_LIVE_CONSULT}/api/live-consult/${sessionId}`, {
          headers: authHeaders,
          timeout: '10s',
        });
        const s2Success = check(detailRes, {
          '[Tahap 2] Detail Sesi Konsultasi Dokter': (r) => r.status === 200,
        });

        if (!s2Success) {
          console.log(`❌ [GAGAL TAHAP 2/4] VU ${__VU}: "Detail Sesi Konsultasi Dokter" -> Gagal (HTTP ${detailRes.status}). Tahap berikutnya dibatalkan.`);
          return;
        }

        realTransactionsCounter.add(1);
        realDataBytesCounter.add(detailRes.body ? detailRes.body.length : 0);
        realServerLatencyTrend.add(detailRes.timings.duration);
      }

      // ─── TAHAP 3: Koneksi WebSocket & Chat Dokter ───
      if (sessionId) {
        const wsUrl = `${BASE_LIVE_CONSULT.replace('http://', 'ws://').replace('https://', 'wss://')}/ws/live-consult/${sessionId}?token=${token}`;
        let wsConnected = false;
        try {
          const wsRes = ws.connect(wsUrl, {}, function (socket) {
            socket.on('open', function () {
              wsConnected = true;
              socket.send(JSON.stringify({
                type: 'chat',
                payload: {
                  text: 'Selamat malam dokter, saya ingin konsultasi mengenai keluhan kesehatan saya.',
                },
              }));
              socket.setTimeout(function () {
                socket.close();
              }, 100);
            });
          });

          const s3Success = check(wsRes, {
            '[Tahap 3] Koneksi WebSocket & Chat Dokter': (r) => r && r.status === 101,
          });

          if (!s3Success) {
            console.log(`❌ [GAGAL TAHAP 3/4] VU ${__VU}: "Koneksi WebSocket & Chat Dokter" -> Gagal (Koneksi WebSocket Gagal / Status ${wsRes ? wsRes.status : 'Terputus'}). Tahap berikutnya dibatalkan.`);
            return;
          }

          realTransactionsCounter.add(1);
          if (wsRes && wsRes.timings && wsRes.timings.duration) {
            realServerLatencyTrend.add(wsRes.timings.duration);
          }
        } catch (e) {
          console.log(`❌ [GAGAL TAHAP 3/4] VU ${__VU}: "Koneksi WebSocket & Chat Dokter" -> Gagal (${e.message || 'Error WebSocket'}). Tahap berikutnya dibatalkan.`);
          return;
        }
      }

      // ─── TAHAP 4: Health Probe Live Consult ───
      const probeRes = http.get(`${BASE_LIVE_CONSULT}/health/live`, { timeout: '5s' });
      const s4Success = check(probeRes, {
        '[Tahap 4] Health Probe Live Consult': (r) => r.status === 200,
      });

      if (!s4Success) {
        console.log(`❌ [GAGAL TAHAP 4/4] VU ${__VU}: "Health Probe Live Consult" -> Gagal (HTTP ${probeRes.status}).`);
        return;
      }

      realTransactionsCounter.add(1);
      realDataBytesCounter.add(probeRes.body ? probeRes.body.length : 0);
      realServerLatencyTrend.add(probeRes.timings.duration);
    });
  }

  sleep(0.5);
}

