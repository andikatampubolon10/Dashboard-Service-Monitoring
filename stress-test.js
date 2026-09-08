import http from 'k6/http';
import { check, sleep, group } from 'k6';

/**
 * ObservePulse / Tara AI Microservices Stress Testing Script (k6)
 * Run 100% Dedicated VUs per Flow (Flow 1, Flow 2, or Flow 3):
 * 
 * Flow 1: k6 run --env FLOW=1 stress-test.js
 * Flow 2: k6 run --env FLOW=2 stress-test.js
 * Flow 3: k6 run --env FLOW=3 stress-test.js
 */

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Stage 1: 50 VUs (Warmup)
    { duration: '1m',  target: 100 }, // Stage 2: 100 VUs (Sustained)
    { duration: '1m',  target: 150 }, // Stage 3: 150 VUs (Stress)
    { duration: '1m',  target: 200 }, // Stage 4: 200 VUs (Peak)
    { duration: '30s', target: 0 },   // Stage 5: Ramp-down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],     // Critical Error Rate < 5%
    http_req_duration: ['p(95)<1000'], // Latency P95 < 1000ms
  },
};

const BASE_IDENTITY = 'http://localhost:8080';
const BASE_AI_CONSULT = 'http://localhost:4006';
const BASE_LIFESTYLE = 'http://localhost:4007';
const BASE_MEDICAL = 'http://localhost:3002';

const MOCK_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.sample_token';
const SELECTED_FLOW = __ENV.FLOW || '1';

export default function () {
  if (SELECTED_FLOW === '1') {
    // 🔴 100% Dedicated VUs -> Flow 1: User Login -> Sesi Konsultasi AI -> Response AI
    group('Flow 1: Dedicated AI Consultation (100% VUs)', function () {
      const loginPayload = JSON.stringify({
        email: 'patient.ai@tara.health',
        password: 'Password123!',
      });
      const loginRes = http.post(`${BASE_IDENTITY}/auth/login`, loginPayload, {
        headers: { 'Content-Type': 'application/json' },
      });
      check(loginRes, { 'login status 200': (r) => r.status === 200 });

      const token = loginRes.json('token') || MOCK_TOKEN;

      const createPayload = JSON.stringify({
        title: 'Konsultasi Demam & Batuk',
        language: 'id',
      });
      const createRes = http.post(`${BASE_AI_CONSULT}/api/consultations`, createPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      check(createRes, { 'create consultation 201/200': (r) => r.status === 201 || r.status === 200 });

      const consultId = createRes.json('id') || 'cons-990011';

      const chatPayload = JSON.stringify({
        message: 'Saya mengalami demam 38 derajat dan batuk kering, apa pertolongan pertamanya?',
        stream: false,
      });
      const chatRes = http.post(`${BASE_AI_CONSULT}/api/consultations/${consultId}/chat`, chatPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      check(chatRes, { 'AI response received 200': (r) => r.status === 200 });
    });
  } else if (SELECTED_FLOW === '2') {
    // 🟡 100% Dedicated VUs -> Flow 2: PIN Auth -> List Artikel -> Detail Artikel
    group('Flow 2: Dedicated Article Reading (100% VUs)', function () {
      const pinPayload = JSON.stringify({ pin: '123456' });
      const pinRes = http.post(`${BASE_IDENTITY}/auth/pin`, pinPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MOCK_TOKEN}`,
        },
      });
      check(pinRes, { 'PIN verification 200': (r) => r.status === 200 });

      const articlesRes = http.get(`${BASE_LIFESTYLE}/api/articles?category=health&page=1&limit=10`, {
        headers: { 'Authorization': `Bearer ${MOCK_TOKEN}` },
      });
      check(articlesRes, { 'articles list 200': (r) => r.status === 200 });

      const articleDetailRes = http.get(`${BASE_LIFESTYLE}/api/articles/art-1001`, {
        headers: { 'Authorization': `Bearer ${MOCK_TOKEN}` },
      });
      check(articleDetailRes, { 'article detail 200': (r) => r.status === 200 });
    });
  } else if (SELECTED_FLOW === '3') {
    // 🔵 100% Dedicated VUs -> Flow 3: User Login -> Cari Dokter -> Detail Dokter
    group('Flow 3: Dedicated Doctor Discovery (100% VUs)', function () {
      const loginPayload = JSON.stringify({
        email: 'user.patient@tara.health',
        password: 'Password123!',
      });
      const loginRes = http.post(`${BASE_IDENTITY}/auth/login`, loginPayload, {
        headers: { 'Content-Type': 'application/json' },
      });
      check(loginRes, { 'login status 200': (r) => r.status === 200 });

      const token = loginRes.json('token') || MOCK_TOKEN;

      const searchRes = http.get(`${BASE_MEDICAL}/api/doctors/search?specialty=general_practitioner&limit=20`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      check(searchRes, { 'doctor search 200': (r) => r.status === 200 });

      const detailRes = http.get(`${BASE_MEDICAL}/api/doctors/doc-5001`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      check(detailRes, { 'doctor detail 200': (r) => r.status === 200 });
    });
  }

  sleep(1);
}
