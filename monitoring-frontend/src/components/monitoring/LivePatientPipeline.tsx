import React, { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Activity,
  Users,
  Clock,
  Zap,
  Sparkles,
  UserCheck,
  Calendar,
  MessageSquare,
  Stethoscope,
  BookOpen,
  Send,
  Radio,
  ChevronDown,
  ChevronUp,
  Info,
  X,
} from "lucide-react";
import { SelectedFlowType, K6CheckItem } from "../../services/stressTestEngine";

interface LivePatientPipelineProps {
  isRunning: boolean;
  isFinished: boolean;
  selectedFlow: SelectedFlowType;
  flowTitle: string;
  activeVUs: number;
  targetVUs: number;
  elapsedSec: number;
  totalRequests: number;
  currentRps: number;
  p95LatencyMs: number;
  errorRatePercent: number;
  healthGrade?: "HEALTHY" | "DEGRADED" | "CRITICAL";
  checks?: K6CheckItem[];
  logs?: string[];
}

export const LivePatientPipeline: React.FC<LivePatientPipelineProps> = ({
  isRunning,
  isFinished,
  selectedFlow,
  activeVUs,
  targetVUs,
  elapsedSec,
  totalRequests,
  currentRps,
  p95LatencyMs,
  errorRatePercent,
  healthGrade,
  checks,
}) => {
  // Steps definition based on selected flow (selaras 100% dengan modal hasil pengujian)
  const steps =
    selectedFlow === "1"
      ? [
          { id: 1, name: "1. Akses Akun Pasien", sub: "Identity Service", icon: UserCheck, checkPatterns: ["active consultation", "auth"] },
          { id: 2, name: "2. Buka Sesi Konsultasi", sub: "PostgreSQL DB", icon: Calendar, checkPatterns: ["create consultation"] },
          { id: 3, name: "3. Tanya Jawab AI Dokter", sub: "Streaming LLM", icon: MessageSquare, checkPatterns: ["ai chat"] },
          { id: 4, name: "4. Riwayat Transkrip", sub: "Penyimpanan Chat", icon: BookOpen, checkPatterns: ["consultation detail", "detail has valid body"] },
          { id: 5, name: "5. Beri Rating & Selesai", sub: "Event Broker Kafka", icon: CheckCircle2, checkPatterns: ["end consultation"] },
        ]
      : selectedFlow === "2"
      ? [
          { id: 1, name: "1. Verifikasi Akun", sub: "Identity Service", icon: UserCheck, checkPatterns: ["auth", "pin status"] },
          { id: 2, name: "2. Buka Katalog Artikel", sub: "Database MongoDB", icon: BookOpen, checkPatterns: ["articles list", "articles body"] },
          { id: 3, name: "3. Baca Isi Artikel Lengkap", sub: "Konten Edukasi", icon: CheckCircle2, checkPatterns: ["article detail", "detail body"] },
        ]
      : [
          { id: 1, name: "1. Cari Jadwal Dokter", sub: "Direktori Spesialis", icon: Stethoscope, checkPatterns: ["doctor sessions", "sessions body"] },
          { id: 2, name: "2. Pilih Profil Dokter", sub: "Live Consult Service", icon: Calendar, checkPatterns: ["doctor session detail", "create doctor session"] },
          { id: 3, name: "3. Kirim Chat ke Dokter", sub: "WebSocket Langsung", icon: Send, checkPatterns: ["ws connected", "chat sent"] },
          { id: 4, name: "4. Verifikasi Layanan", sub: "Pemeriksaan Selesai", icon: CheckCircle2, checkPatterns: ["live consult health"] },
        ];

  // Status state: Idle (belum ada test / standby) vs Running vs Selesai
  const isIdle = !isRunning && (!isFinished || totalRequests === 0);
  const isCompleted = !isRunning && isFinished && totalRequests > 0;

  // Evaluasi status kesehatan SRE (selaras dengan modal)
  const isDegraded = healthGrade === "DEGRADED" || (errorRatePercent > 1.0 && errorRatePercent <= 5.0);
  const isCritical = healthGrade === "CRITICAL" || errorRatePercent > 5.0;

  // Helper untuk mengevaluasi apakah suatu tahapan mengalami kendala (merah X)
  const getStepHealth = (checkPatterns?: string[]) => {
    if (!isCompleted || !checkPatterns || !checks || checks.length === 0) {
      return { isFailed: false };
    }
    const matched = checks.find((c) =>
      checkPatterns.some((p) => (c.name || "").toLowerCase().includes(p.toLowerCase()))
    );
    if (!matched) {
      return { isFailed: false };
    }
    const total = matched.total || (matched.passes + matched.fails);
    const passRatio = total > 0 ? matched.passes / total : matched.passed ? 1 : 0;
    const isFailed = passRatio < 0.7 || (matched.fails > 0 && matched.passes === 0);
    return { isFailed };
  };

  // Menghitung tahap aktif saat pengujian berlangsung
  const totalSteps = steps.length;
  const currentStepIndex = isCompleted
    ? totalSteps
    : isRunning
    ? Math.min(totalSteps - 1, Math.floor((elapsedSec / Math.max(1, targetVUs > 100 ? 5 : 2)) * totalSteps))
    : -1;

  const [isBreakdownOpen, setIsBreakdownOpen] = useState<boolean>(false);

  // Perhitungan ekspektasi total request dan rincian API yang digunakan per alur
  const flowBreakdown =
    selectedFlow === "1"
      ? {
          title: "Flow 1: Konsultasi AI Healthcare",
          rate: 8,
          expectedTotal: targetVUs * 8,
          formula: `${targetVUs} Pasien × 8 Panggilan API = ${targetVUs * 8} Total Request HTTP`,
          apis: [
            { method: "POST", path: "/api/v1/auth/login", service: "Identity Service (8080/8081)", desc: "Otentikasi kredensial 50 akun pasien unik & penerbitan token JWT", count: `${targetVUs} req` },
            { method: "GET", path: "/api/consultations/active", service: "AI Consult (Node.js/4006)", desc: "Validasi sesi chat aktif di PostgreSQL DB saat inisialisasi awal", count: `${targetVUs} req` },
            { method: "GET", path: "/api/consultations/active", service: "AI Consult (Node.js/4006)", desc: "Pengecekan sesi aktif pasien saat siklus konsultasi dimulai", count: `${targetVUs} req` },
            { method: "POST", path: "/api/consultations", service: "AI Consult (PostgreSQL)", desc: "Pembuatan sesi konsultasi baru & pencatatan registrasi keluhan", count: `${targetVUs} req` },
            { method: "POST", path: "/api/consultation/chat", service: "AI Consult (Streaming LLM)", desc: "Pengiriman pesan keluhan pasien & inferensi jawaban dokter AI", count: `${targetVUs} req` },
            { method: "GET", path: "/api/consultations/:id", service: "AI Consult (PostgreSQL)", desc: "Pengambilan transkrip lengkap percakapan & riwayat diagnosa", count: `${targetVUs} req` },
            { method: "PATCH", path: "/api/consultations/:id", service: "AI Consult & Event Kafka", desc: "Penutupan sesi, kirim rating feedback & publikasi audit event Kafka", count: `${targetVUs} req` },
            { method: "GET", path: "/health/live", service: "AI Consult Cluster", desc: "Health check liveness container microservice", count: `${targetVUs} req` },
          ],
        }
      : selectedFlow === "2"
      ? {
          title: "Flow 2: PIN & Baca Artikel Medis",
          rate: 4,
          expectedTotal: targetVUs * 4 + 1,
          formula: `(50 Pasien × 4 Request) + 1 Pre-warm = ${targetVUs * 4 + 1} Total Request HTTP`,
          apis: [
            { method: "GET", path: "/api/articles?page=1&limit=10", service: "Lifestyle (MongoDB/4005)", desc: "Pre-warm katalog artikel 1x saat persiapan awal pengujian oleh k6", count: "1 req" },
            { method: "POST", path: "/api/v1/auth/login", service: "Identity Service (8080/8081)", desc: "Otentikasi akun 50 pasien unik untuk verifikasi identitas", count: `${targetVUs} req` },
            { method: "GET", path: "/health", service: "Identity Service (8080/8081)", desc: "Validasi status otorisasi & kesiapan token akses pasien", count: `${targetVUs} req` },
            { method: "GET", path: "/api/articles?page=1&limit=10", service: "Lifestyle (MongoDB/4005)", desc: "Akses katalog artikel kesehatan, tips medis & daftar topik", count: `${targetVUs} req` },
            { method: "GET", path: "/api/articles/:slug", service: "Lifestyle (MongoDB/4005)", desc: "Pengambilan isi artikel edukasi lengkap (dipilih secara acak riil)", count: `${targetVUs} req` },
          ],
        }
      : {
          title: "Flow 3: Jadwal Dokter & Chat WebSocket",
          rate: 6,
          expectedTotal: targetVUs * 6,
          formula: `${targetVUs} Pasien × 6 Request = ${targetVUs * 6} Total Request HTTP`,
          apis: [
            { method: "POST", path: "/api/v1/auth/login", service: "Identity Service (8080/8081)", desc: "Otentikasi 50 akun pasien unik & penerbitan token JWT", count: `${targetVUs} req` },
            { method: "GET", path: "/api/live-consult", service: "Live Consult (Golang/4004)", desc: "Validasi & pre-warm sesi telekonsultasi pribadi tiap pasien", count: `${targetVUs} req` },
            { method: "GET", path: "/api/live-consult", service: "Live Consult (Golang/4004)", desc: "Pencarian direktori dokter spesialis & jadwal praktik dokter", count: `${targetVUs} req` },
            { method: "GET", path: "/api/live-consult/:id", service: "Live Consult (Golang/4004)", desc: "Akses detail profil dokter spesialis & registrasi telekonsultasi", count: `${targetVUs} req` },
            { method: "WS", path: "/ws/live-consult/:id", service: "Golang WebSocket Engine", desc: "Handshake HTTP 101 & pengiriman pesan chat pasien ke dokter asli", count: `${targetVUs} req` },
            { method: "GET", path: "/health/live", service: "Live Consult Container", desc: "Health check liveness container microservice", count: `${targetVUs} req` },
          ],
        };

  return (
    <div className="space-y-3.5">
      {/* ============================================================== */}
      {/* 1. STATUS HEADER & ACTIVE TIMER BAR                            */}
      {/* ============================================================== */}
      <div
        className={`rounded-2xl border p-3.5 sm:p-4 transition-all duration-300 shadow-sm ${
          isRunning
            ? "border-orange-500/50 bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent shadow-orange-500/10"
            : isCompleted
            ? isCritical
              ? "border-rose-500/40 bg-rose-500/10"
              : isDegraded
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-emerald-500/40 bg-emerald-500/10"
            : "border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19]"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                isRunning
                  ? "bg-orange-500 text-white shadow-md shadow-orange-500/30 animate-pulse"
                  : isCompleted
                  ? isCritical
                    ? "bg-rose-500 text-white shadow-md shadow-rose-500/30"
                    : isDegraded
                    ? "bg-amber-500 text-white shadow-md shadow-amber-500/30"
                    : "bg-emerald-500 text-white shadow-md shadow-emerald-500/30"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-400"
              }`}
            >
              {isRunning ? (
                <Radio className="w-5 h-5 animate-spin" />
              ) : isCompleted ? (
                isCritical || isDegraded ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )
              ) : (
                <Activity className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-900 dark:text-white tracking-tight">
                  {isRunning
                    ? `Sedang Menguji ${targetVUs} Pasien Serentak...`
                    : isCompleted
                    ? isCritical
                      ? "Hasil Pengujian: Perlu Diperiksa"
                      : isDegraded
                      ? "Hasil Pengujian: Sedikit Melambat"
                      : "Pengujian Selesai Sempurna!"
                    : "Alur Perjalanan Pasien Real-Time"}
                </span>
                {isRunning && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                    LIVE
                  </span>
                )}
                {isCompleted && (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                      isCritical
                        ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30"
                        : isDegraded
                        ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30"
                        : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    }`}
                  >
                    {isCritical ? "Perlu Diperiksa" : isDegraded ? "Sedikit Melambat" : "Lulus SLA"}
                  </span>
                )}
                {isIdle && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                    STANDBY
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isRunning
                  ? `Memproses transaksi ${totalRequests} request (${elapsedSec}s berjalan)`
                  : isCompleted
                  ? isCritical
                    ? `Terdeteksi ${Math.round(totalRequests * (errorRatePercent / 100))} transaksi berkendala (${errorRatePercent.toFixed(1)}% error) dari ${totalRequests} transaksi dalam ${elapsedSec}s`
                    : `Total ${totalRequests} transaksi diproses dalam ${elapsedSec}s dengan p95 ${p95LatencyMs}ms`
                  : "Visualisasi tahapan transaksi pasien live streaming saat stress test dijalankan"}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="font-mono font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
              {isRunning ? `${elapsedSec}s` : isCompleted ? `${elapsedSec}s total` : "0s"}
            </div>
            <span className="text-[10px] text-slate-400">
              {isRunning ? `${activeVUs} VU Aktif` : isCompleted ? (isCritical ? "Ada Kendala" : "Lengkap") : "Standby"}
            </span>
          </div>
        </div>

        {/* Progress Bar Indikator */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 relative">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              isRunning
                ? "bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500 animate-pulse w-full"
                : isCompleted
                ? isCritical
                  ? "bg-rose-500 w-full"
                  : isDegraded
                  ? "bg-amber-500 w-full"
                  : "bg-emerald-500 w-full"
                : "w-0"
            }`}
          />
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. ANIMATED PATIENT PIPELINE STAGES                            */}
      {/* ============================================================== */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-orange-500" />
            <span>Alur Perjalanan Pasien (Patient Journey)</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {isRunning
              ? `Tahap ${Math.min(totalSteps, currentStepIndex + 1)} dari ${totalSteps}`
              : isCompleted
              ? isCritical
                ? "Tahapan Selesai (Ada Kendala)"
                : "Semua Tahap Tuntas"
              : `${totalSteps} Tahapan Skenario`}
          </span>
        </div>

        {/* Step Nodes Layout */}
        <div className={`grid gap-2.5 ${totalSteps === 3 ? "grid-cols-1 sm:grid-cols-3" : totalSteps === 5 ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"}`}>
          {steps.map((step, idx) => {
            const isStepDone = isCompleted || (isRunning && idx < currentStepIndex);
            const isStepCurrent = isRunning && idx === currentStepIndex;
            const { isFailed } = isCompleted ? getStepHealth(step.checkPatterns) : { isFailed: false };
            const StepIcon = step.icon;

            return (
              <div
                key={step.id}
                className={`p-3 rounded-xl border flex flex-col justify-between space-y-2 transition-all duration-300 relative overflow-hidden ${
                  isFailed
                    ? "bg-rose-500/10 border-rose-500/40 text-rose-950 dark:text-rose-200 shadow-xs"
                    : isStepDone
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-950 dark:text-emerald-200 shadow-xs"
                    : isStepCurrent
                    ? "bg-orange-500/15 border-orange-500 text-orange-950 dark:text-orange-200 ring-2 ring-orange-500/20 shadow-md animate-pulse"
                    : "bg-slate-50/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-400 opacity-70"
                }`}
              >
                {/* Background active pulse glow */}
                {isStepCurrent && (
                  <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-orange-500/20 rounded-full blur-xl pointer-events-none" />
                )}

                <div className="flex items-center justify-between">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                      isFailed
                        ? "bg-rose-500 text-white shadow-xs"
                        : isStepDone
                        ? "bg-emerald-500 text-white shadow-xs"
                        : isStepCurrent
                        ? "bg-orange-500 text-white shadow-xs animate-bounce"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                    }`}
                  >
                    {isFailed ? (
                      <X className="w-4 h-4" />
                    ) : isStepDone ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <StepIcon className="w-4 h-4" />
                    )}
                  </div>

                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase ${
                      isFailed
                        ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                        : isStepDone
                        ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                        : isStepCurrent
                        ? "bg-orange-500 text-white"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-400"
                    }`}
                  >
                    {isFailed
                      ? "Ada Kendala"
                      : isStepDone
                      ? "Tuntas ✓"
                      : isStepCurrent
                      ? `● ${targetVUs} Pasien`
                      : "Siap"}
                  </span>
                </div>

                <div className="relative z-10">
                  <div className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                    {step.name}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {step.sub}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. 4 REAL-TIME METRIC CARDS (Clean Full-Width Grid)            */}
      {/* ============================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Card 1: Pasien */}
        <div className="bg-white dark:bg-[#0B0F19] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-orange-500" /> Pasien Aktif
          </span>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono my-1">
            {isIdle ? 0 : isRunning ? activeVUs : targetVUs}{" "}
            <span className="text-xs font-semibold text-slate-400">VU</span>
          </div>
          <span
            className={`text-[11px] font-semibold truncate ${
              isIdle
                ? "text-slate-400"
                : isRunning
                ? "text-orange-500 animate-pulse"
                : isCritical
                ? "text-rose-500"
                : isDegraded
                ? "text-amber-500"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {isIdle
              ? "Standby"
              : isRunning
              ? "Sedang Mengeksekusi"
              : isCritical
              ? "Kapasitas Penuh"
              : isDegraded
              ? "Ada Antrean"
              : "100% Selesai"}
          </span>
        </div>

        {/* Card 2: Throughput */}
        <div className="bg-white dark:bg-[#0B0F19] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-500" /> Kecepatan
          </span>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono my-1">
            {isIdle ? 0 : currentRps}{" "}
            <span className="text-xs font-semibold text-slate-400">req/s</span>
          </div>
          <span className="text-[11px] text-slate-400 truncate font-mono">
            {isIdle ? "Belum Ada Beban" : "Throughput Transaksi"}
          </span>
        </div>

        {/* Card 3: Latensi P95 */}
        <div className="bg-white dark:bg-[#0B0F19] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-emerald-500" /> Respon P95
          </span>
          <div
            className={`text-2xl font-black font-mono my-1 ${
              isIdle
                ? "text-slate-400"
                : p95LatencyMs > 1000
                ? "text-rose-500"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {isIdle ? "-" : p95LatencyMs}{" "}
            <span className="text-xs font-semibold opacity-75">ms</span>
          </div>
          <span className="text-[11px] text-slate-400 truncate">
            {isIdle
              ? "Belum Ada Data"
              : p95LatencyMs < 300
              ? "Sangat Cepat"
              : p95LatencyMs < 1000
              ? "Normal"
              : "Ada Antrean"}
          </span>
        </div>

        {/* Card 4: Sukses */}
        <div className="bg-white dark:bg-[#0B0F19] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Keberhasilan
          </span>
          <div
            className={`text-2xl font-black font-mono my-1 ${
              isIdle
                ? "text-slate-400"
                : errorRatePercent > 5
                ? "text-rose-500"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {isIdle
              ? "-"
              : errorRatePercent <= 1
              ? "100%"
              : `${(100 - errorRatePercent).toFixed(1)}%`}
          </div>
          <span className="text-[11px] text-slate-400 truncate">
            {isIdle
              ? "Sistem Siap"
              : errorRatePercent === 0
              ? "0 Error (Lulus)"
              : `${errorRatePercent.toFixed(1)}% Gagal`}
          </span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. EXPLANATION ACCORDION: RINCIAN PANGGILAN API PER PASIEN     */}
      {/* ============================================================== */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => setIsBreakdownOpen(!isBreakdownOpen)}
          className="w-full p-3 sm:p-3.5 flex items-center justify-between text-left hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500 border border-orange-500/20">
              <Info className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                <span>Rincian API: Mengapa {targetVUs} Pasien = {flowBreakdown.expectedTotal} Request HTTP?</span>
              </span>
              <span className="text-[10px] text-slate-400 block truncate">
                {flowBreakdown.title} • {flowBreakdown.formula}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {flowBreakdown.rate} API / Pasien
            </span>
            {isBreakdownOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </button>

        {isBreakdownOpen && (
          <div className="p-3.5 pt-0 border-t border-slate-100 dark:border-slate-800 space-y-3 animate-in fade-in duration-200 text-xs">
            <div className="p-2.5 rounded-xl bg-orange-500/5 dark:bg-orange-500/10 border border-orange-500/20 text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2">
              <span className="text-orange-500 font-bold shrink-0 mt-0.5">💡 Prinsip Closed Workload:</span>
              <span className="leading-relaxed">
                Tiap 1 Virtual User (VU) mewakili 1 pasien riil yang melewati alur transaksi lengkap dari login hingga evaluasi SLA. Seluruh panggilan API di bawah ini dieksekusi secara terkoordinasi oleh k6:
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-400 uppercase text-[9px] font-bold tracking-wider">
                  <tr>
                    <th className="p-2 rounded-l-lg">Method</th>
                    <th className="p-2">Endpoint API</th>
                    <th className="p-2">Target Microservice</th>
                    <th className="p-2">Peran Dalam Transaksi</th>
                    <th className="p-2 text-right rounded-r-lg">Frekuensi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[11px]">
                  {flowBreakdown.apis.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition">
                      <td className="p-2">
                        <span
                          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            item.method === "POST"
                              ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                              : item.method === "GET"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : item.method === "PATCH"
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              : "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                          }`}
                        >
                          {item.method}
                        </span>
                      </td>
                      <td className="p-2 font-mono font-bold text-slate-800 dark:text-slate-200 truncate max-w-[160px]">
                        {item.path}
                      </td>
                      <td className="p-2 text-slate-600 dark:text-slate-400 truncate max-w-[140px]">
                        {item.service}
                      </td>
                      <td className="p-2 text-slate-500 dark:text-slate-400 leading-tight">
                        {item.desc}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                        {item.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 text-[11px]">
              <span className="font-bold text-slate-700 dark:text-slate-300">Total Akumulasi Beban:</span>
              <span className="font-mono font-extrabold text-orange-500 text-xs">
                {flowBreakdown.formula}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LivePatientPipeline;
