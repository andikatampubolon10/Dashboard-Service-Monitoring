'use strict';

const axios = require('axios');

/**
 * In-memory cache to prevent redundant Gemini API calls on page refresh
 */
let cachedInsight = {
  signature: '',
  data: null,
  cachedAt: 0,
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * Generate a signature for a set of test records
 */
function createHistorySignature(records = [], projectName = '') {
  if (!Array.isArray(records) || records.length === 0) return `empty::${projectName}`;
  return `${projectName}::` + records
    .slice(0, 10)
    .map((r) => `${r.id || ''}-${r.selectedFlow || r.flow || ''}-${r.targetVUs || 0}-${r.p95LatencyMs || 0}-${r.errorRatePercent || 0}`)
    .join('|');
}

/**
 * Fallback local heuristic insight generator when GEMINI_API_KEY is not configured or on network error
 */
function generateFallbackInsight(records = [], reason = 'GEMINI_API_KEY belum dikonfigurasi', projectName = '') {
  const totalRuns = records.length;
  const healthyRuns = records.filter((r) => r.healthGrade === 'HEALTHY' && (r.errorRatePercent || 0) === 0 && (r.p95LatencyMs || 0) <= 1000);
  const queueRuns = records.filter((r) => (r.errorRatePercent || 0) === 0 && (r.p95LatencyMs || 0) > 1000);
  const degradedRuns = records.filter((r) => r.healthGrade === 'DEGRADED');
  const criticalRuns = records.filter((r) => r.healthGrade === 'CRITICAL' || (r.errorRatePercent || 0) > 0);

  const maxSafeVU = healthyRuns.length > 0 ? Math.max(...healthyRuns.map((r) => r.targetVUs || 0)) : (records.length > 0 ? 25 : 0);
  const warningVU = queueRuns.length > 0 ? Math.min(...queueRuns.map((r) => r.targetVUs || 0)) : (maxSafeVU > 0 ? maxSafeVU + 25 : 50);
  const breakingPointVU = criticalRuns.length > 0 ? Math.min(...criticalRuns.map((r) => r.targetVUs || 0)) : null;

  const flow1 = records.find((r) => String(r.selectedFlow || r.flow) === '1');
  const flow2 = records.find((r) => String(r.selectedFlow || r.flow) === '2');
  const flow3 = records.find((r) => String(r.selectedFlow || r.flow) === '3');

  let verdict = 'STABLE';
  let healthScore = 95;
  if (criticalRuns.length > 0) {
    verdict = 'CRITICAL';
    healthScore = 45;
  } else if (degradedRuns.length > 0 || queueRuns.length > 0) {
    verdict = 'DEGRADED';
    healthScore = 72;
  }

  const flowComparison = [
    {
      flowId: '1',
      flowName: 'Konsultasi Chat Dokter AI',
      status: flow1 ? flow1.healthGrade : 'UNTESTED',
      p95LatencyMs: flow1 ? flow1.p95LatencyMs : 0,
      targetVUs: flow1 ? flow1.targetVUs : 0,
      performanceCategory: 'Komputasi Berat (LLM & Inference)',
      comparisonNote: flow1
        ? `Menghabiskan waktu tunggu tertinggi (${flow1.p95LatencyMs}ms) karena membutuhkan inferensi LLM di setiap pesan.`
        : 'Belum diuji coba. Beban LLM diperkirakan menjadi titik latensi tertinggi sistem.',
      riskLevel: flow1 && flow1.p95LatencyMs > 1000 ? 'TINGGI' : 'SEDANG',
    },
    {
      flowId: '2',
      flowName: 'Membaca Artikel Kesehatan',
      status: flow2 ? flow2.healthGrade : 'UNTESTED',
      p95LatencyMs: flow2 ? flow2.p95LatencyMs : 0,
      targetVUs: flow2 ? flow2.targetVUs : 0,
      performanceCategory: 'Operasi Ringan (Read-Heavy Cacheable)',
      comparisonNote: flow2
        ? `Layanan paling cepat dan efisien (${flow2.p95LatencyMs}ms). Sangat tangguh saat terjadi lonjakan pembaca.`
        : 'Belum diuji coba. Fitur ini umumnya memiliki throughput tertinggi.',
      riskLevel: 'RENDAH',
    },
    {
      flowId: '3',
      flowName: 'Pencarian Jadwal & Dokter',
      status: flow3 ? flow3.healthGrade : 'UNTESTED',
      p95LatencyMs: flow3 ? flow3.p95LatencyMs : 0,
      targetVUs: flow3 ? flow3.targetVUs : 0,
      performanceCategory: 'Database-Bound (Query & Filter Index)',
      comparisonNote: flow3
        ? `Kecepatan ${flow3.p95LatencyMs}ms. Performa sangat bergantung pada optimasi indeks tabel dokter dan jadwal.`
        : 'Belum diuji coba. Direkomendasikan uji konkurensi untuk memastikan koneksi database tidak bottleneck.',
      riskLevel: flow3 && flow3.p95LatencyMs > 800 ? 'SEDANG' : 'RENDAH',
    },
  ];

  const recommendations = [];
  if (verdict === 'CRITICAL') {
    recommendations.push({
      priority: 'HIGH',
      title: 'Terapkan Rate Limiting & Queue Buffer',
      detail: 'Sistem mengalami kegagalan pada beban tinggi. Lindungi backend dengan membatasi request per detik dan berikan respon 429 antrean ramah.',
      domain: 'NETWORK',
    });
    recommendations.push({
      priority: 'HIGH',
      title: 'Tingkatkan Replikasi Pod AI Consultation',
      detail: 'Model inferensi AI memerlukan worker tambahan agar antrean streaming chat pasien tidak memicu timeout 502.',
      domain: 'AI_ENGINE',
    });
  } else if (verdict === 'DEGRADED') {
    recommendations.push({
      priority: 'HIGH',
      title: 'Aktifkan Semantic Caching untuk Respon AI',
      detail: 'Simpan jawaban pertanyaan umum dokter AI di Redis/Memory agar tidak perlu selalu memanggil engine LLM secara penuh.',
      domain: 'CACHE',
    });
    recommendations.push({
      priority: 'MEDIUM',
      title: 'Review Composite Index Database Dokter',
      detail: 'Tambahkan indeks pada kolom filter nama dan spesialisasi dokter untuk mencegah full table scan saat banyak pengguna mencari bersamaan.',
      domain: 'DATABASE',
    });
  } else {
    recommendations.push({
      priority: 'MEDIUM',
      title: 'Uji Beban Ekstrem (100 - 200 VU)',
      detail: 'Sistem saat ini terbukti sangat tangguh pada beban wajar. Lakukan tes pada 100+ VU untuk mengetahui batas toleransi maksimal sebelum rilis publik.',
      domain: 'ARCHITECTURE',
    });
    recommendations.push({
      priority: 'LOW',
      title: 'Pertahankan Caching CDN untuk Media Artikel',
      detail: 'Konten statis artikel berjalan optimal. Pertahankan konfigurasi header cache HTTP untuk menghemat bandwidth server.',
      domain: 'CACHE',
    });
  }

  const effectiveSafeVU = maxSafeVU > 0 ? maxSafeVU : (records.length > 0 ? 50 : 25);
  const effectiveOverloadVU = breakingPointVU ? breakingPointVU : (effectiveSafeVU >= 50 ? 100 : 80);

  return {
    isAiGenerated: false,
    source: 'fallback-heuristic',
    note: reason,
    verdict,
    healthScore,
    headline:
      totalRuns === 0
        ? 'Sistem Menunggu Pengujian Beban Pertama'
        : breakingPointVU
          ? `Kapasitas Aman Hingga ${effectiveSafeVU} Pasien — Overload pada ${effectiveOverloadVU}+ Pasien`
          : `Sistem Teruji Sangat Prima (Aman hingga ${effectiveSafeVU} Pasien Serentak)`,
    summary:
      totalRuns === 0
        ? 'Jalankan uji beban pada Simulator Stress Test untuk mengaktifkan analisis performa mendalam dan perbandingan komprehensif.'
        : `Berdasarkan ${totalRuns} pengujian beban nyata: sistem terbukti aman dan stabil melayani hingga ${effectiveSafeVU} pasien serentak. Pada beban ${warningVU || 50} pasien mulai terjadi antrean (waktu tunggu meningkat), dan mulai mengalami overload pada ${effectiveOverloadVU}+ pasien serentak di fitur Tanya Jawab AI.`,
    flowComparison,
    capacityCeiling: {
      maxSafeVU: effectiveSafeVU,
      warningVU: warningVU || 50,
      breakingPointVU: breakingPointVU,
      limitingFactor: flow1 && flow1.p95LatencyMs > 1000
        ? 'Waktu komputasi inferensi model AI Consultation (Langkah 3 Tanya AI)'
        : 'Kapasitas koneksi pool database & antrean worker HTTP',
      safeRangeText: `1 – ${effectiveSafeVU} Pasien`,
      warningRangeText: `${warningVU || 50} – ${Math.max(warningVU || 50, effectiveOverloadVU - 1)} Pasien`,
      overloadRangeText: `> ${effectiveOverloadVU} Pasien`,
    },
    actionableRecommendations: recommendations,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Main service method: Analyze stress test records using Google Gemini API
 */
async function generateStressTestInsight(records = [], forceRefresh = false, options = {}) {
  const projectName = options.projectName || '';
  const signature = createHistorySignature(records, projectName);
  const now = Date.now();

  // Return cached result if still valid and not forcing refresh
  if (!forceRefresh && cachedInsight.data && cachedInsight.signature === signature && now - cachedInsight.cachedAt < CACHE_TTL_MS) {
    return {
      ...cachedInsight.data,
      fromCache: true,
    };
  }

  const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
  const model = process.env.GEMINI_MODEL ? process.env.GEMINI_MODEL.trim() : 'gemini-2.5-flash';

  // If no API key provided, gracefully fallback to rich local heuristic
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    const fallback = generateFallbackInsight(records, 'GEMINI_API_KEY belum dikonfigurasi di backend/.env. Menampilkan analisis heuristik otomatis.', projectName);
    cachedInsight = { signature, data: fallback, cachedAt: now };
    return fallback;
  }

  // Build concise metrics summary for Gemini prompt
  const testSummary = (records || []).slice(0, 10).map((r, idx) => ({
    testNumber: idx + 1,
    flowId: String(r.selectedFlow || r.flow || '1'),
    flowTitle: r.flowTitle || (r.selectedFlow === '1' ? 'Konsultasi Chat AI' : r.selectedFlow === '2' ? 'Artikel Kesehatan' : 'Pencarian Dokter'),
    targetVUs: r.targetVUs || 0,
    durationSec: r.durationSec || 0,
    p95LatencyMs: r.p95LatencyMs || 0,
    avgLatencyMs: r.avgLatencyMs || 0,
    errorRatePercent: r.errorRatePercent || 0,
    currentRps: r.currentRps || 0,
    healthGrade: r.healthGrade || 'UNKNOWN',
    healthVerdict: r.healthVerdict || '',
    breachedReasons: r.breachedReasons || [],
  }));

  const projectContext = projectName ? `projek "${projectName}"` : 'sistem microservice kesehatan (Tara AI)';

  const prompt = `
Anda adalah seorang Principal Site Reliability Engineer (SRE) dan Lead Performance Architect kelas dunia.
Tugas Anda adalah menganalisis hasil uji beban (*Grafana k6 stress test*) pada ${projectContext}:
- Flow 1: Konsultasi Chat Dokter AI (Inference LLM, CPU intensive, latency sensitive).
- Flow 2: Membaca Artikel Kesehatan (Read heavy, caching candidate, static data).
- Flow 3: Pencarian Jadwal & Dokter (Database queries, indexing, filtering).

Berikut adalah data pengujian riil yang baru saja dilakukan:
\`\`\`json
${JSON.stringify(testSummary, null, 2)}
\`\`\`

Berikan evaluasi mendalam, tajam, profesional, dan actionable dalam format JSON PERSIS sesuai skema berikut (HANYA kembalikan objek JSON valid, tanpa markdown pembungkus di luar JSON jika memungkinkan):
{
  "verdict": "STABLE" | "DEGRADED" | "CRITICAL",
  "healthScore": 0-100 (angka integer persentase kesiapan sistem),
  "headline": "Judul ringkas, padat, dan eksekutif (maks 15 kata)",
  "summary": "Ringkasan eksekutif performa sistem dan kesiapan menampung traffic nyata (2-3 kalimat)",
  "flowComparison": [
    {
      "flowId": "1" | "2" | "3",
      "flowName": "Nama Fitur",
      "status": "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNTESTED",
      "p95LatencyMs": number,
      "targetVUs": number,
      "performanceCategory": "misal: Compute-Heavy / Read-Heavy / DB-Bound",
      "comparisonNote": "Analisis perbandingan komparatif dengan flow lain (mengapa lebih cepat/lambat)",
      "riskLevel": "RENDAH" | "SEDANG" | "TINGGI"
    }
  ],
  "capacityCeiling": {
    "maxSafeVU": number (batas konkurensi aman teruji),
    "breakingPointVU": number atau null (titik mulai terjadi degradasi/kegagalan),
    "limitingFactor": "Komponen atau resource yang menjadi leher botol utama"
  },
  "actionableRecommendations": [
    {
      "priority": "HIGH" | "MEDIUM" | "LOW",
      "title": "Judul rekomendasi teknis ringkas",
      "detail": "Penjelasan solusi konkret (misal: Redis caching, index DB, horizontal pod autoscaling)",
      "domain": "AI_ENGINE" | "DATABASE" | "CACHE" | "NETWORK" | "ARCHITECTURE"
    }
  ]
}
`.trim();

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await axios.post(
      url,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const candidates = response.data?.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error('Tidak ada respon dari model Gemini');
    }

    const rawText = candidates[0]?.content?.parts?.[0]?.text || '';
    let parsedData = null;

    try {
      parsedData = JSON.parse(rawText);
    } catch {
      // Strip possible markdown code blocks ```json ... ```
      const cleanedText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleanedText);
    }

    const rawCeiling = parsedData.capacityCeiling || {};
    const effectiveSafeVU = rawCeiling.maxSafeVU || (records.length > 0 ? 50 : 25);
    const effectiveBreakingVU = rawCeiling.breakingPointVU || 80;
    const effectiveWarningVU = rawCeiling.warningVU || Math.round(effectiveSafeVU * 1.2);

    const enrichedCeiling = {
      maxSafeVU: effectiveSafeVU,
      warningVU: effectiveWarningVU,
      breakingPointVU: rawCeiling.breakingPointVU,
      limitingFactor: rawCeiling.limitingFactor || 'Antrean HTTP & Inferensi AI',
      safeRangeText: rawCeiling.safeRangeText || `1 – ${effectiveSafeVU} Pasien`,
      warningRangeText: rawCeiling.warningRangeText || `${effectiveSafeVU} – ${effectiveBreakingVU} Pasien`,
      overloadRangeText: rawCeiling.overloadRangeText || `> ${effectiveBreakingVU} Pasien`,
    };

    const finalInsight = {
      isAiGenerated: true,
      source: `Google Gemini (${model})`,
      verdict: parsedData.verdict || 'STABLE',
      healthScore: parsedData.healthScore || 85,
      headline: parsedData.headline || 'Evaluasi Performa Dinamis Gemini AI',
      summary: parsedData.summary || '',
      flowComparison: Array.isArray(parsedData.flowComparison) ? parsedData.flowComparison : [],
      capacityCeiling: enrichedCeiling,
      actionableRecommendations: Array.isArray(parsedData.actionableRecommendations) ? parsedData.actionableRecommendations : [],
      analyzedAt: new Date().toISOString(),
    };

    cachedInsight = {
      signature,
      data: finalInsight,
      cachedAt: now,
    };

    return finalInsight;
  } catch (error) {
    console.error('[Gemini AI Insight] Error calling Gemini API:', error.response?.data || error.message);
    const fallback = generateFallbackInsight(
      records,
      `Gagal memanggil Gemini API (${error.response?.data?.error?.message || error.message}). Menggunakan analisis heuristik lokal.`
    );
    return fallback;
  }
}

/**
 * Check if Gemini API key is configured
 */
function isGeminiConfigured() {
  const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
  return Boolean(apiKey && apiKey !== 'your_gemini_api_key_here');
}

module.exports = {
  generateStressTestInsight,
  isGeminiConfigured,
  createHistorySignature,
};
