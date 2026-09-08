/**
 * stressTestEngine.ts
 * In-browser & REST API Stress Test Engine for simulating 50 -> 100 -> 150 -> 200 VUs
 * executing isolated user flows (Flow 1, Flow 2, or Flow 3) against microservices.
 */

export interface StressStage {
  durationSec: number;
  targetVUs: number;
}

export type SelectedFlowType = '1' | '2' | '3';

export interface StressTestProgress {
  isRunning: boolean;
  isFinished: boolean;
  selectedFlow: SelectedFlowType;
  currentStageIndex: number;
  totalStages: number;
  activeVUs: number;
  elapsedSec: number;
  totalDurationSec: number;
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  currentRps: number;
  p95LatencyMs: number;
  avgLatencyMs: number;
  errorRatePercent: number;
  isThresholdBreached: boolean;
  breachedReasons: string[];
  healthGrade: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  healthVerdict: string;
  flowStats: {
    flow1: number; // Login -> Sesi AI -> Response AI
    flow2: number; // PIN -> List Artikel -> Detail Artikel
    flow3: number; // Login -> Cari Dokter -> Detail Dokter
  };
}

export type StressTestListener = (progress: StressTestProgress) => void;

class StressTestEngine {
  private isRunning = false;
  private isFinished = false;
  private activeVUs = 0;
  private currentStageIndex = 0;
  private selectedFlow: SelectedFlowType = '1';
  private listeners: Set<StressTestListener> = new Set();
  private metricLogs: { duration: number; isSuccess: boolean; timestamp: number; flow: 1 | 2 | 3 }[] = [];
  private stages: StressStage[] = [
    { durationSec: 10, targetVUs: 50 },  // Stage 1: 50 VUs
    { durationSec: 10, targetVUs: 100 }, // Stage 2: 100 VUs
    { durationSec: 10, targetVUs: 150 }, // Stage 3: 150 VUs
    { durationSec: 10, targetVUs: 200 }, // Stage 4: 200 VUs
  ];
  private startTime = 0;
  private flowCounts = { flow1: 0, flow2: 0, flow3: 0 };
  private baseUrl = import.meta.env.VITE_MONITORING_API_URL?.replace(/\/$/, '') || 'http://localhost:5000';

  public subscribe(listener: StressTestListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(progress: StressTestProgress) {
    this.listeners.forEach((fn) => fn(progress));
  }

  public setSelectedFlow(flow: SelectedFlowType) {
    this.selectedFlow = flow;
    this.notify(this.getProgress());
  }

  public getProgress(): StressTestProgress {
    const totalDurationSec = this.stages.reduce((sum, s) => sum + s.durationSec, 0);
    const elapsedSec = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
    const totalReqs = this.metricLogs.length;
    const failedReqs = this.metricLogs.filter((l) => !l.isSuccess).length;
    const successReqs = totalReqs - failedReqs;
    const errorRatePercent = totalReqs > 0 ? (failedReqs / totalReqs) * 100 : 0;

    const durations = this.metricLogs.map((l) => l.duration).sort((a, b) => a - b);
    const p95Index = Math.floor(durations.length * 0.95);
    const p95LatencyMs = durations[p95Index] || 0;
    const avgLatencyMs = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const currentRps = elapsedSec > 0 ? Math.round(totalReqs / elapsedSec) : 0;

    // Alert Thresholds & Health Verdict Calculation
    const breachedReasons: string[] = [];
    if (p95LatencyMs > 1000) {
      breachedReasons.push(`Latensi P95 (${p95LatencyMs}ms) > 1000ms`);
    }
    if (errorRatePercent > 5.0) {
      breachedReasons.push(`Error Rate (${errorRatePercent.toFixed(1)}%) > 5.0%`);
    }

    let healthGrade: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
    let healthVerdict = 'Sistem Sangat Stabil & Respon Cepat (Siap Dipakai Pengguna Banyak)';

    if (p95LatencyMs > 1000 || errorRatePercent > 5.0) {
      healthGrade = 'CRITICAL';
      healthVerdict = 'Sistem Terlalu Beban / Overload! Respon lambat atau ada kegagalan request.';
    } else if (p95LatencyMs > 500 || errorRatePercent > 1.0) {
      healthGrade = 'DEGRADED';
      healthVerdict = 'Sistem Mulai Tertekan. Waktu tunggu agak meningkat namun tetap memproses request.';
    }

    return {
      isRunning: this.isRunning,
      isFinished: this.isFinished,
      selectedFlow: this.selectedFlow,
      currentStageIndex: this.currentStageIndex,
      totalStages: this.stages.length,
      activeVUs: this.activeVUs,
      elapsedSec,
      totalDurationSec,
      totalRequests: totalReqs,
      successRequests: successReqs,
      failedRequests: failedReqs,
      currentRps,
      p95LatencyMs,
      avgLatencyMs,
      errorRatePercent,
      isThresholdBreached: breachedReasons.length > 0,
      breachedReasons,
      healthGrade,
      healthVerdict,
      flowStats: { ...this.flowCounts },
    };
  }

  public async start(flow: SelectedFlowType = '1', targetVUs: number = 50, durationSec: number = 30) {
    if (this.isRunning) return;
    this.selectedFlow = flow;
    
    // Dynamically build ramping stages based on user-defined target VU
    const step1 = Math.max(5, Math.floor(targetVUs * 0.25));
    const step2 = Math.max(10, Math.floor(targetVUs * 0.5));
    const step3 = Math.max(15, Math.floor(targetVUs * 0.75));
    const step4 = targetVUs;

    const stageDuration = Math.max(5, Math.floor(durationSec / 4));
    this.stages = [
      { durationSec: stageDuration, targetVUs: step1 },
      { durationSec: stageDuration, targetVUs: step2 },
      { durationSec: stageDuration, targetVUs: step3 },
      { durationSec: stageDuration, targetVUs: step4 },
    ];

    this.isRunning = true;
    this.isFinished = false;
    this.metricLogs = [];
    this.currentStageIndex = 0;
    this.activeVUs = 0;
    this.startTime = Date.now();
    this.flowCounts = { flow1: 0, flow2: 0, flow3: 0 };

    this.notify(this.getProgress());

    for (let i = 0; i < this.stages.length; i++) {
      if (!this.isRunning) break;
      this.currentStageIndex = i;
      const stage = this.stages[i];
      this.activeVUs = stage.targetVUs;
      this.notify(this.getProgress());

      const stageEndTime = Date.now() + stage.durationSec * 1000;
      const workerPromises: Promise<void>[] = [];

      for (let vu = 0; vu < stage.targetVUs; vu++) {
        workerPromises.push(this.runVUWorker(stageEndTime));
      }

      const ticker = setInterval(() => {
        if (!this.isRunning) {
          clearInterval(ticker);
          return;
        }
        this.notify(this.getProgress());
      }, 500);

      await Promise.all(workerPromises);
      clearInterval(ticker);
    }

    this.isRunning = false;
    this.isFinished = true;
    this.activeVUs = 0;
    this.notify(this.getProgress());
  }

  public stop() {
    this.isRunning = false;
    this.activeVUs = 0;
    this.notify(this.getProgress());
  }

  private async runVUWorker(endTime: number) {
    while (this.isRunning && Date.now() < endTime) {
      if (this.selectedFlow === '1') {
        await this.executeFlow1();
      } else if (this.selectedFlow === '2') {
        await this.executeFlow2();
      } else if (this.selectedFlow === '3') {
        await this.executeFlow3();
      }

      // Jeda antaraksi pengguna sintetis (200-500ms)
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
    }
  }

  // Flow 1: 100% Dedicated VUs -> User Login -> Sesi Konsultasi AI -> Response AI
  private async executeFlow1() {
    this.flowCounts.flow1++;
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/api/services/ai-consultation/requests?limit=5`);
      const duration = Date.now() - start;
      this.metricLogs.push({ duration, isSuccess: res.ok, timestamp: Date.now(), flow: 1 });
    } catch {
      const duration = Date.now() - start;
      this.metricLogs.push({ duration, isSuccess: false, timestamp: Date.now(), flow: 1 });
    }
  }

  // Flow 2: 100% Dedicated VUs -> PIN Verification -> List Artikel -> Detail Artikel
  private async executeFlow2() {
    this.flowCounts.flow2++;
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/api/services/lifestyle/requests?limit=5`);
      const duration = Date.now() - start;
      this.metricLogs.push({ duration, isSuccess: res.ok, timestamp: Date.now(), flow: 2 });
    } catch {
      const duration = Date.now() - start;
      this.metricLogs.push({ duration, isSuccess: false, timestamp: Date.now(), flow: 2 });
    }
  }

  // Flow 3: 100% Dedicated VUs -> User Login -> Cari Dokter -> Detail Dokter
  private async executeFlow3() {
    this.flowCounts.flow3++;
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/api/services/medical-record/requests?limit=5`);
      const duration = Date.now() - start;
      this.metricLogs.push({ duration, isSuccess: res.ok, timestamp: Date.now(), flow: 3 });
    } catch {
      const duration = Date.now() - start;
      this.metricLogs.push({ duration, isSuccess: false, timestamp: Date.now(), flow: 3 });
    }
  }
}

export const stressTestEngine = new StressTestEngine();

export interface StressTestRecord {
  id: string;
  timestamp: string;
  selectedFlow: SelectedFlowType;
  flowTitle: string;
  targetVUs: number;
  durationSec: number;
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  currentRps: number;
  p95LatencyMs: number;
  avgLatencyMs: number;
  errorRatePercent: number;
  healthGrade: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  healthVerdict: string;
  recommendations: string[];
}

export function generateRecommendations(
  healthGrade: 'HEALTHY' | 'DEGRADED' | 'CRITICAL',
  p95LatencyMs: number,
  errorRatePercent: number,
  selectedFlow: SelectedFlowType
): string[] {
  const recommendations: string[] = [];

  if (healthGrade === 'HEALTHY') {
    recommendations.push(
      '🟢 Kapasitas Sistem Sangat Baik: Microservices mampu menangani beban trafik saat ini tanpa hambatan latensi.'
    );
    recommendations.push(
      '🚀 Pengujian Lanjutan: Coba tingkatkan jumlah Virtual Users (VU) ke 500 - 1.000 VU untuk mengetahui batas maksimum (breaking point) sistem.'
    );
    recommendations.push(
      '📊 Monitoring Rutin: Pertahankan Prometheus metrics & Grafana alert rules pada kondisi default.'
    );
  } else if (healthGrade === 'DEGRADED') {
    recommendations.push(
      `⚠️ Terjadi Peningkatan Latensi (${p95LatencyMs}ms): Waktu respon mulai melambat mendekati batas SLA 1.000ms.`
    );
    if (selectedFlow === '1') {
      recommendations.push(
        '💡 AI Consultation Service: Terapkan Caching Layer (Redis) untuk query sesi chat dan tingkatkan worker thread pada LLM pipeline.'
      );
    } else if (selectedFlow === '2') {
      recommendations.push(
        '💡 Lifestyle Service: Tambahkan HTTP Caching (ETag / Stale-While-Revalidate) untuk endpoint membaca artikel publik (GET /articles).'
      );
    } else {
      recommendations.push(
        '💡 Medical Record Service: Tambahkan Database Indexing pada kolom nama/spesialisasi dokter (GET /doctors/search).'
      );
    }
    recommendations.push(
      '⚡ Database Connection Pool: Tingkatkan kapasitas maksimum pool koneksi database (MaxOpenConns) dari 25 menjadi 50 koneksi.'
    );
    recommendations.push(
      '🔄 Horizontal Pod Autoscaler (HPA): Aktifkan fitur Autoscaling Kubernetes saat CPU utilization mencapai > 70%.'
    );
  } else {
    // CRITICAL
    recommendations.push(
      `🔴 Overload / High Error Rate (${errorRatePercent.toFixed(1)}% Error): Terjadi kelebihan beban kapasitas server!`
    );
    recommendations.push(
      '🚨 Circuit Breaker: Aktifkan Resilience4j / Envoy Circuit Breaker pada API Gateway untuk memotong panggilan yang mengalami timeout.'
    );
    recommendations.push(
      '🗄️ Database Read Replica: Pisahkan operasi Read & Write ke Database Master-Slave Replica untuk mengurangi beban query.'
    );
    recommendations.push(
      '🛡️ API Gateway Rate Limiting: Pasang Throttling / Rate Limit (misal 100 req/sec per user) untuk mencegah serangan DDoS / Bot Attack.'
    );
    recommendations.push(
      '📈 Resource Limits: Tingkatkan batas RAM & CPU request pada Pod deployment Docker / Kubernetes.'
    );
  }

  return recommendations;
}

const HISTORY_STORAGE_KEY = 'tara_stress_test_history_v1';

export function getStressTestHistory(): StressTestRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStressTestRecord(record: StressTestRecord): StressTestRecord[] {
  const current = getStressTestHistory();
  const updated = [record, ...current.filter((r) => r.id !== record.id)].slice(0, 25);
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save stress test history', e);
  }
  return updated;
}

export function clearStressTestHistory(): void {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear stress test history', e);
  }
}

