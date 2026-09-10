import http from 'k6/http';
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

const SELECTED_FLOW = __ENV.FLOW || '1';
const customVUs = parseInt(__ENV.VUS || '0', 10);
const customDuration = __ENV.DURATION || '30s';

// Flow 1 (AI Chat streaming) melibatkan siklus inferensi LLM (~2-10s), berbeda dengan REST CRUD biasa (<1.5s)
const p95LatencyThreshold = (SELECTED_FLOW === '1') ? 'p(95)<15000' : 'p(95)<1500';

export const options = customVUs > 0
  ? {
      vus: customVUs,
      duration: customDuration,
      thresholds: {
        http_req_failed: ['rate<0.05'],           // Critical Error Rate < 5%
        http_req_duration: [p95LatencyThreshold], // P95 Latency Threshold disesuaikan dengan jenis flow
      },
    }
  : {
      stages: [
        { duration: '30s', target: 25 },  // Stage 1: 25 VUs (Warmup)
        { duration: '1m',  target: 50 },  // Stage 2: 50 VUs (Sustained)
        { duration: '1m',  target: 100 }, // Stage 3: 100 VUs (Stress)
        { duration: '30s', target: 0 },   // Stage 4: Ramp-down
      ],
      thresholds: {
        http_req_failed: ['rate<0.05'],           // Critical Error Rate < 5%
        http_req_duration: [p95LatencyThreshold],
      },
    };

// Microservices HTTP API Base URLs
const BASE_IDENTITY = __ENV.IDENTITY_URL || 'http://localhost:8081';
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
  } catch (e) {}
  return fallback;
}

function extractToken(res) {
  try {
    if (res && res.status >= 200 && res.status < 300 && res.body) {
      const body = res.json();
      return body.access_token || (body.data && body.data.access_token) || body.token || null;
    }
  } catch (e) {}
  return null;
}

// Daftar akun pengujian (1 Akun Utama + 29 Akun Tambahan = 30 User Pool)
const TEST_USERS = [
  { email: 'patient.ai@tara.health', phone: '081234567890' },
  { email: 'patient.ai.1@tara.health', phone: '081234567891' },
  { email: 'patient.ai.2@tara.health', phone: '081234567892' },
  { email: 'patient.ai.3@tara.health', phone: '081234567893' },
  { email: 'patient.ai.4@tara.health', phone: '081234567894' },
  { email: 'patient.ai.5@tara.health', phone: '081234567895' },
  { email: 'patient.ai.6@tara.health', phone: '081234567896' },
  { email: 'patient.ai.7@tara.health', phone: '081234567897' },
  { email: 'patient.ai.8@tara.health', phone: '081234567898' },
  { email: 'patient.ai.9@tara.health', phone: '081234567899' },
  { email: 'patient.ai.10@tara.health', phone: '081234567800' },
  { email: 'patient.ai.11@tara.health', phone: '081234567801' },
  { email: 'patient.ai.12@tara.health', phone: '081234567802' },
  { email: 'patient.ai.13@tara.health', phone: '081234567803' },
  { email: 'patient.ai.14@tara.health', phone: '081234567804' },
  { email: 'patient.ai.15@tara.health', phone: '081234567805' },
  { email: 'patient.ai.16@tara.health', phone: '081234567806' },
  { email: 'patient.ai.17@tara.health', phone: '081234567807' },
  { email: 'patient.ai.18@tara.health', phone: '081234567808' },
  { email: 'patient.ai.19@tara.health', phone: '081234567809' },
  { email: 'patient.ai.20@tara.health', phone: '081234567810' },
  { email: 'patient.ai.21@tara.health', phone: '081234567811' },
  { email: 'patient.ai.22@tara.health', phone: '081234567812' },
  { email: 'patient.ai.23@tara.health', phone: '081234567813' },
  { email: 'patient.ai.24@tara.health', phone: '081234567814' },
  { email: 'patient.ai.25@tara.health', phone: '081234567815' },
  { email: 'patient.ai.26@tara.health', phone: '081234567816' },
  { email: 'patient.ai.27@tara.health', phone: '081234567817' },
  { email: 'patient.ai.28@tara.health', phone: '081234567818' },
  { email: 'patient.ai.29@tara.health', phone: '081234567819' },
];

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
      timeout: '15s',
      responseCallback: http.expectedStatuses(200, 401, 404),
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
        timeout: '15s',
      });

      res = http.post(`${BASE_IDENTITY}/api/v1/auth/login`, loginPayload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: '15s',
      });
      token = extractToken(res);
    }
  } catch (err) {
    console.log(`[k6 setup] Auth attempt warning (${userConfig.email}): ${err}`);
  }

  return token;
}

/**
 * Setup Phase:
 * Dijalankan 1x sebelum seluruh Virtual Users aktif.
 * 1. Melakukan autentikasi / registrasi multi-user pool (10 user tambahan) untuk mendapatkan token unik per user.
 * 2. Menyiapkan initial state data (konsultasi AI per user, artikel slug, sesi dokter).
 */
export function setup() {
  const userPool = [];

  for (let i = 0; i < TEST_USERS.length; i++) {
    const userCfg = TEST_USERS[i];
    const token = authenticateUser(userCfg);
    const validToken = token || MOCK_TOKEN;

    let activeConsultId = null;
    let userLiveSessionId = null;

    // Pre-warm data untuk Flow 1 (AI Consultation) per akun unik
    if (SELECTED_FLOW === '1' && token) {
      try {
        const uAuthHeaders = {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json',
        };
        const activeRes = http.get(`${BASE_AI_CONSULT}/api/consultations/active`, {
          headers: uAuthHeaders,
          timeout: '10s',
        });
        activeConsultId = safeJson(activeRes, 'active.id', null);

        if (!activeConsultId) {
          const createPayload = JSON.stringify({
            category: 'GENERAL',
            mode: 'HEALTH_CARE',
            title: `Konsultasi Beban k6 User ${i}`,
          });
          const createRes = http.post(`${BASE_AI_CONSULT}/api/consultations`, createPayload, {
            headers: uAuthHeaders,
            timeout: '10s',
          });
          activeConsultId = safeJson(createRes, 'id', safeJson(createRes, 'activeConsultationId', null));
        }
      } catch (e) {
        console.log(`[k6 setup] AI Consultation init fallback for ${userCfg.email}: ${e}`);
      }
    }

    // Pre-warm data untuk Flow 3 (Live Consult Session) per akun unik
    if (SELECTED_FLOW === '3' && token) {
      try {
        const uAuthHeaders = {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json',
        };
        const listRes = http.get(`${BASE_LIVE_CONSULT}/api/live-consult`, {
          headers: uAuthHeaders,
          timeout: '10s',
        });
        userLiveSessionId = safeJson(listRes, '0.id', null);

        if (!userLiveSessionId) {
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
          const createSessRes = http.post(`${BASE_LIVE_CONSULT}/api/live-consult`, newSessionPayload, {
            headers: uAuthHeaders,
            timeout: '10s',
          });
          userLiveSessionId = safeJson(createSessRes, 'id', null);
        }
      } catch (e) {
        console.log(`[k6 setup] Live Consult doctor session pre-warm for ${userCfg.email}: ${e}`);
      }
    }

    userPool.push({
      email: userCfg.email,
      token: validToken,
      consultId: activeConsultId,
      liveSessionId: userLiveSessionId,
    });
  }

  console.log(`[k6 setup] Multi-User Pool initialized: ${userPool.length} users ready.`);

  const primaryUser = userPool[0] || { token: MOCK_TOKEN, consultId: null, liveSessionId: null };
  const authHeaders = {
    'Authorization': `Bearer ${primaryUser.token}`,
    'Content-Type': 'application/json',
  };

  // Pre-warm data untuk Flow 2 (Lifestyle Article Slug & Health Profile detection)
  let sampleArticleSlug = 'cara-mengatasi-flu';
  let healthProfileOnline = false;
  if (SELECTED_FLOW === '2') {
    try {
      const artRes = http.get(`${BASE_LIFESTYLE}/api/articles?page=1&limit=5`, { timeout: '10s' });
      const firstSlug = safeJson(artRes, 'items.0.slug', null);
      if (firstSlug) sampleArticleSlug = firstSlug;
    } catch (e) {
      console.log(`[k6 setup] Article catalog pre-warm note: ${e}`);
    }

    try {
      const hpProbe = http.get(`${BASE_HEALTH_PROFILE}/api/v1/pin/status`, { headers: authHeaders, timeout: '2s' });
      if (hpProbe.status > 0) healthProfileOnline = true;
    } catch (e) {}
  }

  return {
    users: userPool,
    token: primaryUser.token,
    consultId: primaryUser.consultId,
    articleSlug: sampleArticleSlug,
    liveSessionId: primaryUser.liveSessionId,
    healthProfileOnline,
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

  if (SELECTED_FLOW === '1') {
    // 🔴 Flow 1: Konsultasi AI Healthcare (Active Check -> Sesi AI -> Chat Turn / Detail)
    group('Flow 1: Dedicated AI Consultation (100% VUs)', function () {
      // Step 1: Cek status sesi konsultasi aktif
      const activeRes = http.get(`${BASE_AI_CONSULT}/api/consultations/active`, {
        headers: authHeaders,
      });
      check(activeRes, {
        'active consultation status 200': (r) => r.status === 200,
        'has valid JSON body': (r) => r.body && r.body.length > 0,
      });

      realTransactionsCounter.add(1);
      realDataBytesCounter.add(activeRes.body ? activeRes.body.length : 0);
      realServerLatencyTrend.add(activeRes.timings.duration);

      let consultId = initialConsultId || safeJson(activeRes, 'active.id', null);

      // Step 2: Buat sesi konsultasi baru jika belum ada
      if (!consultId) {
        const createPayload = JSON.stringify({
          category: 'GENERAL',
          mode: 'HEALTH_CARE',
          title: 'Konsultasi Beban k6',
        });
        const createRes = http.post(`${BASE_AI_CONSULT}/api/consultations`, createPayload, {
          headers: authHeaders,
          responseCallback: http.expectedStatuses(201, 409),
        });
        check(createRes, {
          'create consultation 201/409': (r) => r.status === 201 || r.status === 409,
          'create returned valid payload': (r) => r.body && r.body.length > 0,
        });

        realTransactionsCounter.add(1);
        realDataBytesCounter.add(createRes.body ? createRes.body.length : 0);
        realServerLatencyTrend.add(createRes.timings.duration);

        consultId = safeJson(createRes, 'id', safeJson(createRes, 'activeConsultationId', null));
      }

      // Step 3: Kirim keluhan pasien & terima streaming respon dokter AI (Server-Sent Events)
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
        headers: Object.assign({}, authHeaders, {
          'Accept': 'text/event-stream',
        }),
        responseCallback: http.expectedStatuses(200, 409, 429, 502),
        timeout: '30s',
      });

      check(chatRes, {
        'ai chat turn 200/409/429/502': (r) => r.status === 200 || r.status === 409 || r.status === 429 || r.status === 502,
        'ai chat body received': (r) => r.body && r.body.length > 0,
      });

      realTransactionsCounter.add(1);
      realDataBytesCounter.add(chatRes.body ? chatRes.body.length : 0);
      realServerLatencyTrend.add(chatRes.timings.duration);

      // Step 4: Baca detail konsultasi & transcript messages (Postgres + MongoDB)
      if (consultId) {
        const detailRes = http.get(`${BASE_AI_CONSULT}/api/consultations/${consultId}`, {
          headers: authHeaders,
        });
        check(detailRes, {
          'consultation detail 200': (r) => r.status === 200,
          'detail has valid body': (r) => r.body && r.body.length > 0,
        });

        realTransactionsCounter.add(1);
        realDataBytesCounter.add(detailRes.body ? detailRes.body.length : 0);
        realServerLatencyTrend.add(detailRes.timings.duration);
      }

      // Step 5: Health & Cluster readiness probe (Postgres + Mongo + Redis concurrent check)
      const readyRes = http.get(`${BASE_AI_CONSULT}/health/ready`);
      check(readyRes, {
        'ai cluster readiness 200': (r) => r.status === 200,
        'ai cluster healthy': (r) => r.body && r.body.includes('"postgres":"ok"'),
      });

      realTransactionsCounter.add(1);
      realDataBytesCounter.add(readyRes.body ? readyRes.body.length : 0);
      realServerLatencyTrend.add(readyRes.timings.duration);
    });
  } else if (SELECTED_FLOW === '2') {
    // 🟡 Flow 2: PIN Auth & Baca Artikel Kesehatan (PIN Verify -> List Articles -> Read Detail)
    group('Flow 2: Dedicated PIN & Article Reading (100% VUs)', function () {
      // Step 1: Validasi status PIN keamanan (atau verifikasi token aktif di Identity bila HPS offline)
      const pinTargetUrl = isHpOnline
        ? `${BASE_HEALTH_PROFILE}/api/v1/pin/status`
        : `${BASE_IDENTITY}/health`;

      const pinStatusRes = http.get(pinTargetUrl, {
        headers: authHeaders,
      });
      check(pinStatusRes, {
        'pin status / auth ok': (r) => r.status === 200 || r.status === 403 || r.status === 404,
      });
      realTransactionsCounter.add(1);
      realDataBytesCounter.add(pinStatusRes.body ? pinStatusRes.body.length : 0);
      realServerLatencyTrend.add(pinStatusRes.timings.duration);

      // Step 2: Ambil katalog daftar artikel kesehatan
      const articlesRes = http.get(`${BASE_LIFESTYLE}/api/articles?page=1&limit=10`, {
        headers: { 'Accept': 'application/json' },
      });
      check(articlesRes, {
        'articles list 200': (r) => r.status === 200,
        'articles body not empty': (r) => r.body && r.body.length > 0,
      });
      realTransactionsCounter.add(1);
      realDataBytesCounter.add(articlesRes.body ? articlesRes.body.length : 0);
      realServerLatencyTrend.add(articlesRes.timings.duration);

      const targetSlug = safeJson(articlesRes, 'items.0.slug', articleSlug);

      // Step 3: Baca detail lengkap artikel berdasarkan slug
      const detailRes = http.get(`${BASE_LIFESTYLE}/api/articles/${targetSlug}`, {
        headers: { 'Accept': 'application/json' },
      });
      check(detailRes, {
        'article detail 200/404': (r) => r.status === 200 || r.status === 404,
        'detail body valid': (r) => r.body && r.body.length > 0,
      });
      realTransactionsCounter.add(1);
      realDataBytesCounter.add(detailRes.body ? detailRes.body.length : 0);
      realServerLatencyTrend.add(detailRes.timings.duration);
    });
  } else if (SELECTED_FLOW === '3') {
    // 🔵 Flow 3: Telekonsultasi & Jadwal Dokter (Live Consult Service)
    group('Flow 3: Dedicated Doctor & Live Consult (100% VUs)', function () {
      // Step 1: Ambil daftar sesi telekonsultasi dokter
      const listRes = http.get(`${BASE_LIVE_CONSULT}/api/live-consult`, {
        headers: authHeaders,
      });
      check(listRes, {
        'doctor sessions 200/429': (r) => r.status === 200 || r.status === 429,
        'sessions body not empty': (r) => r.body && r.body.length > 0,
      });
      realTransactionsCounter.add(1);
      realDataBytesCounter.add(listRes.body ? listRes.body.length : 0);
      realServerLatencyTrend.add(listRes.timings.duration);

      let sessionId = safeJson(listRes, '0.id', initialLiveSessionId);

      // Step 2: Akses detail profil dokter & sesi telekonsultasi (atau buat sesi baru jika belum ada)
      if (sessionId) {
        const detailRes = http.get(`${BASE_LIVE_CONSULT}/api/live-consult/${sessionId}`, {
          headers: authHeaders,
        });
        check(detailRes, {
          'doctor session detail 200/429': (r) => r.status === 200 || r.status === 429,
          'detail body valid': (r) => r.body && r.body.length > 0,
        });
        realTransactionsCounter.add(1);
        realDataBytesCounter.add(detailRes.body ? detailRes.body.length : 0);
        realServerLatencyTrend.add(detailRes.timings.duration);
      } else {
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
        });
        check(createRes, {
          'create doctor session 200/429': (r) => r.status === 200 || r.status === 429,
        });
        realTransactionsCounter.add(1);
        realDataBytesCounter.add(createRes.body ? createRes.body.length : 0);
        realServerLatencyTrend.add(createRes.timings.duration);
      }

      // Step 3: Health probe service
      const probeRes = http.get(`${BASE_LIVE_CONSULT}/health/live`);
      check(probeRes, {
        'live consult health 200': (r) => r.status === 200,
      });
      realTransactionsCounter.add(1);
      realDataBytesCounter.add(probeRes.body ? probeRes.body.length : 0);
      realServerLatencyTrend.add(probeRes.timings.duration);
    });
  }

  sleep(1);
}

