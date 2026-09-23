/**
 * stressTestEngine.ts
 * Real-time Grafana k6 On-Demand Stress Test Engine.
 * Connects frontend dashboard directly to backend k6 child_process runner via REST and Socket.IO.
 */

import { io, Socket } from 'socket.io-client';

export interface StressStage {
  durationSec: number;
  targetVUs: number;
}

export type SelectedFlowType = string;

export interface CustomFlowStep {
  id: string;
  name: string;
  serviceKey: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'WS';
  path: string;
  url?: string;
  body?: any;
  headers?: Record<string, string>;
  expectedStatus?: number;
}

export interface CustomFlowAuthConfig {
  type: 'identity' | 'custom' | 'apiKey' | 'none';
  identityServiceKey?: string;
  loginUrl?: string;
  loginPayload?: string;
  tokenField?: string;
  headerName?: string;
  apiKeyValue?: string;
}

export interface CustomFlow {
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  authConfig: CustomFlowAuthConfig;
  steps: CustomFlowStep[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ServiceEndpointsConfig {
  identity?: string;
  aiConsult?: string;
  lifestyle?: string;
  liveConsult?: string;
  healthProfile?: string;
  medical?: string;
}

export interface K6CheckItem {
  name: string;
  passes: number;
  fails: number;
  total: number;
  passRate: string;
  passed: boolean;
}

export interface K6MetricsSummary {
  http_reqs: { count: number; rate: number };
  http_req_duration: {
    avg: number;
    min: number;
    med: number;
    max: number;
    p90: number;
    p95: number;
  };
  http_req_failed: {
    rate: number;
    passes: number;
    fails: number;
  };
  checks?: {
    passes: number;
    fails: number;
    rate: string;
  };
  data_received?: { count: number; rate: number };
  data_sent?: { count: number; rate: number };
  iterations?: { count: number; rate: number };
  iteration_duration?: {
    avg: number;
    min: number;
    med: number;
    max: number;
    p90: number;
    p95: number;
  };
  vus?: { value: number };
}

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
  p90LatencyMs: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  medLatencyMs: number;
  maxLatencyMs: number;
  errorRatePercent: number;
  isThresholdBreached: boolean;
  breachedReasons: string[];
  healthGrade: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  healthVerdict: string;
  targetEndpoints?: ServiceEndpointsConfig;
  checks: K6CheckItem[];
  k6Metrics?: K6MetricsSummary | null;
  rawSummaryText?: string;
  failurePoint?: { stepNum: number; totalSteps: number; stepName: string; reason: string } | null;
  testType?: 'load_test' | 'stress_test';
  flowStats: {
    flow1: number;
    flow2: number;
    flow3: number;
    [flowKey: string]: number;
  };
}

export type StressTestListener = (progress: StressTestProgress) => void;
export type StressTestLogListener = (logs: string[]) => void;

class StressTestEngine {
  private socket: Socket | null = null;
  private isRunning = false;
  private isFinished = false;
  private activeVUs = 0;
  private selectedFlow: SelectedFlowType = '1';
  private targetVUs = 50;
  private durationSec = 30;
  private startTime = 0;
  private completedDurationSec = 0;
  private totalRequests = 0;
  private failedRequests = 0;
  private successRequests = 0;
  private currentRps = 0;
  private p95LatencyMs = 0;
  private p90LatencyMs = 0;
  private avgLatencyMs = 0;
  private minLatencyMs = 0;
  private medLatencyMs = 0;
  private maxLatencyMs = 0;
  private errorRatePercent = 0;
  private healthGrade: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
  private healthVerdict = 'Sistem Siap Diuji dengan Grafana k6';
  private breachedReasons: string[] = [];
  private logs: string[] = [];
  private targetEndpoints: ServiceEndpointsConfig = {};
  private checks: K6CheckItem[] = [];
  private k6Metrics: K6MetricsSummary | null = null;
  private rawSummaryText = '';
  private failurePoint: { stepNum: number; totalSteps: number; stepName: string; reason: string } | null = null;
  private testType: 'load_test' | 'stress_test' = 'load_test';

  private listeners: Set<StressTestListener> = new Set();
  private logListeners: Set<StressTestLogListener> = new Set();
  private savedListeners: Set<(record: any) => void> = new Set();
  private baseUrl =
    import.meta.env.VITE_MONITORING_API_URL !== undefined
      ? import.meta.env.VITE_MONITORING_API_URL.replace(/\/$/, '')
      : (import.meta.env.DEV ? 'http://localhost:5000' : '');

  constructor() {
    this.initSocket();
    this.fetchInitialStatus();
  }

  private initSocket() {
    try {
      this.socket = io(this.baseUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
      });

      this.socket.on('connect', () => {
        console.log('[k6 Socket] Connected to Monitoring Backend');
      });

      this.socket.on('stress-test:progress', (data: any) => {
        this.handleProgressUpdate(data);
      });

      this.socket.on('stress-test:log', (data: { line: string; timestamp: number }) => {
        if (data && data.line) {
          this.logs.push(data.line);
          if (this.logs.length > 250) this.logs.shift();
          this.notifyLogListeners();
        }
      });

      this.socket.on('stress-test:saved', (data: any) => {
        console.log('[k6 Socket] Result saved to MySQL database:', data?.id);
        this.notifySavedListeners(data);
      });

      this.socket.on('stress-test:completed', (data: any) => {
        this.isRunning = false;
        this.isFinished = true;
        this.activeVUs = 0;
        this.completedDurationSec = this.startTime
          ? Math.max(1, Math.round((Date.now() - this.startTime) / 1000))
          : (data?.durationSec || 6);
        if (data) {
          this.handleProgressUpdate(data);
        }
        this.notify(this.getProgress());
      });
    } catch (err) {
      console.warn('[k6 Socket] Failed to initialize socket:', err);
    }
  }

  private async fetchInitialStatus() {
    try {
      const res = await fetch(`${this.baseUrl}/api/stress-test/status`);
      if (res.ok) {
        const json = await res.json();
        // Hanya sinkronkan data real-time jika backend saat ini sedang aktif menjalankan pengujian
        if (json.data && json.data.isRunning) {
          this.handleProgressUpdate(json.data);
        } else {
          // Sistem idle (tidak sedang menguji): Pertahankan status standby yang bersih (semua metrik 0)
          if (json.data?.targetEndpoints) {
            this.targetEndpoints = json.data.targetEndpoints;
          }
        }
      }
    } catch {
      // Backend maybe still starting
    }
  }

  private handleProgressUpdate(data: any) {
    this.isRunning = Boolean(data.isRunning);
    if (data.flow) this.selectedFlow = String(data.flow) as SelectedFlowType;
    if (data.targetVUs) this.targetVUs = data.targetVUs;
    if (data.durationSec) this.durationSec = data.durationSec;
    if (data.startTime) this.startTime = data.startTime;
    if (data.targetEndpoints) this.targetEndpoints = data.targetEndpoints;
    this.activeVUs = data.activeVUs ?? (this.isRunning ? this.targetVUs : 0);
    this.currentRps = data.currentRps ?? 0;
    this.p95LatencyMs = data.p95LatencyMs ?? 0;
    this.p90LatencyMs = data.p90LatencyMs ?? 0;
    this.avgLatencyMs = data.avgLatencyMs ?? 0;
    this.minLatencyMs = data.minLatencyMs ?? 0;
    this.medLatencyMs = data.medLatencyMs ?? 0;
    this.maxLatencyMs = data.maxLatencyMs ?? 0;
    this.totalRequests = data.totalRequests ?? 0;
    this.failedRequests = data.failedRequests ?? 0;
    this.successRequests = data.successRequests ?? Math.max(0, this.totalRequests - this.failedRequests);
    this.errorRatePercent = data.errorRatePercent ?? 0;
    this.healthGrade = data.healthGrade ?? 'HEALTHY';
    this.healthVerdict = data.healthVerdict ?? 'Sistem Siap Diuji';
    if (data.checks && Array.isArray(data.checks)) this.checks = data.checks;
    if (data.k6Metrics) this.k6Metrics = data.k6Metrics;
    if (data.rawSummaryText) this.rawSummaryText = data.rawSummaryText;
    if (data.failurePoint !== undefined) this.failurePoint = data.failurePoint;
    if (data.testType) this.testType = data.testType;

    this.breachedReasons = [];
    if (this.p95LatencyMs > 1000) {
      this.breachedReasons.push(`Latensi P95 (${this.p95LatencyMs}ms) > 1000ms`);
    }
    if (this.errorRatePercent > 5.0) {
      this.breachedReasons.push(`Error Rate (${this.errorRatePercent.toFixed(1)}%) > 5.0%`);
    }

    if (data.recentLogs && Array.isArray(data.recentLogs) && this.logs.length === 0) {
      this.logs = [...data.recentLogs];
      this.notifyLogListeners();
    }

    this.notify(this.getProgress());
  }

  /**
   * Reset seluruh metrik real-time ke mode Standby / Idle bersih
   */
  public resetToIdle() {
    this.isRunning = false;
    this.isFinished = false;
    this.activeVUs = 0;
    this.totalRequests = 0;
    this.failedRequests = 0;
    this.successRequests = 0;
    this.currentRps = 0;
    this.p95LatencyMs = 0;
    this.p90LatencyMs = 0;
    this.avgLatencyMs = 0;
    this.minLatencyMs = 0;
    this.medLatencyMs = 0;
    this.maxLatencyMs = 0;
    this.errorRatePercent = 0;
    this.startTime = 0;
    this.completedDurationSec = 0;
    this.checks = [];
    this.k6Metrics = null;
    this.rawSummaryText = '';
    this.logs = [];
    this.healthGrade = 'HEALTHY';
    this.healthVerdict = 'Sistem Siap Diuji dengan Grafana k6';
    this.breachedReasons = [];
    this.notifyLogListeners();
    this.notify(this.getProgress());
  }

  public subscribe(listener: StressTestListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public subscribeLogs(listener: StressTestLogListener): () => void {
    this.logListeners.add(listener);
    listener(this.logs);
    return () => this.logListeners.delete(listener);
  }

  public subscribeSaved(listener: (data: any) => void): () => void {
    this.savedListeners.add(listener);
    return () => this.savedListeners.delete(listener);
  }

  private notify(progress: StressTestProgress) {
    this.listeners.forEach((fn) => fn(progress));
  }

  private notifyLogListeners() {
    this.logListeners.forEach((fn) => fn(this.logs));
  }

  private notifySavedListeners(data: any) {
    this.savedListeners.forEach((fn) => fn(data));
  }

  public setSelectedFlow(flow: SelectedFlowType) {
    this.selectedFlow = flow;
    if (!this.isRunning) {
      this.resetToIdle();
    } else {
      this.notify(this.getProgress());
    }
  }

  public getLogs(): string[] {
    return this.logs;
  }

  public getProgress(): StressTestProgress {
    const elapsedSec = this.isRunning
      ? (this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0)
      : (this.isFinished ? (this.completedDurationSec || (this.startTime ? Math.max(1, Math.round((Date.now() - this.startTime) / 1000)) : 0)) : 0);
    const successReqs = Math.max(0, this.totalRequests - this.failedRequests);

    return {
      isRunning: this.isRunning,
      isFinished: this.isFinished,
      testType: this.testType,
      selectedFlow: this.selectedFlow,
      currentStageIndex: this.isRunning ? 1 : 0,
      totalStages: 1,
      activeVUs: this.activeVUs,
      elapsedSec,
      totalDurationSec: this.durationSec,
      totalRequests: this.totalRequests,
      successRequests: this.successRequests || successReqs,
      failedRequests: this.failedRequests,
      currentRps: this.currentRps,
      p95LatencyMs: this.p95LatencyMs,
      p90LatencyMs: this.p90LatencyMs,
      avgLatencyMs: this.avgLatencyMs,
      minLatencyMs: this.minLatencyMs,
      medLatencyMs: this.medLatencyMs,
      maxLatencyMs: this.maxLatencyMs,
      errorRatePercent: this.errorRatePercent,
      isThresholdBreached: this.breachedReasons.length > 0,
      breachedReasons: this.breachedReasons,
      healthGrade: this.healthGrade,
      healthVerdict: this.healthVerdict,
      targetEndpoints: this.targetEndpoints,
      checks: this.checks,
      k6Metrics: this.k6Metrics,
      rawSummaryText: this.rawSummaryText,
      failurePoint: this.failurePoint,
      flowStats: {
        [String(this.selectedFlow)]: this.totalRequests,
        flow1: this.selectedFlow === '1' ? this.totalRequests : 0,
        flow2: this.selectedFlow === '2' ? this.totalRequests : 0,
        flow3: this.selectedFlow === '3' ? this.totalRequests : 0,
      },
    };
  }

  /**
   * Start real Grafana k6 execution via Backend API
   */
  public async start(
    flow: SelectedFlowType = '1',
    targetVUs: number = 50,
    durationSec: number = 30,
    serviceEndpoints?: ServiceEndpointsConfig,
    stages?: StressStage[],
    customFlow?: CustomFlow | null,
    testType: 'load_test' | 'stress_test' = 'load_test',
    projectId?: string,
    projectName?: string
  ) {
    if (this.isRunning) return;

    this.selectedFlow = flow;
    this.targetVUs = targetVUs;
    this.durationSec = durationSec;
    this.testType = testType;
    if (serviceEndpoints) {
      this.targetEndpoints = serviceEndpoints;
    }
    this.isRunning = true;
    this.isFinished = false;
    this.activeVUs = targetVUs;
    this.totalRequests = 0;
    this.failedRequests = 0;
    this.successRequests = 0;
    this.currentRps = 0;
    this.p95LatencyMs = 0;
    this.p90LatencyMs = 0;
    this.avgLatencyMs = 0;
    this.minLatencyMs = 0;
    this.medLatencyMs = 0;
    this.maxLatencyMs = 0;
    this.errorRatePercent = 0;
    this.startTime = Date.now();
    this.completedDurationSec = 0;
    this.checks = [];
    this.k6Metrics = null;
    this.rawSummaryText = '';
    this.failurePoint = null;
    this.breachedReasons = [];
    const modeLabel = testType === 'load_test' ? 'Load Test (1x Gelombang)' : 'Stress Test (Ketahanan)';
    this.logs = [`[k6 Controller] Mengirim instruksi eksekusi k6 ke backend (${modeLabel}, Flow: ${customFlow ? customFlow.name : 'Flow ' + flow}, ${targetVUs} Pasien, ${testType === 'stress_test' && stages && stages.length > 0 ? stages.length + ' Stages' : durationSec + 's'})...`];
    this.notifyLogListeners();
    this.notify(this.getProgress());

    try {
      const res = await fetch(`${this.baseUrl}/api/stress-test/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testType,
          flow,
          targetVUs,
          durationSec,
          projectId: projectId || customFlow?.projectId || undefined,
          projectName: projectName || undefined,
          serviceEndpoints: this.targetEndpoints,
          stages: stages && stages.length > 0 ? stages : undefined,
          customFlow: customFlow || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        this.isRunning = false;
        this.logs.push(`[k6 Controller ERROR] ${json.message || 'Gagal memulai k6'}`);
        this.notifyLogListeners();
        this.notify(this.getProgress());
      }
    } catch (err: any) {
      this.isRunning = false;
      this.logs.push(`[k6 Controller ERROR] Jaringan gagal: ${err.message}`);
      this.notifyLogListeners();
      this.notify(this.getProgress());
    }
  }

  /**
   * Stop running Grafana k6 process via Backend API
   */
  public async stop() {
    try {
      await fetch(`${this.baseUrl}/api/stress-test/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      console.error('[k6 Controller] Failed to stop:', err);
    }
    this.isRunning = false;
    this.activeVUs = 0;
    this.notify(this.getProgress());
  }
}

export const stressTestEngine = new StressTestEngine();

// ==========================================
// HISTORY & RECOMMENDATION HELPERS
// ==========================================

export interface StressTestRecord {
  id: string;
  projectId?: string;
  projectName?: string;
  timestamp: string;
  testType?: 'load_test' | 'stress_test';
  selectedFlow: SelectedFlowType;
  flowTitle: string;
  targetVUs: number;
  durationSec: number;
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  currentRps: number;
  p95LatencyMs: number;
  p90LatencyMs?: number;
  avgLatencyMs: number;
  minLatencyMs?: number;
  medLatencyMs?: number;
  maxLatencyMs?: number;
  errorRatePercent: number;
  healthGrade: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  healthVerdict: string;
  recommendations: string[];
  targetEndpoints?: ServiceEndpointsConfig;
  checks?: K6CheckItem[];
  k6Metrics?: K6MetricsSummary | null;
  rawSummaryText?: string;
  logs?: string[];
  failurePoint?: { stepNum: number; totalSteps: number; stepName: string; reason: string } | null;
  customSteps?: CustomFlowStep[];
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
      '🟢 Daya Tahan Sangat Tangguh: Seluruh layanan berjalan mulus tanpa antrean, dan pengguna menerima balasan dengan sangat cepat.'
    );
    recommendations.push(
      '🚀 Uji Kapasitas Lebih Tinggi: Coba naikkan jumlah pengguna menjadi 100 hingga 200 orang secara serentak untuk melihat batas maksimal kekuatan sistem.'
    );
    recommendations.push(
      '✅ Pengalaman Pengguna Prima: Waktu tunggu pengguna jauh di bawah 1 detik, sehingga aplikasi terasa sangat nyaman digunakan.'
    );
  } else if (healthGrade === 'DEGRADED') {
    recommendations.push(
      `⚠️ Waktu Balas Mulai Agak Melambat (${p95LatencyMs} milidetik): Pengguna mulai merasakan sedikit jeda saat mengakses fitur ini.`
    );
    if (selectedFlow === '1') {
      recommendations.push(
        '💡 Simpan Jawaban Cepat (Cache AI): Pertanyaan yang sering diajukan ke dokter AI sebaiknya disimpan di memori cepat agar AI tidak perlu berpikir ulang untuk pertanyaan yang sama.'
      );
    } else if (selectedFlow === '2') {
      recommendations.push(
        '💡 Pasang Salinan Berita Cepat (Cache CDN): Artikel kesehatan dapat disimpan di salinan cadangan cepat agar server tidak lelah saat banyak pembaca membuka artikel bersamaan.'
      );
    } else if (selectedFlow === '3') {
      recommendations.push(
        '💡 Buat Daftar Isi Pencarian Cepat (Index Database): Beri penanda khusus pada nama dan jadwal dokter seperti daftar isi buku agar pencarian dokter langsung ditemukan seketika.'
      );
    } else {
      recommendations.push(
        '💡 Optimasi Alur Transaksi Kustom: Periksa performa endpoint dan query database pada alur ini, serta terapkan caching pada operasi baca untuk menjaga latensi tetap rendah.'
      );
    }
    recommendations.push(
      '⚡ Perbanyak Kuota Sambungan Antrean: Tambah kapasitas antrean data agar lebih banyak pengguna bisa dilayani dalam satu detik bersamaan.'
    );
    recommendations.push(
      '🔄 Aktifkan Server Cadangan Otomatis: Siapkan komputer server tambahan yang otomatis menyala bila aplikasi mulai padat pengunjung.'
    );
  } else {
    // CRITICAL
    recommendations.push(
      `🔴 Server Kewalahan (${errorRatePercent.toFixed(1)}% Permintaan Gagal): Jumlah pengguna melebihi kapasitas daya tampung server saat ini.`
    );
    recommendations.push(
      '🚨 Pasang Sekring Pengaman Otomatis: Jika server sedang penuh, tampilkan antrean ramah kepada pengguna daripada membuat aplikasi macet total.'
    );
    recommendations.push(
      '🗄️ Pisahkan Komputer Pencari & Penyimpan Data: Pisahkan komputer khusus membaca artikel/dokter dari komputer pencatatan transaksi agar tidak saling berebut tenaga.'
    );
    recommendations.push(
      '🛡️ Pasang Pintu Pembatas Akses: Lindungi sistem dengan membatasi klik berulang yang terlalu cepat dalam satu detik untuk mencegah antrean spam.'
    );
    recommendations.push(
      '📈 Tambah Kapasitas Memori Server: Tingkatkan kapasitas memori (RAM) dan prosesor (CPU) pada komputer server Anda.'
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

const API_BASE_URL =
  import.meta.env.VITE_MONITORING_API_URL !== undefined
    ? import.meta.env.VITE_MONITORING_API_URL.replace(/\/$/, '')
    : (import.meta.env.DEV ? 'http://localhost:5000' : '');

export async function fetchCustomFlows(projectId?: string): Promise<CustomFlow[]> {
  try {
    const url = projectId
      ? `${API_BASE_URL}/api/stress-test/flows?projectId=${encodeURIComponent(projectId)}`
      : `${API_BASE_URL}/api/stress-test/flows`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.flows || [];
  } catch (err) {
    console.warn('[k6 engine] Failed to fetch custom flows:', err);
    return [];
  }
}

export async function saveCustomFlow(flow: CustomFlow): Promise<CustomFlow | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/stress-test/flows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flow),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.flow || null;
  } catch (err) {
    console.error('[k6 engine] Failed to save custom flow:', err);
    return null;
  }
}

export async function deleteCustomFlow(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/stress-test/flows/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.error('[k6 engine] Failed to delete custom flow:', err);
    return false;
  }
}

/**
 * Fetch persistent stress test history from Online PostgreSQL (NeonDB)
 */
export async function fetchDbStressTestHistory(projectId?: string): Promise<StressTestRecord[]> {
  try {
    const url = projectId
      ? `${API_BASE_URL}/api/stress-test/runs?projectId=${encodeURIComponent(projectId)}&limit=50`
      : `${API_BASE_URL}/api/stress-test/runs?limit=50`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.runs || []).map((r: any) => ({
      id: r.id,
      timestamp: new Date(r.created_at).toLocaleString('id-ID', {
        dateStyle: 'short',
        timeStyle: 'medium',
      }),
      createdAt: r.created_at,
      projectId: r.project_id,
      projectName: r.project_name,
      testType: r.test_type,
      selectedFlow: r.flow_id,
      flowTitle: r.flow_name,
      targetVUs: r.target_vus,
      durationSec: r.duration_sec,
      totalRequests: r.total_requests,
      successRequests: r.success_requests,
      failedRequests: r.failed_requests,
      currentRps: r.current_rps,
      p95LatencyMs: r.p95_latency_ms,
      p90LatencyMs: r.p90_latency_ms,
      avgLatencyMs: r.avg_latency_ms,
      minLatencyMs: r.min_latency_ms,
      maxLatencyMs: r.max_latency_ms,
      errorRatePercent: parseFloat(r.error_rate_percent || 0),
      healthGrade: r.health_grade,
      healthVerdict: r.health_verdict,
      recommendations: [],
      checks: r.checks || [],
      failurePoint: r.failure_point,
      targetEndpoints: r.target_endpoints,
      k6Metrics: r.k6_metrics,
    }));
  } catch (err) {
    console.warn('[k6 engine] Failed to fetch db history:', err);
    return [];
  }
}

/**
 * Fetch aggregated project analytics from Online PostgreSQL (NeonDB)
 */
export async function fetchProjectStressAnalytics(projectId: string) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/stress-test/projects/${encodeURIComponent(projectId)}/analytics`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.data || null;
  } catch (err) {
    console.warn('[k6 engine] Failed to fetch project analytics:', err);
    return null;
  }
}


