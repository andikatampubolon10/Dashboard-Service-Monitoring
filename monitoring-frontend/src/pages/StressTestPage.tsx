import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Zap,
  Play,
  Square,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  MessageSquare,
  BookOpen,
  Stethoscope,
  Users,
  Check,
  TrendingUp,
  FileText,
} from "lucide-react";
import {
  LineChart as ReLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  stressTestEngine,
  StressTestProgress,
  SelectedFlowType,
  StressTestRecord,
  generateRecommendations,
  getStressTestHistory,
  saveStressTestRecord,
  clearStressTestHistory,
} from "../services/stressTestEngine";
import { formatPercent, formatNumber } from "../utils/formatters";
import StressTestResultModal from "../components/monitoring/StressTestResultModal";

interface LatencyPoint {
  time: string;
  p95: number;
  rps: number;
}

export const StressTestPage = () => {
  const [progress, setProgress] = useState<StressTestProgress>(stressTestEngine.getProgress());
  const [selectedFlow, setSelectedFlow] = useState<SelectedFlowType>("1");
  const [targetVUs, setTargetVUs] = useState<number>(50);
  const durationSec = 30; // Durasi pengujian standar 30 detik
  const [chartData, setChartData] = useState<LatencyPoint[]>([]);

  const [historyRecords, setHistoryRecords] = useState<StressTestRecord[]>(() => getStressTestHistory());
  const [activeModalRecord, setActiveModalRecord] = useState<StressTestRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const prevIsRunningRef = useRef<boolean>(false);

  useEffect(() => {
    const unsubscribe = stressTestEngine.subscribe((p) => {
      setProgress(p);

      if (p.isRunning) {
        setChartData((prev) => {
          const nowStr = new Date().toLocaleTimeString("id-ID", {
            minute: "2-digit",
            second: "2-digit",
          });
          const newPoint: LatencyPoint = {
            time: nowStr,
            p95: p.p95LatencyMs,
            rps: p.currentRps,
          };
          const updated = [...prev, newPoint];
          return updated.slice(-30);
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Detect completion of stress test run & auto open result modal
  useEffect(() => {
    if (prevIsRunningRef.current && !progress.isRunning && progress.isFinished && progress.totalRequests > 0) {
      const flowTitles: Record<SelectedFlowType, string> = {
        "1": "Flow 1: Konsultasi AI Healthcare",
        "2": "Flow 2: PIN & Baca Artikel",
        "3": "Flow 3: Pencarian & Profil Dokter",
      };

      const recs = generateRecommendations(
        progress.healthGrade,
        progress.p95LatencyMs,
        progress.errorRatePercent,
        progress.selectedFlow
      );

      const newRecord: StressTestRecord = {
        id: `run-${Date.now()}`,
        timestamp: new Date().toLocaleString("id-ID", {
          dateStyle: "short",
          timeStyle: "medium",
        }),
        selectedFlow: progress.selectedFlow,
        flowTitle: flowTitles[progress.selectedFlow] || "Pengujian Stress Test",
        targetVUs,
        durationSec: progress.totalDurationSec,
        totalRequests: progress.totalRequests,
        successRequests: progress.successRequests,
        failedRequests: progress.failedRequests,
        currentRps: progress.currentRps,
        p95LatencyMs: progress.p95LatencyMs,
        avgLatencyMs: progress.avgLatencyMs,
        errorRatePercent: progress.errorRatePercent,
        healthGrade: progress.healthGrade,
        healthVerdict: progress.healthVerdict,
        recommendations: recs,
      };

      const updatedHistory = saveStressTestRecord(newRecord);
      setHistoryRecords(updatedHistory);
      setActiveModalRecord(newRecord);
      setIsModalOpen(true);
    }

    prevIsRunningRef.current = progress.isRunning;
  }, [
    progress.isRunning,
    progress.isFinished,
    progress.totalRequests,
    progress.healthGrade,
    progress.p95LatencyMs,
    progress.errorRatePercent,
    progress.selectedFlow,
    progress.totalDurationSec,
    progress.successRequests,
    progress.failedRequests,
    progress.currentRps,
    progress.avgLatencyMs,
    progress.healthVerdict,
    targetVUs,
  ]);

  const handleStart = () => {
    setChartData([]);
    stressTestEngine.start(selectedFlow, targetVUs, durationSec);
  };

  const handleStop = () => {
    stressTestEngine.stop();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Link to="/" className="hover:text-orange-500 transition">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-slate-700 dark:text-slate-300 font-semibold">Stress Test Simulator</span>
      </div>

      {/* Main Page Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-500 border border-orange-500/30">
            <Zap className="h-6 w-6 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Stress Testing & Microservices Capacity Simulator
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Simulasi pengujian beban pengguna (*Virtual Users*) dan analisis ketahanan latensi SLA secara real-time
            </p>
          </div>
        </div>

        {/* Global Operational Status Badge */}
        <div className="flex items-center gap-2">
          {progress.isRunning ? (
            <span className="inline-flex items-center gap-2 rounded-xl bg-orange-500/15 border border-orange-500/30 px-3.5 py-1.5 text-xs font-bold text-orange-600 dark:text-orange-400 animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin" />
              SEDANG MENGUJI ({progress.activeVUs} USER AKTIF)
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3.5 py-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              SISTEM SIAP DIUJI
            </span>
          )}
        </div>
      </div>

      {/* 2-Column Grid: Config & Flow Selection (Left) + Execution & Results (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Steps 1 & 2 (Configurations) */}
        <div className="lg:col-span-5 space-y-6">
          {/* STEP 1: Pilih Alur Fitur (Flow Selection) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-[11px] font-extrabold">
                  1
                </span>
                Pilih Alur Fitur (Flow Scenario)
              </span>
            </div>

            <div className="space-y-2.5">
              {/* Flow 1 Button Card */}
              <div
                onClick={() => {
                  if (!progress.isRunning) {
                    setSelectedFlow("1");
                    stressTestEngine.setSelectedFlow("1");
                  }
                }}
                className={`cursor-pointer rounded-xl border p-3.5 transition-all relative ${
                  selectedFlow === "1"
                    ? "border-orange-500 bg-orange-500/10 dark:bg-orange-500/15 text-slate-900 dark:text-white ring-2 ring-orange-500/20 shadow-md"
                    : "border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                    <MessageSquare className="w-4 h-4 text-rose-500" />
                    <span>Flow 1: Konsultasi AI Healthcare</span>
                  </div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                    AI Service
                  </span>
                </div>

                {/* Hanya muncul pada Flow yang dipilih */}
                {selectedFlow === "1" && (
                  <>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                      Menguji proses Login pengguna, pembuatan ruang sesi AI, hingga pengiriman chat dan penerimaan respon balasan dokter AI.
                    </p>

                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800 text-xs space-y-1">
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Step 1: Login Autentikasi (<code className="text-[10px] font-mono bg-slate-200 dark:bg-slate-800 px-1 rounded">POST /api/v1/auth/login</code>)</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Step 2: Buat Sesi Konsultasi (<code className="text-[10px] font-mono bg-slate-200 dark:bg-slate-800 px-1 rounded">POST /api/consultations</code>)</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Step 3: Kirim Chat & Respon AI (<code className="text-[10px] font-mono bg-slate-200 dark:bg-slate-800 px-1 rounded">POST /api/consultation/chat</code>)</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Flow 2 Button Card */}
              <div
                onClick={() => {
                  if (!progress.isRunning) {
                    setSelectedFlow("2");
                    stressTestEngine.setSelectedFlow("2");
                  }
                }}
                className={`cursor-pointer rounded-xl border p-3.5 transition-all relative ${
                  selectedFlow === "2"
                    ? "border-orange-500 bg-orange-500/10 dark:bg-orange-500/15 text-slate-900 dark:text-white ring-2 ring-orange-500/20 shadow-md"
                    : "border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                    <BookOpen className="w-4 h-4 text-amber-500" />
                    <span>Flow 2: PIN & Baca Artikel</span>
                  </div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    Lifestyle
                  </span>
                </div>

                {/* Hanya muncul pada Flow yang dipilih */}
                {selectedFlow === "2" && (
                  <>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                      Menguji validasi status PIN keamanan pengguna, membaca katalog artikel, hingga membaca isi lengkap artikel kesehatan.
                    </p>

                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800 text-xs space-y-1">
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Step 1: Validasi Status PIN (<code className="text-[10px] font-mono bg-slate-200 dark:bg-slate-800 px-1 rounded">GET /api/v1/pin/status</code>)</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Step 2: List Artikel Kesehatan (<code className="text-[10px] font-mono bg-slate-200 dark:bg-slate-800 px-1 rounded">GET /api/articles</code>)</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Step 3: Baca Detail Lengkap (<code className="text-[10px] font-mono bg-slate-200 dark:bg-slate-800 px-1 rounded">GET /api/articles/:slug</code>)</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Flow 3 Button Card */}
              <div
                onClick={() => {
                  if (!progress.isRunning) {
                    setSelectedFlow("3");
                    stressTestEngine.setSelectedFlow("3");
                  }
                }}
                className={`cursor-pointer rounded-xl border p-3.5 transition-all relative ${
                  selectedFlow === "3"
                    ? "border-orange-500 bg-orange-500/10 dark:bg-orange-500/15 text-slate-900 dark:text-white ring-2 ring-orange-500/20 shadow-md"
                    : "border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                    <Stethoscope className="w-4 h-4 text-blue-500" />
                    <span>Flow 3: Telekonsultasi & Dokter</span>
                  </div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    Live Consult
                  </span>
                </div>

                {/* Hanya muncul pada Flow yang dipilih */}
                {selectedFlow === "3" && (
                  <>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                      Menguji login pengguna, menarik riwayat telekonsultasi dokter spesialis, hingga mengakses profil dan detail sesi dokter.
                    </p>

                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800 text-xs space-y-1">
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Step 1: Login Autentikasi (<code className="text-[10px] font-mono bg-slate-200 dark:bg-slate-800 px-1 rounded">POST /api/v1/auth/login</code>)</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Step 2: List Sesi & Dokter (<code className="text-[10px] font-mono bg-slate-200 dark:bg-slate-800 px-1 rounded">GET /api/live-consult</code>)</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Step 3: Detail Profil & Sesi Dokter (<code className="text-[10px] font-mono bg-slate-200 dark:bg-slate-800 px-1 rounded">GET /api/live-consult/:id</code>)</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* STEP 2: Tentukan Beban User & Durasi */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-[11px] font-extrabold">
                  2
                </span>
                Tentukan Jumlah Pengguna (Virtual Users / VU)
              </span>
            </div>

            {/* Input Target VU */}
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Users className="w-4 h-4 text-orange-500" />
                  <span>Target Virtual Users (VU):</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    disabled={progress.isRunning}
                    min={1}
                    max={2000}
                    value={targetVUs}
                    onChange={(e) => setTargetVUs(Math.max(1, parseInt(e.target.value || "1", 10)))}
                    className="w-28 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-base font-extrabold font-mono text-center text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none shadow-sm"
                  />
                  <span className="text-xs font-bold text-slate-500">User</span>
                </div>
              </div>

              {/* Preset Buttons */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-semibold">Preset Cepat:</span>
                {[25, 50, 100, 200, 500].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={progress.isRunning}
                    onClick={() => setTargetVUs(preset)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold font-mono transition-all ${
                      targetVUs === preset
                        ? "bg-orange-500 text-white shadow-sm"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {preset} User
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Steps 3 & 4 (Execution & Live Real-Time Results) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Main Action Button Card */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-5 shadow-sm flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Eksekusi Stress Test
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                Alur: {selectedFlow === "1" ? "Flow 1 (AI)" : selectedFlow === "2" ? "Flow 2 (Artikel)" : "Flow 3 (Dokter)"} | Target: {targetVUs} Virtual Users
              </div>
            </div>

            <div>
              {progress.isRunning ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-500 hover:bg-rose-600 px-6 py-3.5 text-xs font-bold text-white transition shadow-lg cursor-pointer"
                >
                  <Square className="h-4 w-4 fill-white" /> HENTIKAN PENGUJIAN
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStart}
                  className="inline-flex items-center gap-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-7 py-3.5 text-xs font-extrabold text-white transition shadow-lg shadow-orange-500/25 cursor-pointer uppercase tracking-wider"
                >
                  <Play className="h-4 w-4 fill-white" /> JALANKAN STRESS TEST NOW
                </button>
              )}
            </div>
          </div>

          {/* Live Progress Bar */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-2 text-slate-900 dark:text-white">
                {progress.isRunning ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-orange-500" />
                    <span>
                      Tahap {progress.currentStageIndex + 1}/{progress.totalStages}:{" "}
                      <span className="text-orange-500 font-mono font-extrabold">{progress.activeVUs} VU Active</span>
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span>Status: Pengujian Siap Dijalankan</span>
                  </>
                )}
              </span>
              <span className="font-mono text-slate-500">
                Waktu: {progress.elapsedSec}s / {progress.totalDurationSec}s
              </span>
            </div>

            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full transition-all duration-300 ${
                  progress.isRunning ? "bg-orange-500" : "bg-emerald-500"
                }`}
                style={{
                  width: `${
                    progress.totalDurationSec > 0
                      ? Math.min(100, Math.round((progress.elapsedSec / progress.totalDurationSec) * 100))
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          {/* 4 Big Real-time Metric Display Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Active Users */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-4 text-center shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pengguna Aktif</span>
              <p className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white mt-1">
                {progress.activeVUs} <span className="text-xs font-semibold text-slate-500">VU</span>
              </p>
              <span className="text-[10px] text-slate-500 block mt-1">Virtual Users</span>
            </div>

            {/* Throughput RPS */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-4 text-center shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Kecepatan Transaksi</span>
              <p className="text-2xl font-extrabold font-mono text-orange-500 mt-1">
                {progress.currentRps} <span className="text-xs font-semibold text-slate-500">RPS</span>
              </p>
              <span className="text-[10px] text-slate-500 block mt-1">Request / Detik</span>
            </div>

            {/* P95 Latency */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-4 text-center shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Waktu Tunggu (P95)</span>
              <p className={`text-2xl font-extrabold font-mono mt-1 ${progress.p95LatencyMs > 1000 ? "text-rose-500" : "text-slate-900 dark:text-white"}`}>
                {progress.p95LatencyMs} <span className="text-xs font-semibold text-slate-500">ms</span>
              </p>
              <span className="text-[10px] text-slate-500 block mt-1">SLA Limit &lt; 1000ms</span>
            </div>

            {/* Error Rate */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-4 text-center shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tingkat Kegagalan</span>
              <p className={`text-2xl font-extrabold font-mono mt-1 ${progress.errorRatePercent > 5 ? "text-rose-500" : "text-emerald-500"}`}>
                {formatPercent(progress.errorRatePercent, 1)}
              </p>
              <span className="text-[10px] text-slate-500 block mt-1">SLA Limit &lt; 5%</span>
            </div>
          </div>

          {/* Live Real-time Latency Chart (Recharts) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                <TrendingUp className="w-4 h-4 text-orange-500" />
                <span>Grafik Tren Latensi P95 Real-Time (ms)</span>
              </div>
              <span className="text-xs text-slate-500 font-mono">Garis Merah Putus-putus = Batas SLA 1000ms</span>
            </div>

            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ReLineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} domain={[0, 'auto']} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <ReferenceLine y={1000} stroke="#f43f5e" strokeDasharray="5 5" label={{ value: "SLA Limit (1000ms)", fill: "#f43f5e", fontSize: 10 }} />
                  <Line type="monotone" dataKey="p95" stroke="#f97316" strokeWidth={2.5} dot={false} name="Latensi P95 (ms)" />
                </ReLineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: Riwayat Pengujian (Test History Table) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
            <FileText className="w-4 h-4 text-orange-500" />
            <span>Riwayat Pengujian Terakhir (Test Run History)</span>
          </div>
          {historyRecords.length > 0 && (
            <button
              onClick={() => {
                clearStressTestHistory();
                setHistoryRecords([]);
              }}
              className="text-xs text-slate-400 hover:text-rose-500 font-semibold transition"
            >
              Hapus Riwayat
            </button>
          )}
        </div>

        {historyRecords.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs font-medium">
            Belum ada riwayat pengujian. Klik tombol <span className="text-orange-500 font-bold">JALANKAN STRESS TEST</span> di atas untuk memulai.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="p-3 rounded-l-xl">Waktu Pengujian</th>
                  <th className="p-3">Skenario Flow</th>
                  <th className="p-3 text-center">User (VU)</th>
                  <th className="p-3 text-center">Kecepatan (RPS)</th>
                  <th className="p-3 text-center">Respon P95</th>
                  <th className="p-3 text-center">Error Rate</th>
                  <th className="p-3 text-center">Status System</th>
                  <th className="p-3 text-right rounded-r-xl">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
                {historyRecords.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition">
                    <td className="p-3 font-mono text-slate-500 dark:text-slate-400">{item.timestamp}</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{item.flowTitle}</td>
                    <td className="p-3 text-center font-mono font-bold">{item.targetVUs} VU</td>
                    <td className="p-3 text-center font-mono">{formatNumber(item.currentRps)}/s</td>
                    <td className={`p-3 text-center font-mono font-bold ${item.p95LatencyMs > 1000 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {item.p95LatencyMs} ms
                    </td>
                    <td className={`p-3 text-center font-mono ${item.errorRatePercent > 5 ? "text-rose-500" : "text-slate-600 dark:text-slate-400"}`}>
                      {item.errorRatePercent.toFixed(1)}%
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                        item.healthGrade === "HEALTHY"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : item.healthGrade === "DEGRADED"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                      }`}>
                        {item.healthGrade === "HEALTHY" && "🟢 SEHAT"}
                        {item.healthGrade === "DEGRADED" && "🟡 TERTEKAN"}
                        {item.healthGrade === "CRITICAL" && "🔴 OVERLOAD"}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => {
                          setActiveModalRecord(item);
                          setIsModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-bold transition text-xs cursor-pointer"
                      >
                        🔍 Lihat Detail Modal
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pop-up Result & Recommendation Modal */}
      <StressTestResultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        record={activeModalRecord}
        onReRun={() => handleStart()}
      />
    </div>
  );
};

export default StressTestPage;
