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
  X,
  Layers,
  Eye,
} from "lucide-react";
import { SelectedFlowType, K6CheckItem, CustomFlow } from "../../services/stressTestEngine";

interface LivePatientPipelineProps {
  isRunning: boolean;
  isFinished: boolean;
  selectedFlow: SelectedFlowType;
  flowTitle: string;
  testType?: "load_test" | "stress_test";
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
  customFlow?: CustomFlow | null;
  projectServers?: any[];
  projectServices?: any[];
  totalDurationSec?: number;
  onStartTest?: () => void;
}

export const LivePatientPipeline: React.FC<LivePatientPipelineProps> = ({
  isRunning,
  isFinished,
  selectedFlow,
  flowTitle,
  testType = "load_test",
  activeVUs,
  targetVUs,
  elapsedSec,
  totalRequests,
  currentRps,
  p95LatencyMs,
  errorRatePercent,
  healthGrade,
  customFlow,
  totalDurationSec = 30,
}) => {
  // ─── DEFINISI LANGKAH-LANGKAH ALUR TRANSAKSI ────────────────────────────
  const steps = React.useMemo(() => {
    if (customFlow && customFlow.steps && customFlow.steps.length > 0) {
      return customFlow.steps.map((st, idx) => ({
        id: idx + 1,
        name: `${idx + 1}. ${st.name}`,
        sub: st.serviceKey || "Custom Service",
        method: st.method || "GET",
        path: st.path || "/",
        desc: `Panggilan API ${st.method} ke ${st.path} pada ${st.serviceKey}`,
        icon: st.method === "POST" ? Send : st.method === "GET" ? BookOpen : Activity,
        checkPatterns: [st.name.toLowerCase(), (st.path || "").toLowerCase()],
      }));
    }

    if (selectedFlow === "1") {
      return [
        {
          id: 1,
          name: "1. Akses Akun & Login Pasien",
          sub: "Identity Service",
          method: "POST",
          path: "/api/v1/auth/login",
          desc: "Otentikasi kredensial 50 akun pasien unik & penerbitan token JWT",
          icon: UserCheck,
          checkPatterns: ["active consultation", "auth"],
        },
        {
          id: 2,
          name: "2. Buka Sesi Konsultasi",
          sub: "AI Consultation (PostgreSQL)",
          method: "POST",
          path: "/api/consultations",
          desc: "Inisiasi sesi konsultasi baru & simpan rekam keluhan pasien",
          icon: Calendar,
          checkPatterns: ["create consultation"],
        },
        {
          id: 3,
          name: "3. Tanya Jawab AI Dokter",
          sub: "AI Consult (Streaming LLM)",
          method: "POST",
          path: "/api/consultation/chat",
          desc: "Kirim pesan keluhan pasien & inferensi model LLM untuk rekomendasi medis",
          icon: MessageSquare,
          checkPatterns: ["ai chat"],
        },
        {
          id: 4,
          name: "4. Riwayat Transkrip Percakapan",
          sub: "AI Consult (Storage)",
          method: "GET",
          path: "/api/consultations/:id",
          desc: "Pengambilan transkrip lengkap percakapan dan ringkasan diagnosa",
          icon: BookOpen,
          checkPatterns: ["consultation detail", "detail has valid body"],
        },
        {
          id: 5,
          name: "5. Beri Rating Feedback & Selesai",
          sub: "AI Consult & Event Kafka",
          method: "PATCH",
          path: "/api/consultations/:id",
          desc: "Penutupan sesi, kirim rating kepuasan pasien & audit event broker Kafka",
          icon: CheckCircle2,
          checkPatterns: ["end consultation"],
        },
      ];
    } else if (selectedFlow === "2") {
      return [
        {
          id: 1,
          name: "1. Verifikasi Identitas Akun",
          sub: "Identity Service",
          method: "POST",
          path: "/api/v1/auth/login",
          desc: "Otentikasi akun pasien untuk verifikasi hak akses konten kesehatan",
          icon: UserCheck,
          checkPatterns: ["auth", "pin status"],
        },
        {
          id: 2,
          name: "2. Buka Katalog Artikel Medis",
          sub: "Lifestyle Service (MongoDB)",
          method: "GET",
          path: "/api/articles",
          desc: "Akses katalog artikel kesehatan, tips nutrisi & daftar topik edukasi",
          icon: BookOpen,
          checkPatterns: ["articles list", "articles body"],
        },
        {
          id: 3,
          name: "3. Baca Isi Artikel Lengkap",
          sub: "Lifestyle Service (Konten)",
          method: "GET",
          path: "/api/articles/:slug",
          desc: "Pengambilan isi artikel edukasi lengkap (dipilih secara dinamis)",
          icon: CheckCircle2,
          checkPatterns: ["article detail", "detail body"],
        },
      ];
    } else {
      return [
        {
          id: 1,
          name: "1. Akses Akun Pasien",
          sub: "Identity Service",
          method: "POST",
          path: "/api/v1/auth/login",
          desc: "Otentikasi kredensial pasien & penerbitan token sesi",
          icon: UserCheck,
          checkPatterns: ["auth"],
        },
        {
          id: 2,
          name: "2. Cari Jadwal Dokter Spesialis",
          sub: "Live Consult (Golang)",
          method: "GET",
          path: "/api/live-consult",
          desc: "Pencarian direktori spesialisasi dokter & cek jadwal praktik yang buka",
          icon: Stethoscope,
          checkPatterns: ["doctor sessions", "sessions body"],
        },
        {
          id: 3,
          name: "3. Pilih Profil & Booking Antrean",
          sub: "Live Consult (Session)",
          method: "GET",
          path: "/api/live-consult/:id",
          desc: "Akses detail profil dokter & registrasi ruang temu telekonsultasi",
          icon: Calendar,
          checkPatterns: ["doctor session detail", "create doctor session"],
        },
        {
          id: 4,
          name: "4. Kirim Chat via WebSocket",
          sub: "Golang WebSocket Engine",
          method: "WS",
          path: "/ws/live-consult/:id",
          desc: "Handshake HTTP 101 & pertukaran pesan langsung dengan dokter asli",
          icon: Send,
          checkPatterns: ["ws connected", "chat sent", "live consult health"],
        },
      ];
    }
  }, [selectedFlow, customFlow]);

  // Status State
  const isIdle = !isRunning && (!isFinished || totalRequests === 0);
  const isCompleted = !isRunning && isFinished && totalRequests > 0;

  // Evaluasi status kesehatan SRE
  const isDegraded = healthGrade === "DEGRADED" || (errorRatePercent > 1.0 && errorRatePercent <= 5.0);
  const isCritical = healthGrade === "CRITICAL" || errorRatePercent > 5.0;

  const [isFlowDetailOpen, setIsFlowDetailOpen] = useState<boolean>(false);

  // Method Badge Color Helper
  const getMethodBadgeClass = (method: string) => {
    switch (method) {
      case "POST":
        return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20";
      case "GET":
        return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      case "PATCH":
      case "PUT":
        return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20";
      case "DELETE":
        return "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20";
      case "WS":
        return "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20";
      default:
        return "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20";
    }
  };

  return (
    <div className="space-y-4">
      {/* ─── MODAL DETAIL DARI FLOW YANG DIPILIH ────────────────────────── */}
      {isFlowDetailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white dark:bg-[#0B0F19] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 max-h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center font-black border border-orange-500/20">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Detail Alur: {flowTitle}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Daftar Tahapan Transaksi Pasien ({steps.length} Langkah Lengkap)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFlowDetailOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: List of all steps */}
            <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
              {steps.map((st, idx) => {
                const StepIcon = st.icon;
                return (
                  <div
                    key={st.id}
                    className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 hover:border-orange-500/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="h-8 px-2 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center font-black text-xs border border-orange-500/20 shrink-0 mt-0.5 sm:mt-0 gap-1.5">
                        <span className="text-[10px] font-mono font-bold">{idx + 1}</span>
                        <StepIcon className="w-3.5 h-3.5" />
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-xs font-black text-slate-900 dark:text-white">
                            {st.name}
                          </h4>
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${getMethodBadgeClass(
                              st.method
                            )}`}
                          >
                            {st.method}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                            {st.path}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                          {st.desc}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 sm:self-center pl-11 sm:pl-0">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {st.sub}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">
                Total {steps.length} Tahapan Transaksi Pasien Terkoordinasi
              </span>
              <button
                type="button"
                onClick={() => setIsFlowDetailOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs hover:opacity-90 transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 1. STATUS HEADER & ACTIVE TIMER BAR ────────────────────────── */}
      <div
        className={`rounded-2xl border p-4 transition-all duration-300 shadow-sm ${
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
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                isRunning
                  ? "bg-orange-500 text-white shadow-md shadow-orange-500/30 animate-pulse"
                  : isCompleted
                  ? isCritical
                    ? "bg-rose-500 text-white shadow-md shadow-rose-500/30"
                    : isDegraded
                    ? "bg-amber-500 text-white shadow-md shadow-amber-500/30"
                    : "bg-emerald-500 text-white shadow-md shadow-emerald-500/30"
                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
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
                <Sparkles className="w-5 h-5" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                  {isRunning
                    ? `Sedang Menguji ${targetVUs} Pasien Serentak...`
                    : isCompleted
                    ? isCritical
                      ? "Pengujian Selesai: Terdeteksi Kendala SLA"
                      : isDegraded
                      ? "Pengujian Selesai: Kinerja Sedikit Tertekan"
                      : "Pengujian Selesai Sempurna! (Lulus SLA)"
                    : "Sistem Siap Diuji (Standby)"}
                </span>
                {isRunning && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                    LIVE STREAMING
                  </span>
                )}
                {isCompleted && (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border uppercase ${
                      isCritical
                        ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30"
                        : isDegraded
                        ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30"
                        : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    }`}
                  >
                    {isCritical ? "Perlu Diperiksa" : isDegraded ? "Sedikit Melambat" : "Lulus SLA SRE"}
                  </span>
                )}
                {isIdle && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    SIAP DIUJI
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isRunning
                  ? `Memproses transaksi ${totalRequests} request HTTP (${elapsedSec}s berjalan)`
                  : isCompleted
                  ? isCritical
                    ? `Terdeteksi ${Math.round(
                        totalRequests * (errorRatePercent / 100)
                      )} transaksi berkendala (${errorRatePercent.toFixed(1)}% error) dari ${totalRequests} request.`
                    : `Total ${totalRequests} transaksi diproses dalam ${elapsedSec}s dengan p95 ${p95LatencyMs}ms.`
                  : `Alur: ${flowTitle} • ${testType === "load_test" ? `${targetVUs} Pasien Serentak (1x Iterasi)` : `${targetVUs} VU (${totalDurationSec}s Tekanan)`}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setIsFlowDetailOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 text-xs font-bold border border-orange-500/20 transition cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Detail Alur ({steps.length} Langkah)</span>
            </button>

            <div className="text-right">
              <div className="font-mono font-black text-lg text-slate-900 dark:text-white">
                {isRunning ? `${elapsedSec}s` : isCompleted ? `${elapsedSec}s total` : "0s"}
              </div>
              <span className="text-[10px] font-bold text-slate-400">
                {isRunning
                  ? `${activeVUs} Pasien Aktif`
                  : isCompleted
                  ? isCritical
                    ? "Ada Kendala"
                    : "100% Tuntas"
                  : "Standby"}
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar Indikator */}
        <div className="mt-3.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 relative">
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

      {/* ─── 2. REAL-TIME TELEMETRY METRIC CARDS ─────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Card 1: Pasien */}
        <div className="bg-white dark:bg-[#0B0F19] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-orange-500" /> Pasien Aktif
          </span>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono my-1">
            {isRunning ? activeVUs : targetVUs}{" "}
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
              ? "Siap Diuji"
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
            Throughput Transaksi
          </span>
        </div>

        {/* Card 3: Latensi P95 */}
        <div className="bg-white dark:bg-[#0B0F19] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-emerald-500" /> Respon P95
          </span>
          <div
            className={`text-2xl font-black font-mono my-1 ${
              p95LatencyMs > 1000 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {isIdle ? 0 : p95LatencyMs}{" "}
            <span className="text-xs font-semibold opacity-75">ms</span>
          </div>
          <span className="text-[11px] text-slate-400 truncate">
            {isIdle
              ? "SLA Telemed: <1000ms"
              : p95LatencyMs < 300
              ? "Sangat Cepat"
              : p95LatencyMs < 1000
              ? "Normal (Lulus SLA)"
              : "Ada Antrean Padat"}
          </span>
        </div>

        {/* Card 4: Sukses */}
        <div className="bg-white dark:bg-[#0B0F19] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Keberhasilan
          </span>
          <div
            className={`text-2xl font-black font-mono my-1 ${
              errorRatePercent > 5 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {isIdle ? "100%" : errorRatePercent <= 1 ? "100%" : `${(100 - errorRatePercent).toFixed(1)}%`}
          </div>
          <span className="text-[11px] text-slate-400 truncate">
            {isIdle
              ? "Standby SLA"
              : errorRatePercent === 0
              ? "0 Error (Lulus)"
              : `${errorRatePercent.toFixed(1)}% Gagal`}
          </span>
        </div>
      </div>
    </div>
  );
};

export default LivePatientPipeline;
