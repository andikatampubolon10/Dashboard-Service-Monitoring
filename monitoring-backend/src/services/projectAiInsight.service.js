'use strict';

require('dotenv').config();
const axios = require('axios');

/**
 * In-memory cache to prevent redundant Gemini API calls on page reloads
 */
const cachedProjectInsights = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * Generate a cache key signature from project telemetry
 */
function createProjectSignature(project = {}) {
  const serverMetrics = (project.servers || []).map((s) => {
    const cpu = s.system?.cpu?.usagePercent ?? 0;
    const mem = s.system?.memory?.usagePercent ?? 0;
    const disk = s.system?.disk?.usagePercent ?? 0;
    const srvCount = (s.servicesData || s.services || []).length;
    const upCount = (s.servicesData || s.services || []).filter((x) => x.status === 'UP' || x.status === 'healthy').length;
    return `${s.id || s.name}-${cpu}-${mem}-${disk}-${upCount}/${srvCount}`;
  }).join('|');

  return `${project.id || 'proj'}-${project.status || 'UNKNOWN'}-${project.serversCount || 0}-${serverMetrics}`;
}

/**
 * Fallback local SRE heuristic insight generator when GEMINI_API_KEY is not configured or on network error
 */
function generateFallbackProjectInsight(project = {}, reason = 'Heuristic SRE Engine') {
  const serverCount = project.serversCount || (project.servers ? project.servers.length : 0);
  const servicesCount = project.servicesCount || 0;
  const upServices = project.upServicesCount || 0;
  const downServices = project.downServicesCount || 0;
  const agg = project.aggregateMetrics || {
    avgCpuPercent: 0,
    memoryUsedPercent: 0,
    diskUsedPercent: 0,
  };

  const servers = project.servers || [];

  // Identify highest pressure node
  let highestPressureNode = servers[0]?.displayName || servers[0]?.name || 'Node-Cluster';
  let maxMemoryUsage = 0;
  let maxCpuUsage = 0;
  let hasMemoryPressure = false;
  let hasServiceImbalance = false;

  const serverWorkloads = [];

  servers.forEach((s) => {
    const sName = s.displayName || s.name || s.id;
    const sMem = s.system?.memory?.usagePercent ?? 0;
    const sCpu = s.system?.cpu?.usagePercent ?? 0;
    const sSrvs = (s.servicesData || s.services || []).length;

    serverWorkloads.push({ name: sName, services: sSrvs, mem: sMem, cpu: sCpu });

    if (sMem > maxMemoryUsage) {
      maxMemoryUsage = sMem;
      highestPressureNode = sName;
    }
    if (sCpu > maxCpuUsage) {
      maxCpuUsage = sCpu;
    }
    if (sMem >= 70) {
      hasMemoryPressure = true;
    }
  });

  // Check workload imbalance between nodes
  if (serverWorkloads.length >= 2) {
    const svcCounts = serverWorkloads.map((w) => w.services);
    const minSvc = Math.min(...svcCounts);
    const maxSvc = Math.max(...svcCounts);
    if (maxSvc >= minSvc * 2 && maxSvc > 2) {
      hasServiceImbalance = true;
    }
  }

  // Calculate Availability / Health Score
  const availabilityScore = servicesCount > 0
    ? parseFloat(((upServices / servicesCount) * 100).toFixed(1))
    : 100;

  let healthScore = 95;
  let verdict = 'OPTIMAL';

  if (downServices > 0 || availabilityScore < 90) {
    healthScore = Math.max(45, Math.round(availabilityScore * 0.7));
    verdict = 'DEGRADED';
  } else if (hasMemoryPressure || agg.memoryUsedPercent > 65 || hasServiceImbalance) {
    healthScore = 82;
    verdict = 'ATTENTION';
  }

  // Anomalies list
  const anomalies = [];
  if (downServices > 0) {
    anomalies.push({
      severity: 'CRITICAL',
      title: `${downServices} Microservice Mengalami Gangguan (Offline)`,
      component: project.name || 'Microservices Cluster',
      description: `Terdapat ${downServices} dari total ${servicesCount} layanan yang berstatus DOWN atau tidak merespons health-check probe.`,
    });
  }

  if (hasMemoryPressure) {
    anomalies.push({
      severity: 'WARNING',
      title: `Tekanan Memori Tinggi pada Host (${maxMemoryUsage}% RAM)`,
      component: highestPressureNode,
      description: `Host ${highestPressureNode} mendekati ambang batas peringatan 70% memori. Berisiko memicu proses swap atau throttling kontainer.`,
    });
  }

  if (hasServiceImbalance) {
    anomalies.push({
      severity: 'INFO',
      title: 'Distribusi Alokasi Microservice Tidak Seimbang (Workload Imbalance)',
      component: 'Cluster Topology',
      description: `Terdapat konsentrasi kontainer service yang lebih padat di salah satu host sementara host lainnya memiliki kapasitas idle lebih tinggi.`,
    });
  }

  if (anomalies.length === 0) {
    anomalies.push({
      severity: 'INFO',
      title: 'Seluruh Layanan dan Host Beroperasi Sesuai Baseline',
      component: 'Cluster Infrastructure',
      description: `Tidak ditemukan lonjakan konsumsi resource CPU/Disk maupun service crash dalam siklus monitoring terkini.`,
    });
  }

  // Recommendations list
  const actionableRecommendations = [];
  if (hasServiceImbalance) {
    actionableRecommendations.push({
      priority: 'HIGH',
      category: 'CAPACITY',
      title: 'Distribusi Ulang Alokasi Microservice Antar Host',
      action: `Pindahkan sebagian kontainer microservice dari ${highestPressureNode} ke node pendamping yang utilisasinya lebih rendah untuk meratakan beban RAM.`,
      impact: 'Mencegah bottleneck memori dan menurunkan risiko single-point-of-failure pada host utama.',
    });
  }

  if (hasMemoryPressure || agg.memoryUsedPercent > 60) {
    actionableRecommendations.push({
      priority: 'MEDIUM',
      category: 'PERFORMANCE',
      title: 'Terapkan Memory Limits & Caching Optimization',
      action: 'Konfigurasikan batas maksimal memory limit (--memory) pada setiap kontainer Docker dan optimalkan connection pooling database.',
      impact: 'Mencegah OOM (Out Of Memory) Killer mematikan proses backend kritis saat lonjakan traffic.',
    });
  } else {
    actionableRecommendations.push({
      priority: 'MEDIUM',
      category: 'RESILIENCE',
      title: 'Konfigurasi Automated Health Failover & SLA Alerting',
      action: 'Aktifkan notifikasi otomatis berbasis ambang batas P99 latency > 800ms dan error rate > 1% untuk deteksi dini.',
      impact: 'Mempercepat Mean Time to Detect (MTTD) sebelum degradasi dirasakan oleh pengguna akhir.',
    });
  }

  actionableRecommendations.push({
    priority: 'LOW',
    category: 'SECURITY',
    title: 'Audit Port Listener & Isolasi Jaringan Internal',
    action: 'Pastikan port database dan internal RPC hanya terbuka pada antarmuka localhost atau private VPC backend IDC.',
    impact: 'Memperkuat postur keamanan cluster dan mencegah eksposur port langsung ke internet publik.',
  });

  return {
    isAiGenerated: false,
    source: 'fallback-heuristic',
    note: reason,
    verdict,
    healthScore,
    headline: verdict === 'OPTIMAL'
      ? `Infrastruktur Projek ${project.name || ''} Stabil dengan SLA ${availabilityScore}%`
      : verdict === 'ATTENTION'
        ? `Perlu Perhatian: Ketimpangan Beban & Tekanan Memori pada ${highestPressureNode}`
        : `Degradasi Terdeteksi: ${downServices} Layanan Offline pada Projek ${project.name || ''}`,
    summary: `Projek ${project.name || 'ini'} mengelola ${serverCount} host server dan ${servicesCount} microservice terdaftar (${upServices} aktif). Rata-rata utilisasi CPU berada di angka ${agg.avgCpuPercent}%, pemakaian memori cluster ${agg.memoryUsedPercent}%, dengan konsentrasi beban tertinggi berada pada node ${highestPressureNode}.`,
    slaAssessment: {
      availabilityScore,
      riskLevel: downServices > 0 ? 'TINGGI' : (hasMemoryPressure ? 'SEDANG' : 'RENDAH'),
      verdictText: availabilityScore >= 99
        ? 'Memenuhi target SLA Tier-1 (99.0%+ uptime).'
        : availabilityScore >= 95
          ? 'Mendekati batas toleransi SLA. Memerlukan penanganan pada service yang degraded.'
          : 'SLA berada di bawah standar operasional. Diperlukan tindakan pemulihan segera.',
    },
    saturationAnalysis: {
      highestPressureNode,
      limitingResource: hasMemoryPressure ? 'MEMORY' : (agg.avgCpuPercent > 60 ? 'CPU' : 'MEMORY'),
      capacityHeadroom: agg.memoryUsedPercent < 60 ? 'Tinggi (+50% beban traffic)' : 'Moderat (+25% beban traffic)',
      imbalanceNote: hasServiceImbalance
        ? `Terdapat disparitas alokasi service: sebagian server menampung beban 2x lebih banyak daripada node lain.`
        : 'Distribusi beban dan kontainer service di seluruh host terpantau cukup merata.',
    },
    anomalies,
    actionableRecommendations,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Main service method: Analyze project infrastructure using Google Gemini 1.5 Flash API
 */
async function generateProjectInfrastructureInsight(project = {}, forceRefresh = false) {
  const signature = createProjectSignature(project);
  const now = Date.now();

  // Return cached result if still valid and not forcing refresh
  if (!forceRefresh && cachedProjectInsights.has(signature)) {
    const cached = cachedProjectInsights.get(signature);
    if (now - cached.cachedAt < CACHE_TTL_MS) {
      return {
        ...cached.data,
        fromCache: true,
      };
    }
  }

  const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
  const model = process.env.GEMINI_MODEL ? process.env.GEMINI_MODEL.trim() : 'gemini-2.5-flash';

  // If no API key provided, gracefully fallback to rich local SRE heuristic
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    const fallback = generateFallbackProjectInsight(
      project,
      'GEMINI_API_KEY belum dikonfigurasi di monitoring-backend/.env. Menampilkan analisis Heuristic SRE Engine otomatis.'
    );
    cachedProjectInsights.set(signature, { data: fallback, cachedAt: now });
    return fallback;
  }

  // Format concise server & service telemetry payload for Gemini prompt
  const serverSummaries = (project.servers || []).map((s, idx) => ({
    serverIndex: idx + 1,
    name: s.displayName || s.name,
    ip: s.ip || s.host,
    env: s.env,
    status: s.status,
    uptime: s.uptime,
    cpuUsagePercent: s.system?.cpu?.usagePercent ?? 0,
    memoryUsagePercent: s.system?.memory?.usagePercent ?? 0,
    totalMemoryMb: s.system?.memory?.totalMb ?? 0,
    usedMemoryMb: s.system?.memory?.usedMb ?? 0,
    diskUsagePercent: s.system?.disk?.usagePercent ?? 0,
    servicesCount: (s.servicesData || s.services || []).length,
    services: (s.servicesData || s.services || []).map((svc) => ({
      name: svc.name || svc.id,
      stack: svc.stack,
      status: svc.status,
      latencyMs: svc.p99LatencyMs || 0,
      throughputRps: svc.reqPerSecond || 0,
      errorRate: svc.errorRatePercent || 0,
    })),
    databases: (s.databases || []).map((db) => ({
      name: db.name || db.engine,
      engine: db.engine,
      status: db.status,
    })),
  }));

  const telemetryPayload = {
    projectId: project.id,
    projectName: project.name,
    environment: project.env || 'PRODUCTION',
    totalServers: project.serversCount || serverSummaries.length,
    totalServices: project.servicesCount || 0,
    upServices: project.upServicesCount || 0,
    downServices: project.downServicesCount || 0,
    clusterAggregates: project.aggregateMetrics || {},
    servers: serverSummaries,
  };

  const prompt = `
Anda adalah seorang Principal Site Reliability Engineer (SRE), Cloud Infrastructure Architect, dan Performance Engineer kelas dunia yang berpengalaman menangani arsitektur enterprise mirip Datadog Watchdog, New Relic Applied Intelligence, dan Dynatrace Davis AI.

Tugas Anda adalah melakukan audit mendalam dan menghasilkan INSIGHT INFRASTRUKTUR yang tajam, eksekutif, dan sangat informatif untuk projek "${project.name || 'Projek'}":
\`\`\`json
${JSON.stringify(telemetryPayload, null, 2)}
\`\`\`

Fokus Analisis Anda:
1. SLA & Availability Health: Berapa estimasi ketersediaan riil, risiko kegagalan, dan ketahanan SLA.
2. Resource Saturation & Bottlenecks: Node mana yang paling tertekan (RAM/CPU/Disk), apakah ada ketimpangan beban (misal satu server menampung 6 service sementara server lain hanya 3 service).
3. Deteksi Anomali & Outlier: Temukan service offline, latensi abnormal, atau ketidakseimbangan resource.
4. Actionable SRE Runbook: Berikan rekomendasi langkah konkret (DevOps/SRE) berprioritas tinggi/menengah/rendah dan prediksi dampaknya.

KEMBALIKAN HANYA OBJEK JSON VALID TANPA MARKDOWN DI LUAR JSON SESUAI FORMAT INI:
{
  "verdict": "OPTIMAL" | "ATTENTION" | "DEGRADED" | "CRITICAL",
  "healthScore": number (0-100),
  "headline": "Judul eksekutif ringkas & padat (maks 15 kata)",
  "summary": "Ringkasan eksekutif kondisi infrastruktur dan kesiapan workload projek (2-3 kalimat)",
  "slaAssessment": {
    "availabilityScore": number (misal 99.8),
    "riskLevel": "RENDAH" | "SEDANG" | "TINGGI",
    "verdictText": "Penjelasan status SLA dan tingkat risiko kehandalan"
  },
  "saturationAnalysis": {
    "highestPressureNode": "Nama host dengan tekanan beban tertinggi",
    "limitingResource": "MEMORY" | "CPU" | "DISK" | "NETWORK",
    "capacityHeadroom": "misal: Aman hingga +40% lonjakan traffic",
    "imbalanceNote": "Analisis distribusi alokasi microservice antar node host"
  },
  "anomalies": [
    {
      "severity": "CRITICAL" | "WARNING" | "INFO",
      "title": "Nama temuan/anomali",
      "component": "Host atau service yang terpengaruh",
      "description": "Penjelasan observasi dan potensi konsekuensinya"
    }
  ],
  "actionableRecommendations": [
    {
      "priority": "HIGH" | "MEDIUM" | "LOW",
      "category": "CAPACITY" | "RESILIENCE" | "SECURITY" | "PERFORMANCE",
      "title": "Judul rekomendasi teknis",
      "action": "Tindakan konkret yang harus diambil",
      "impact": "Estimasi dampak langsung setelah tindakan diterapkan"
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
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 45000,
      }
    );

    const candidates = response.data?.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error('No candidate returned by Gemini API');
    }

    const rawText = candidates[0].content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error('Empty response text from Gemini');
    }

    // Parse JSON with resiliency against markdown fences and trailing commas
    let parsed;
    try {
      const clean = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      try {
        parsed = JSON.parse(clean);
      } catch {
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) {
          const sanitized = match[0].replace(/,\s*([\]}])/g, '$1');
          parsed = JSON.parse(sanitized);
        } else {
          throw new Error('No JSON object found in response');
        }
      }
    } catch (parseErr) {
      throw new Error(`Failed to parse Gemini output: ${parseErr.message}`);
    }

    const finalInsight = {
      isAiGenerated: true,
      source: `Gemini ${model}`,
      verdict: parsed.verdict || 'OPTIMAL',
      healthScore: typeof parsed.healthScore === 'number' ? parsed.healthScore : 90,
      headline: parsed.headline || `Analisis Infrastruktur Projek ${project.name || ''}`,
      summary: parsed.summary || 'Kondisi infrastruktur dan server projek berjalan stabil.',
      slaAssessment: parsed.slaAssessment || {
        availabilityScore: 99.5,
        riskLevel: 'RENDAH',
        verdictText: 'SLA cluster memenuhi standar ketersediaan operasional.',
      },
      saturationAnalysis: parsed.saturationAnalysis || {
        highestPressureNode: serverSummaries[0]?.name || 'Node-1',
        limitingResource: 'MEMORY',
        capacityHeadroom: 'Memadai untuk traffic reguler',
        imbalanceNote: 'Distribusi beban terpantau dalam batas normal.',
      },
      anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies : [],
      actionableRecommendations: Array.isArray(parsed.actionableRecommendations) ? parsed.actionableRecommendations : [],
      analyzedAt: new Date().toISOString(),
    };

    cachedProjectInsights.set(signature, { data: finalInsight, cachedAt: now });
    return finalInsight;
  } catch (err) {
    console.warn(`[Project AI Insight] Gemini request failed (${err.message}). Falling back to heuristic.`);
    const fallback = generateFallbackProjectInsight(project, `Gemini API fallback: ${err.message}`);
    cachedProjectInsights.set(signature, { data: fallback, cachedAt: now });
    return fallback;
  }
}

module.exports = {
  generateProjectInfrastructureInsight,
  generateFallbackProjectInsight,
};
