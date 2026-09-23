'use strict';

require('dotenv').config();
const axios = require('axios');

/**
 * Cache in-memory to prevent re-calling Gemini on identical incidents within 3 minutes
 */
const incidentCache = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000;

function createIncidentSignature(incident = {}) {
  return `${incident.issueType || ''}::${incident.targetId || ''}::${incident.severity || ''}::${incident.metricBadge || ''}`;
}

/**
 * Rich SRE Heuristic Engine for incident troubleshooting
 * Provides deeply relevant, practical, copyable CLI commands tailored to the incident type
 */
function generateFallbackIncidentTips(incident = {}, reason = 'Heuristic SRE Engine') {
  const { issueType, severity, targetName, targetId, metricBadge, description } = incident;

  let rootCause = '';
  let steps = [];
  let preventive = '';
  let estimatedFixTimeMinutes = 5;

  // Extract useful info like service name or server name
  const cleanTarget = (targetName || 'target-service').toLowerCase();
  const guessedContainer = cleanTarget
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 30);

  if (issueType === 'server_disk') {
    estimatedFixTimeMinutes = 10;
    rootCause = `Partisi root storage server mengalami penumpukan data yang melebihi batas toleransi (${metricBadge || 'Disk Kritis'}). Penyebab paling umum adalah akumulasi cache image/kontainer Docker yang tidak terpakai, rotasi log sistem (/var/log atau journalctl) yang membengkak, atau temp files aplikasi.`;
    steps = [
      {
        step: 1,
        title: 'Cek Utilisasi & Partisi Terbesar',
        description: 'Pastikan partisi dan direktori mana yang mengonsumsi ruang disk tertinggi.',
        command: 'df -h / && du -sh /* 2>/dev/null | sort -hr | head -n 10',
      },
      {
        step: 2,
        title: 'Bersihkan Cache & Layer Docker yang Menggantung',
        description: 'Hapus image yang tidak terpakai (dangling), kontainer lama yang sudah exit, dan cache build Docker yang aman dihapus.',
        command: 'docker system prune -af --volumes',
      },
      {
        step: 3,
        title: 'Vakum & Pangkas Log Systemd Journal',
        description: 'Batasi dan bersihkan log riwayat Linux journalctl agar menyisakan log maksimal 2 hari terakhir.',
        command: 'journalctl --vacuum-time=2d',
      },
      {
        step: 4,
        title: 'Kosongkan File Log Kontainer yang Membengkak',
        description: 'Jika ada kontainer tertentu dengan log JSON raksasa, potong ukurannya ke 0 byte tanpa menghentikan kontainer.',
        command: 'truncate -s 0 /var/lib/docker/containers/*/*-json.log 2>/dev/null || true',
      },
      {
        step: 5,
        title: 'Verifikasi Pemulihan Kapasitas',
        description: 'Periksa kembali kapasitas storage untuk memastikan ruang bebas telah bertambah secara signifikan.',
        command: 'df -h /',
      },
    ];
    preventive = 'Terapkan pengaturan max-size pada logging driver Docker di /etc/docker/daemon.json (misal: {"log-driver": "json-file", "log-opts": {"max-size": "50m", "max-file": "3"}}), serta pasang cron job mingguan untuk docker system prune.';
  } else if (issueType === 'service_down') {
    estimatedFixTimeMinutes = 5;
    rootCause = `Microservice "${targetName}" tidak merespon health probe port HTTP/TCP. Kemungkinan penyebab: kontainer mengalami crash loop (misal: unhandled exception, syntax error, database disconnect), port binding bentrok (EADDRINUSE), atau kontainer berhenti karena Out-Of-Memory (OOMKilled).`;
    steps = [
      {
        step: 1,
        title: 'Periksa Status Kontainer & Uptime',
        description: 'Cari tahu apakah kontainer berstatus Exited, Restarting, atau tidak ditemukan.',
        command: `docker ps -a | grep -i "${guessedContainer.slice(0, 15)}" || docker ps -a | head -n 10`,
      },
      {
        step: 2,
        title: 'Cek 100 Baris Terakhir Log Kegagalan',
        description: 'Telusuri stack trace error, fatal exception, atau kegagalan koneksi environment.',
        command: `docker logs --tail 100 $(docker ps -a -q -f name="${guessedContainer.slice(0, 15)}" | head -n 1)`,
      },
      {
        step: 3,
        title: 'Restart Kontainer Terkait',
        description: 'Lakukan graceful restart pada kontainer service.',
        command: `docker restart $(docker ps -a -q -f name="${guessedContainer.slice(0, 15)}" | head -n 1)`,
      },
      {
        step: 4,
        title: 'Uji Respon Health Check Secara Lokal',
        description: 'Pastikan endpoint lokal atau healthcheck mengembalikan HTTP 200 OK.',
        command: 'curl -Iv http://127.0.0.1:4006/health || curl -Iv http://127.0.0.1:4007/',
      },
    ];
    preventive = 'Pastikan kontainer memiliki konfigurasi restart policy `restart: unless-stopped`, healthcheck probe terintegrasi di docker-compose, dan alokasi memory limit yang memadai untuk mencegah OOM-killer.';
  } else if (issueType === 'server_cpu') {
    estimatedFixTimeMinutes = 8;
    rootCause = `Utilisasi CPU pada server melampaui ambang batas normal. Hal ini biasanya dipicu oleh proses looping/inferensi komputasi tanpa throttling, lonjakan request mendadak, atau proses background/zombie yang tidak terlepas.`;
    steps = [
      {
        step: 1,
        title: 'Identifikasi 10 Proses Konsumsi CPU Tertinggi',
        description: 'Lihat daftar process ID (PID) dan persentase CPU yang digunakan saat ini.',
        command: 'top -b -n 1 | head -n 17',
      },
      {
        step: 2,
        title: 'Pantau Utilisasi Per Kontainer Secara Real-time',
        description: 'Cari tahu kontainer spesifik yang menyebabkan lonjakan beban.',
        command: 'docker stats --no-stream --format "table {{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}"',
      },
      {
        step: 3,
        title: 'Analisis Throttling atau Restart Worker yang Stale',
        description: 'Jika ada worker thread yang hang pada 100% CPU, lakukan restart selektif pada worker tersebut.',
        command: 'docker restart <CONTAINER_ID>',
      },
    ];
    preventive = 'Terapkan batas kuota CPU pada docker-compose (misal `deploy.resources.limits.cpus: "1.5"`), serta gunakan connection pooling dan rate limiter pada layer API Gateway.';
  } else {
    // Project Degraded / Generic
    estimatedFixTimeMinutes = 10;
    rootCause = `Domain projek terdeteksi mengalami degradasi performa karena satu atau lebih server atau microservice di dalamnya tidak berada dalam kondisi prima.`;
    steps = [
      {
        step: 1,
        title: 'Audit Seluruh Kontainer di Host Projek',
        description: 'Periksa status seluruh service yang berjalan pada server yang terhubung dengan projek ini.',
        command: 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"',
      },
      {
        step: 2,
        title: 'Periksa Latensi Jaringan Antar Service',
        description: 'Lakukan ping atau uji socket koneksi antar service ke database.',
        command: 'ping -c 3 34.101.207.115 && ping -c 3 34.101.122.171',
      },
      {
        step: 3,
        title: 'Sinkronkan Ulang Node & Service',
        description: 'Buka halaman detail projek dan refresh status telemetri untuk memverifikasi keselarasan konfigurasi.',
        command: '# Buka halaman detail projek di ObservePulse Dashboard',
      },
    ];
    preventive = 'Lakukan load testing rutin menggunakan Grafana k6 di Simulator Stress Test untuk menguji ketahanan SLA projek sebelum deployment production.';
  }

  return {
    isAiGenerated: false,
    source: reason,
    issueTitle: incident.title || 'Insiden Terdeteksi',
    targetName: targetName || 'Target',
    severity: severity || 'CRITICAL',
    metricBadge: metricBadge || '',
    rootCause,
    steps,
    preventive,
    estimatedFixTimeMinutes,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Main method: Generates AI-driven incident resolution tips using Google Gemini API
 * Falls back to SRE Heuristic Engine seamlessly if API key is not configured or fails
 */
async function generateIncidentTips(incident = {}) {
  const signature = createIncidentSignature(incident);
  const now = Date.now();

  // Check cache
  if (incidentCache.has(signature)) {
    const cached = incidentCache.get(signature);
    if (now - cached.cachedAt < CACHE_TTL_MS) {
      return {
        ...cached.data,
        fromCache: true,
      };
    }
  }

  const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
  const model = process.env.GEMINI_MODEL ? process.env.GEMINI_MODEL.trim() : 'gemini-2.5-flash';

  // If no Gemini key or placeholder, return rich SRE heuristics
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    const fallback = generateFallbackIncidentTips(
      incident,
      'SRE AI Heuristic Engine (Konfigurasi GEMINI_API_KEY di backend/.env untuk model Gemini Live)'
    );
    incidentCache.set(signature, { data: fallback, cachedAt: now });
    return fallback;
  }

  // Build Gemini Prompt
  const prompt = `
Anda adalah seorang Principal Site Reliability Engineer (SRE) dan Linux Cloud Architect kelas dunia.
Terdapat insiden kritis pada sistem telemetri ObservePulse yang memerlukan panduan troubleshooting taktis dan solutif.

Detail Insiden:
- Judul Masalah: ${incident.title || 'Insiden Terdeteksi'}
- Kategori Masalah: ${incident.issueType || 'service_down'}
- Target Komponen: ${incident.targetName || 'Unknown Component'} (ID: ${incident.targetId || 'N/A'})
- Tingkat Keparahan (Severity): ${incident.severity || 'CRITICAL'}
- Indikator Metrik: ${incident.metricBadge || 'N/A'}
- Deskripsi Insiden: ${incident.description || 'Tidak ada deskripsi rinci'}
- Rekomendasi Statis Awal: ${incident.staticRecommendation || 'N/A'}

Tugas Anda:
1. Berikan analisa akar masalah (root cause) yang mendalam, presisi, dan logis dalam bahasa Indonesia yang profesional.
2. Buat langkah-langkah penanganan bertahap (step-by-step resolution) yang KONKRET, LENGKAP dengan perintah Linux/Docker CLI nyata yang siap disalin dan dijalankan di terminal server.
3. Berikan saran pencegahan jangka panjang (preventive measure).
4. Estimasi waktu perbaikan (dalam menit).

Kembalikan HANYA JSON valid PERSIS sesuai format berikut (tanpa markdown tambahan):
{
  "rootCause": "Penjelasan mendalam akar penyebab masalah dalam 2-3 kalimat",
  "estimatedFixTimeMinutes": number (misal 5, 10, atau 15),
  "steps": [
    {
      "step": 1,
      "title": "Judul langkah teknis ringkas",
      "description": "Penjelasan mengapa perintah ini dijalankan dan apa yang dicari",
      "command": "Perintah bash / docker / linux CLI siap salin"
    }
  ],
  "preventive": "Saran jangka panjang agar masalah serupa tidak terulang (1-2 kalimat)"
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
    let parsed = null;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    const finalTips = {
      isAiGenerated: true,
      source: `Google Gemini (${model})`,
      issueTitle: incident.title || 'Insiden Terdeteksi',
      targetName: incident.targetName || 'Target',
      severity: incident.severity || 'CRITICAL',
      metricBadge: incident.metricBadge || '',
      rootCause: parsed.rootCause || 'Analisis kegagalan operasional.',
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      preventive: parsed.preventive || 'Terapkan pemantauan otomatis dan rotasi beban berkala.',
      estimatedFixTimeMinutes: parsed.estimatedFixTimeMinutes || 10,
      analyzedAt: new Date().toISOString(),
    };

    incidentCache.set(signature, { data: finalTips, cachedAt: now });
    return finalTips;
  } catch (err) {
    console.warn('[Incident AI Service] Gemini call failed or key invalid, using SRE Heuristic Engine fallback:', err?.response?.data?.error?.message || err.message);
    const fallback = generateFallbackIncidentTips(
      incident,
      `SRE AI Heuristic Engine (${err?.response?.data?.error?.message || 'Fallback lokal'})`
    );
    incidentCache.set(signature, { data: fallback, cachedAt: now });
    return fallback;
  }
}

module.exports = {
  generateIncidentTips,
  generateFallbackIncidentTips,
};
