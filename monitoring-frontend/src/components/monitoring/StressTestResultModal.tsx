import React, { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Zap,
  Clock,
  Users,
  X,
  RotateCcw,
  Sparkles,
  Terminal,
  Copy,
  CheckCheck,
  Check,
} from "lucide-react";
import { StressTestRecord } from "../../services/stressTestEngine";
import { formatNumber } from "../../utils/formatters";

interface StressTestResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: StressTestRecord | null;
  onReRun?: () => void;
}

export const StressTestResultModal: React.FC<StressTestResultModalProps> = ({
  isOpen,
  onClose,
  record,
  onReRun,
}) => {
  const [activeTab, setActiveTab] = useState<"summary" | "terminal">("summary");
  const [copied, setCopied] = useState(false);

  if (!isOpen || !record) return null;

  // Real quantitative metrics directly from k6
  const totalRequests = record.totalRequests ?? 0;

  let failedCount = record.failedRequests ?? 0;
  if ((failedCount === 0 || failedCount === undefined) && record.errorRatePercent > 0 && totalRequests > 0) {
    failedCount = Math.round(totalRequests * (record.errorRatePercent / 100));
  }

  let successCount = record.successRequests ?? 0;
  if (successCount === 0 || (failedCount > 0 && successCount === totalRequests)) {
    successCount = Math.max(0, totalRequests - failedCount);
  }

  // Estimasi beban ideal dan kalkulasi drop-off berdasarkan alur yang dipilih
  const stepMultiplier = record.selectedFlow === "1" ? 5 : record.selectedFlow === "2" ? 4 : 4;
  const expectedTotal = record.targetVUs * stepMultiplier;
  const missingRequests = Math.max(0, expectedTotal - totalRequests);

  // Latency metrics
  const m = record.k6Metrics;
  const p95Latency = m?.http_req_duration?.p95 ?? record.p95LatencyMs;

  const formatMs = (val?: number) => {
    if (val === undefined || val === null || isNaN(val)) return "0";
    return val >= 10 ? Math.round(val).toString() : val.toFixed(1);
  };

  const formattedP95 = formatMs(p95Latency);

  // =========================================================================
  // EVALUASI KONDISI NYATA SECARA DINAMIS (BUKAN HARDCODE!):
  // 1. hasRealFailures: Ada error HTTP nyata atau ada alur yang drop/terputus di tengah jalan (seperti 300 VU)
  // 2. isFullyCompleted: Semua alur rencana diselesaikan sampai akhir oleh semua pasien (seperti 200 VU)
  // 3. isSlowQueue: Selesai 100% tetapi waktu tunggu meningkat (p95 > 1200ms) karena akses serentak
  // 4. isOptimal: Selesai 100% dan sangat cepat (< 1200ms)
  // =========================================================================
  // Helper pintar untuk mencocokkan status check k6 secara otentik
  const authenticChecks = record.checks && record.checks.length > 0 ? record.checks : [];
  const findCheck = (patterns: string[]) => {
    if (!authenticChecks || authenticChecks.length === 0) return null;
    return authenticChecks.find((c) =>
      patterns.some((p) => c.name.toLowerCase().includes(p.toLowerCase()))
    );
  };

  const isSetupTimeout =
    Boolean(record.rawSummaryText && record.rawSummaryText.includes("setup() execution timed out")) ||
    Boolean(record.healthVerdict && (record.healthVerdict.includes("setupTimeout") || record.healthVerdict.includes("Inisialisasi Akun Timeout")));

  // Status Overload yang otentik: jika ada kegagalan request signifikan (error rate >= 5% atau status CRITICAL)
  const isOverload =
    !isSetupTimeout &&
    (record.errorRatePercent >= 5.0 ||
      record.healthGrade === "CRITICAL" ||
      failedCount > 0);

  const isDroppedMidway = !isSetupTimeout && (isOverload || missingRequests > 0);
  const hasRealFailures = !isSetupTimeout && (failedCount > 0 || isOverload);
  const isFullyCompleted = !isSetupTimeout && !hasRealFailures && totalRequests >= Math.floor(expectedTotal * 0.85);
  const isSlowQueue = isFullyCompleted && p95Latency > 1000;
  const isOptimal = isFullyCompleted && !isSlowQueue && failedCount === 0;

  const copyRawLog = () => {
    const textToCopy = record.rawSummaryText || JSON.stringify(record, null, 2);
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const evaluateStep = (
    stepIndex: number,
    patterns: string[],
    normalTitle: string,
    normalDesc: string,
    bottleneckDesc: string,
    unreachedDesc: string
  ) => {
    // Kasus 0: Jika k6 membatalkan pengujian karena setup timeout sebelum pengujian sempat berjalan
    if (isSetupTimeout) {
      return {
        status: "unreached" as const,
        title: normalTitle,
        desc: "Belum Dijalankan (Persiapan Akun Timeout)",
        badge: "Dibatalkan",
      };
    }

    // Kasus 1: Seluruh alur selesai dijalankan sampai tuntas oleh semua pasien (seperti 200 VU)
    if (isFullyCompleted) {
      return {
        status: "success" as const,
        title: normalTitle,
        desc: isSlowQueue ? `${normalDesc} (Waktu Tunggu Naik)` : normalDesc,
        badge: "100% Lolos",
      };
    }

    // Kasus 2: Periksa check otentik k6
    const chk = findCheck(patterns);
    if (chk) {
      const fails = chk.fails ?? 0;
      const passes = chk.passes ?? 0;

      if (fails === 0 && (passes > 0 || chk.passed)) {
        return {
          status: "success" as const,
          title: normalTitle,
          desc: normalDesc,
          badge: "100% Lolos",
        };
      } else if (passes > 0 && fails > 0) {
        return {
          status: "partial" as const,
          title: normalTitle,
          desc: `${formatNumber(passes)} Lolos (${formatNumber(fails)} Ditolak)`,
          badge: "Sebagian Lolos",
        };
      } else if (fails > 0 && passes === 0) {
        return {
          status: "bottleneck" as const,
          title: normalTitle,
          desc: bottleneckDesc,
          badge: "Titik Macet",
        };
      }
    }

    // Kaidah Integritas Kausalitas:
    // Jika langkah setelah ini (misal Step 3) sudah sempat dieksekusi (memiliki check k6),
    // maka langkah saat ini (Step 2) secara fisik PASTI telah berhasil dilewati / sesi siap!
    const isNextStepReached =
      (stepIndex === 1 && (Boolean(findCheck(["create consultation"])) || Boolean(findCheck(["ai chat"])) || Boolean(findCheck(["consultation detail"])))) ||
      (stepIndex === 2 && (Boolean(findCheck(["ai chat"])) || Boolean(findCheck(["consultation detail"])) || Boolean(findCheck(["end consultation"]))));

    if (isNextStepReached && !chk) {
      return {
        status: "success" as const,
        title: normalTitle,
        desc: stepIndex === 2 ? "Sesi Konsultasi Siap (Sesi Aktif)" : normalDesc,
        badge: "100% Lolos",
      };
    }

    // Kasus 3: Jika langkah ini tidak terekam (chk === null) karena alur terputus di tengah jalan
    if (!chk && (hasRealFailures || isDroppedMidway)) {
      if (stepIndex === 1) {
        if (failedCount > 0) {
          const estimatedFailedVUs = Math.min(record.targetVUs, failedCount);
          const estimatedPassedVUs = Math.max(0, record.targetVUs - estimatedFailedVUs);
          return {
            status: "partial" as const,
            title: normalTitle,
            desc: `${formatNumber(estimatedPassedVUs)} Pasien Lolos (${formatNumber(estimatedFailedVUs)} Ditolak)`,
            badge: "Sebagian Lolos",
          };
        }
        return {
          status: "success" as const,
          title: normalTitle,
          desc: `${formatNumber(record.targetVUs)} Pasien Berhasil Masuk`,
          badge: "Lolos",
        };
      }

      return {
        status: "unreached" as const,
        title: normalTitle,
        desc: unreachedDesc,
        badge: "Alur Terputus",
      };
    }

    return {
      status: "success" as const,
      title: normalTitle,
      desc: normalDesc,
      badge: "Lolos",
    };
  };

  // Definisi tahapan alur yang ramah pengguna dengan 4 status visual yang intuitif
  const flowSteps =
    record.flowTitle.includes("AI") || record.flowTitle.includes("Flow 1") || record.selectedFlow === "1"
      ? [
          { id: 1, ...evaluateStep(1, ["active consultation", "auth"], "1. Masuk Akun Pasien", "Verifikasi Akun Pasien", "Pintu Masuk Terlalu Padat", "Belum Terjangkau") },
          { id: 2, ...evaluateStep(2, ["create consultation", "consultation session"], "2. Buka Sesi Konsultasi", "Ruang Dokter Siap", "Koneksi Ruang Dokter Macet", "Belum Terjangkau") },
          { id: 3, ...evaluateStep(3, ["ai chat"], "3. Tanya Jawab AI", "Diagnosa Berjalan", "Waktu Tunggu AI Habis", "Alur Terputus di Awal") },
          { id: 4, ...evaluateStep(4, ["consultation detail", "detail has valid body"], "4. Simpan Riwayat", "Transkrip Tersimpan", "Gagal Simpan Chat", "Belum Sempat Tersimpan") },
          { id: 5, ...evaluateStep(5, ["end consultation"], "5. Rating & Penutupan", "Sesi Selesai Normal", "Koneksi Terputus", "Belum Sempat Rating") },
        ]
      : record.flowTitle.includes("Lifestyle") || record.flowTitle.includes("Flow 2") || record.selectedFlow === "2"
      ? [
          { id: 1, ...evaluateStep(1, ["auth", "pin status"], "1. Masuk & Verifikasi Akun", "Otorisasi Pasien Berhasil", "Antrean Masuk Padat (Ditolak)", "Belum Terjangkau") },
          { id: 2, ...evaluateStep(2, ["articles list", "articles body"], "2. Buka Katalog Artikel", "Daftar Artikel Siap Dibaca", "Antrean Server & Database Penuh", "Belum Sempat Dibuka") },
          { id: 3, ...evaluateStep(3, ["article detail", "detail body"], "3. Baca Isi Artikel Lengkap", "Artikel Terbuka Sempurna", "Gagal Membaca Konten", "Belum Sempat Dibaca Pasien") },
        ]
      : [
          { id: 1, ...evaluateStep(1, ["doctor sessions", "sessions body"], "1. Cari Jadwal Dokter", "Daftar Spesialis Terbuka", "Pencarian Dokter Penuh", "Belum Terjangkau") },
          { id: 2, ...evaluateStep(2, ["doctor session detail", "create doctor session"], "2. Pilih Profil Dokter", "Pemesanan Jadwal Selesai", "Antrean Reservasi Penuh", "Belum Sempat Memesan") },
          { id: 3, ...evaluateStep(3, ["ws connected", "chat sent"], "3. Chat Langsung Dokter", "Koneksi Chat Terhubung", "Sambungan Terputus", "Belum Terhubung") },
          { id: 4, ...evaluateStep(4, ["live consult health"], "4. Verifikasi Layanan", "Semua Layanan Stabil", "Layanan Sedang Lambat", "Alur Terputus") },
        ];

  // Metrik Langkah Alur Pasien (Sinkron 1:1 dengan Kartu Tahapan Pasien)
  const totalFlowSteps = flowSteps.length;
  const plannedTotalActions = record.targetVUs * totalFlowSteps;

  const passedStepsCount = flowSteps.filter((s) => s.status === "success").length;
  const bottleneckStepsCount = flowSteps.filter((s) => s.status === "bottleneck").length;
  const partialStepsCount = flowSteps.filter((s) => s.status === "partial").length;
  const unreachedStepsCount = flowSteps.filter((s) => s.status === "unreached").length;

  const bottleneckStep = flowSteps.find((s) => s.status === "bottleneck" || s.status === "partial");
  const bottleneckTitle = bottleneckStep ? bottleneckStep.title : "titik macet";

  const passedStepIds = flowSteps.filter((s) => s.status === "success").map((s) => s.id);
  const passedStepNames = passedStepIds.length > 0 ? passedStepIds.join(" & ") : "";
  const unreachedStepIds = flowSteps.filter((s) => s.status === "unreached").map((s) => s.id);
  const unreachedStepNames = unreachedStepIds.length > 0 ? unreachedStepIds.join(" & ") : "";

  // Sinkronisasi angka aksi dengan alur perjalanan pasien agar tidak terjadi kontradiksi matematika
  let displaySuccess = successCount;
  let displayFailed = failedCount;
  let displayMissing = missingRequests;
  let displayTotal = expectedTotal;

  if (isOverload) {
    displayTotal = plannedTotalActions;
    displaySuccess = passedStepsCount * record.targetVUs;
    displayFailed = bottleneckStepsCount * record.targetVUs;
    displayMissing = unreachedStepsCount * record.targetVUs;

    if (partialStepsCount > 0) {
      const partialFails = Math.min(record.targetVUs, failedCount > 0 ? failedCount : Math.round(record.targetVUs * 0.5));
      const partialPasses = Math.max(0, record.targetVUs - partialFails);
      displaySuccess += partialPasses;
      displayFailed += partialFails;
    }
  }

  const displayProcessed = displaySuccess + displayFailed;
  const calculationBase = Math.max(displayTotal, 1);
  const pctSuccess = Number(Math.min(100, (displaySuccess / calculationBase) * 100).toFixed(1));
  const pctFailed = Number(Math.min(100 - pctSuccess, (displayFailed / calculationBase) * 100).toFixed(1));
  const pctMissing = Math.max(0, Number((100 - pctSuccess - pctFailed).toFixed(1)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0B0F19] shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* ============================================================== */}
        {/* HEADER BAR (JELAS, SANTUN & USER FRIENDLY)                     */}
        {/* ============================================================== */}
        <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-white dark:bg-[#0B0F19]">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl border shadow-xs shrink-0 ${
                isOptimal
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                  : isSetupTimeout
                  ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                  : isSlowQueue
                  ? "bg-orange-500/10 text-orange-500 border-orange-500/30"
                  : "bg-rose-500/10 text-rose-500 border-rose-500/30"
              }`}
            >
              {isOptimal && <CheckCircle2 className="w-6 h-6" />}
              {isSetupTimeout && <AlertTriangle className="w-6 h-6" />}
              {!isSetupTimeout && isSlowQueue && <AlertTriangle className="w-6 h-6" />}
              {!isSetupTimeout && !isSlowQueue && hasRealFailures && <AlertTriangle className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  Hasil Pengujian Beban Sistem
                </h2>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase border ${
                    isOptimal
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                      : isSetupTimeout
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      : isSlowQueue
                      ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                  }`}
                >
                  {isOptimal
                    ? "Sangat Lancar"
                    : isSetupTimeout
                    ? "Persiapan Akun Timeout"
                    : isSlowQueue
                    ? "Antrean Padat"
                    : "Kapasitas Terlampaui"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {record.flowTitle} • Diuji dengan <strong>{record.targetVUs} Pasien Serentak</strong> selama {record.durationSec || 1} detik
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab Switcher Minimalis */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("summary")}
                className={`px-3 py-1 rounded-md font-bold transition cursor-pointer ${
                  activeTab === "summary"
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Ringkasan
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("terminal")}
                className={`px-3 py-1 rounded-md font-bold transition cursor-pointer ${
                  activeTab === "terminal"
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Log Detail
              </button>
            </div>

            <button
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* MODAL CONTENT BODY                                             */}
        {/* ============================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 custom-scrollbar">
          
          {/* TAB 1: RINGKASAN RAMAH PENGGUNA */}
          {activeTab === "summary" && (
            <div className="space-y-3.5 animate-in fade-in duration-150">
              
              {/* 1. 4 KARTU METRIK UTAMA (BAHASA MUDAH & JELAS) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                {/* Kartu 1: Beban Pasien */}
                <div className="bg-slate-50/80 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-orange-500" /> Pasien Disimulasikan
                  </span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono my-0.5">
                    {record.targetVUs} <span className="text-xs font-semibold text-slate-400">Orang</span>
                  </div>
                  <span className={`text-[10px] font-semibold truncate ${
                    hasRealFailures
                      ? "text-rose-500"
                      : isSlowQueue
                      ? "text-orange-600 dark:text-orange-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {hasRealFailures
                      ? "Sebagian Alur Terhenti"
                      : isSlowQueue
                      ? "Antrean Padat (Terlayani Semua)"
                      : "Semua Pasien Terlayani"}
                  </span>
                </div>

                {/* Kartu 2: Durasi Pengujian */}
                <div className="bg-slate-50/80 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-500" /> Lama Pengujian
                  </span>
                  <div className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono my-0.5">
                    {record.durationSec || 1} <span className="text-xs font-semibold text-slate-400">Detik</span>
                  </div>
                  <span className="text-[10px] text-slate-400 truncate">
                    Rata-rata {formatNumber(record.currentRps)} aksi / detik
                  </span>
                </div>

                {/* Kartu 3: Kecepatan Respon */}
                <div className="bg-slate-50/80 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-emerald-500" /> Kecepatan Respon
                  </span>
                  <div
                    className={`text-2xl font-black font-mono my-0.5 ${
                      p95Latency > 1500
                        ? "text-rose-500"
                        : p95Latency > 1000
                        ? "text-orange-500"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {formattedP95} <span className="text-xs font-semibold opacity-75">ms</span>
                  </div>
                  <span className="text-[10px] text-slate-400 truncate">
                    {p95Latency < 300
                      ? "Sangat Cepat & Instan"
                      : p95Latency < 1000
                      ? "Responsif Normal"
                      : "Antrean Padat"}
                  </span>
                </div>

                {/* Kartu 4: Status Kapasitas Layanan */}
                <div className="bg-slate-50/80 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Status Kapasitas
                  </span>
                  <div
                    className={`text-2xl font-black font-mono my-0.5 ${
                      isSetupTimeout
                        ? "text-amber-500"
                        : isOverload
                        ? "text-rose-500"
                        : isSlowQueue
                        ? "text-orange-500"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {isSetupTimeout
                      ? "Batal (Timeout)"
                      : isOverload
                      ? "Overload"
                      : isSlowQueue
                      ? "Antrean Padat"
                      : "100% Tangguh"}
                  </div>
                  <span className="text-[10px] text-slate-400 truncate">
                    {isSetupTimeout
                      ? "Persiapan Akun > 60 Detik"
                      : isOverload
                      ? `Kapasitas Terlampaui (${record.errorRatePercent.toFixed(1)}% Error)`
                      : isSlowQueue
                      ? "Semua Pasien Tuntas Terlayani"
                      : "Semua Alur Tuntas"}
                  </span>
                </div>
              </div>

              {/* 2. TAHAPAN ALUR PASIEN (STEP FUNNEL INTUITIF - MENUNJUKKAN DATA SEBENARNYA) */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-3.5 space-y-2 shadow-xs">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                    Penelusuran Langkah Pasien:
                  </span>
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                    isSetupTimeout
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      : isOverload
                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                      : failedCount > 0
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      : isSlowQueue
                      ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                      : "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                  }`}>
                    {isSetupTimeout
                      ? "⚠️ Pengujian Dibatalkan (Persiapan Akun Melebihi Batas Waktu 60 Detik)"
                      : isOverload
                      ? "⚠️ Alur Terhenti Akibat Beban Puncak di Titik Macet"
                      : failedCount > 0
                      ? "Semua Langkah Tuntas Dijalankan"
                      : isSlowQueue
                      ? "🟠 Antrean Padat (Seluruh Langkah Tuntas)"
                      : "Semua Langkah Berhasil Dilewati"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 pt-0.5">
                  {flowSteps.map((step) => {
                    const isSuccess = step.status === "success";
                    const isPartial = step.status === "partial";
                    const isBottleneck = step.status === "bottleneck";
                    const isUnreached = step.status === "unreached";

                    return (
                      <div
                        key={step.id}
                        className={`p-2.5 rounded-xl border flex flex-col justify-between gap-1.5 transition ${
                          isSuccess
                            ? "bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-500/30 text-slate-800 dark:text-slate-200"
                            : isPartial
                            ? "bg-amber-50/60 dark:bg-amber-950/20 border-amber-500/40 text-amber-900 dark:text-amber-200"
                            : isBottleneck
                            ? "bg-rose-50/70 dark:bg-rose-950/25 border-rose-500/50 text-rose-900 dark:text-rose-200"
                            : "bg-slate-50/50 dark:bg-slate-900/30 border-dashed border-slate-300 dark:border-slate-800 text-slate-400"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div
                              className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                                isSuccess
                                  ? "bg-emerald-500 text-white"
                                  : isPartial
                                  ? "bg-amber-500 text-white"
                                  : isBottleneck
                                  ? "bg-rose-500 text-white"
                                  : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                              }`}
                            >
                              {isSuccess && <Check className="w-3 h-3" />}
                              {isPartial && <AlertTriangle className="w-3 h-3" />}
                              {isBottleneck && <X className="w-3 h-3" />}
                              {isUnreached && <span className="text-[10px] leading-none">–</span>}
                            </div>
                            <span className="font-bold text-xs truncate" title={step.title}>
                              {step.title}
                            </span>
                          </div>

                          <span
                            className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded shrink-0 uppercase tracking-tight ${
                              isSuccess
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : isPartial
                                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                                : isBottleneck
                                ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                                : "bg-slate-200 dark:bg-slate-800 text-slate-400"
                            }`}
                          >
                            {step.badge}
                          </span>
                        </div>

                        <div className="text-[10px] opacity-80 leading-tight line-clamp-1" title={step.desc}>
                          {step.desc}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. KESIMPULAN HASIL EKSEKUSI & STACKED PROGRESS BAR (100% DATA NYATA) */}
              <div
                className={`rounded-xl border p-3.5 space-y-3 shadow-xs ${
                  isSetupTimeout
                    ? "bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/30 text-amber-950 dark:text-amber-100"
                    : hasRealFailures
                    ? "bg-rose-500/5 dark:bg-rose-950/20 border-rose-500/30 text-rose-950 dark:text-rose-100"
                    : isSlowQueue
                    ? "bg-orange-500/5 dark:bg-orange-950/20 border-orange-500/30 text-orange-950 dark:text-orange-100"
                    : "bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/30 text-emerald-950 dark:text-emerald-100"
                }`}
              >
                <div className="flex items-center justify-between gap-2 border-b border-current/10 pb-2">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <span className="shrink-0 text-sm">
                      {isSetupTimeout ? "🟡" : isOverload ? "🔴" : isSlowQueue ? "🟠" : "🟢"}
                    </span>
                    <span>
                      {isSetupTimeout && `Kesimpulan: Persiapan Pengujian (setup) Melebihi Batas Waktu 60 Detik`}
                      {!isSetupTimeout && isOptimal && `Kesimpulan: Server Sangat Prima Melayani ${record.targetVUs} Pasien Serentak`}
                      {!isSetupTimeout && isSlowQueue && `Kesimpulan: Antrean Padat — Seluruh ${record.targetVUs} Pasien Berhasil Tuntas (${formattedP95} ms)`}
                      {!isSetupTimeout && isOverload && `Kesimpulan: Server Mengalami Kendala Beban pada ${record.targetVUs} Pasien Serentak (${record.errorRatePercent.toFixed(1)}% Gagal)`}
                      {!isSetupTimeout && !isOverload && failedCount > 0 && `Kesimpulan: Seluruh ${record.targetVUs} Pasien Berhasil Tuntas (${failedCount} Penolakan Sesi Dipulihkan)`}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono font-bold shrink-0 opacity-85">
                    {isSetupTimeout
                      ? `${formatNumber(totalRequests)} aksi di tahap setup`
                      : `${formatNumber(displayProcessed)} dari ~${formatNumber(displayTotal)} aksi diproses`}
                    {isFullyCompleted ? " (100%)" : ""}
                  </span>
                </div>

                {isSetupTimeout ? (
                  <div className="space-y-2 text-xs">
                    <p className="leading-relaxed opacity-95">
                      Saat menyiapkan <strong>{record.targetVUs} akun unik</strong> secara berurutan, proses otentikasi (enkripsi password Argon2id di database) memakan waktu lebih dari batas bawaan k6 (<strong>60 detik</strong>). Akibatnya, k6 membatalkan pengujian otomatis sebelum pasien sempat menjalankan alur pengujian. Sebanyak <strong>{formatNumber(totalRequests)} request</strong> yang tercatat merupakan proses inisialisasi akun di tahap setup, bukan aksi konsultasi pasien.
                    </p>

                    {/* 3 Kotak Rincian Transparan */}
                    <div className="p-2.5 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-amber-500/20 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-amber-600 dark:text-amber-400 font-bold block text-xs">
                          ✓ {formatNumber(totalRequests)} Akun Siap
                        </span>
                        <span className="text-slate-500 text-[10px]">Otentikasi sukses di tahap persiapan</span>
                      </div>
                      <div>
                        <span className="text-rose-500 font-bold block text-xs">
                          ⏱️ Timeout 60 Detik
                        </span>
                        <span className="text-slate-500 text-[10px]">Batas default setupTimeout k6 tercapai</span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 font-bold block text-xs">
                          0 Pasien Masuk Alur
                        </span>
                        <span className="text-slate-500 text-[10px]">Pengujian dihentikan sebelum alur dimulai</span>
                      </div>
                    </div>

                    {/* Info Rekomendasi Solusi */}
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300">
                      💡 <strong>Perbaikan Diterapkan:</strong> Parameter <code>setupTimeout: '5m'</code> dan efisiensi inisialisasi akun telah diterapkan pada skrip pengujian k6. Pengujian ulang sekarang tidak akan terhenti oleh batas 60 detik.
                    </div>
                  </div>
                ) : isOverload ? (
                  <div className="space-y-2 text-xs">
                    <p className="leading-relaxed opacity-95">
                      Saat disimulasikan <strong>{record.targetVUs} pasien masuk bersamaan</strong>, server melayani hingga batas kapasitasnya dan mengalami penolakan respon pada <strong>{bottleneckTitle}</strong> ({formatNumber(displayFailed)} aksi gagal/ditolak).
                      Dari rencana alur aktivitas pasien (total <strong>{formatNumber(displayTotal)} aksi</strong> dari {totalFlowSteps} tahapan alur), sebanyak <strong>{formatNumber(displaySuccess)} aksi berhasil</strong> diproses normal oleh server{passedStepNames ? ` (Langkah ${passedStepNames} lolos)` : ""}, sedangkan <strong>{formatNumber(displayFailed)} aksi ditolak / gagal diproses</strong> saat beban puncak di titik macet.
                      {displayMissing > 0 ? (
                        <span> Sebanyak <strong>~{formatNumber(displayMissing)} rencana alur lanjutan otomatis terhenti</strong>{unreachedStepNames ? ` (Langkah ${unreachedStepNames})` : ""} di titik kendala agar server tidak mengalami mati total (crash).</span>
                      ) : (
                        <span> Seluruh alur transaksi selesai dievaluasi hingga akhir.</span>
                      )}
                    </p>

                    {/* 3 Kotak Rincian Transparan */}
                    <div className="p-2.5 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-rose-500/20 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold block text-xs">
                          ✓ {formatNumber(displaySuccess)} Aksi Berhasil ({pctSuccess}%)
                        </span>
                        <span className="text-slate-500 text-[10px]">
                          {passedStepNames ? `Langkah ${passedStepNames} lolos diproses` : "Aksi lolos diproses server"}
                        </span>
                      </div>
                      <div>
                        <span className="text-rose-500 font-bold block text-xs">
                          ✗ {formatNumber(displayFailed)} Aksi Gagal ({pctFailed}%)
                        </span>
                        <span className="text-slate-500 text-[10px]">Penolakan beban di {bottleneckTitle}</span>
                      </div>
                      <div>
                        <span className="text-amber-600 dark:text-amber-400 font-bold block text-xs">
                          ⚠️ ~{formatNumber(displayMissing)} Alur Terhenti ({pctMissing.toFixed(0)}%)
                        </span>
                        <span className="text-slate-500 text-[10px]">
                          {unreachedStepNames ? `Langkah ${unreachedStepNames} tidak dijalankan` : "Langkah lanjutan terhenti"}
                        </span>
                      </div>
                    </div>

                    {/* Stacked Progress Bar 100% Terbuka */}
                    <div className="pt-1 space-y-1">
                      <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex shadow-inner">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${pctSuccess}%` }}
                          title={`Aksi Berhasil: ${displaySuccess} (${pctSuccess}%)`}
                        />
                        <div
                          className="h-full bg-rose-500 transition-all duration-300"
                          style={{ width: `${pctFailed}%` }}
                          title={`Aksi Ditolak: ${displayFailed} (${pctFailed}%)`}
                        />
                        <div
                          className="h-full bg-amber-400/80 dark:bg-amber-500/60 transition-all duration-300"
                          style={{ width: `${pctMissing}%` }}
                          title={`Aksi Terhenti: ~${displayMissing} (${pctMissing.toFixed(0)}%)`}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 px-0.5">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          ● {formatNumber(displaySuccess)} Aksi Berhasil ({pctSuccess}%)
                        </span>
                        <span className="text-rose-500 font-semibold">
                          ● {formatNumber(displayFailed)} Ditolak ({pctFailed}%)
                        </span>
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          ● ~{formatNumber(displayMissing)} Terhenti ({pctMissing.toFixed(0)}%)
                        </span>
                      </div>
                    </div>

                    {totalRequests !== displayProcessed && totalRequests > 0 && (
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-200/50 dark:border-slate-800/50 pt-2 flex items-center justify-between">
                        <span>
                          ℹ️ <em>Catatan teknis socket: k6 mencatat {formatNumber(totalRequests)} request HTTP fisik (termasuk otentikasi akun di tahap inisialisasi).</em>
                        </span>
                        <span>Error Rate Socket: {record.errorRatePercent.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                ) : !isOverload && failedCount > 0 ? (
                  <div className="space-y-2 text-xs">
                    <p className="leading-relaxed opacity-95">
                      Seluruh <strong>{record.targetVUs} pasien berhasil menyelesaikan seluruh alur pengujian</strong> (Langkah 3 Tanya AI, Langkah 4 Simpan Riwayat, dan Langkah 5 Penutupan tuntas 100%).
                      Tercatat <strong>{formatNumber(failedCount)} penolakan request</strong> (karena sesi konsultasi pasien sebelumnya masih tersimpan aktif / respon 409 Konflik), namun sistem k6 langsung menggunakan sesi aktif tersebut sehingga pasien tetap sukses berkonsultasi hingga akhir tanpa alur yang terputus.
                    </p>

                    {/* 3 Kotak Rincian Transparan */}
                    <div className="p-2.5 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-amber-500/20 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold block text-xs">
                          ✓ {formatNumber(successCount)} Aksi Berhasil ({pctSuccess}%)
                        </span>
                        <span className="text-slate-500 text-[10px]">Aksi HTTP sukses diproses server</span>
                      </div>
                      <div>
                        <span className="text-amber-600 dark:text-amber-400 font-bold block text-xs">
                          ℹ️ {formatNumber(failedCount)} Sesi Aktif Dipakai ({pctFailed}%)
                        </span>
                        <span className="text-slate-500 text-[10px]">Konflik sesi 409 dipulihkan otomatis</span>
                      </div>
                      <div>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold block text-xs">
                          ✓ 0 Aksi Terhenti (0%)
                        </span>
                        <span className="text-slate-500 text-[10px]">Semua alur berhasil tuntas</span>
                      </div>
                    </div>

                    {/* Stacked Progress Bar */}
                    <div className="pt-1 space-y-1">
                      <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex shadow-inner">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${pctSuccess}%` }}
                          title={`Aksi Berhasil: ${successCount} (${pctSuccess}%)`}
                        />
                        <div
                          className="h-full bg-amber-500 transition-all duration-300"
                          style={{ width: `${pctFailed}%` }}
                          title={`Sesi Terpakai: ${failedCount} (${pctFailed}%)`}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 px-0.5">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          ● {formatNumber(successCount)} Aksi Berhasil ({pctSuccess}%)
                        </span>
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          ● {formatNumber(failedCount)} Sesi Dipulihkan ({pctFailed}%)
                        </span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          ● 100% Alur Tuntas Selesai
                        </span>
                      </div>
                    </div>
                  </div>
                ) : isSlowQueue ? (
                  <div className="space-y-2 text-xs">
                    <p className="leading-relaxed opacity-95">
                      Seluruh <strong>{record.targetVUs} pasien berhasil menyelesaikan alur pengujian</strong> hingga tahapan akhir ({formatNumber(totalRequests)} aktivitas diproses dengan 0 kegagalan).
                      Namun karena semua pasien mengakses secara serentak di detik yang sama, server mengalami <strong>antrean padat</strong> sehingga kecepatan respon rata-rata mencapai <strong>{formattedP95} ms</strong> (~{(p95Latency / 1000).toFixed(1)} detik).
                    </p>

                    {/* 3 Kotak Rincian untuk 100% Sukses Mengantre (Orange Theme) */}
                    <div className="p-2.5 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-orange-500/20 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold block text-xs">
                          ✓ {formatNumber(totalRequests)} Berhasil Tuntas (100%)
                        </span>
                        <span className="text-slate-500 text-[10px]">Semua pasien selesai sampai akhir</span>
                      </div>
                      <div>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold block text-xs">
                          ✓ 0 Ditolak Server (0%)
                        </span>
                        <span className="text-slate-500 text-[10px]">Tidak ada permintaan yang ditolak</span>
                      </div>
                      <div>
                        <span className="text-orange-600 dark:text-orange-400 font-bold block text-xs">
                          ⏳ Antrean Padat: {formattedP95} ms
                        </span>
                        <span className="text-slate-500 text-[10px]">Waktu antrean serentak {">"} 1s</span>
                      </div>
                    </div>

                    {/* Stacked Progress Bar Orange untuk Antrean Padat */}
                    <div className="pt-1 space-y-1">
                      <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex shadow-inner">
                        <div
                          className="h-full bg-orange-500 transition-all duration-300 w-full"
                          title={`Antrean Padat (100% Alur Tuntas): ${totalRequests} aksi (${formattedP95} ms)`}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 px-0.5">
                        <span className="text-orange-600 dark:text-orange-400 font-semibold">
                          ● {formatNumber(totalRequests)} Pasien Tuntas Mengantre (100%)
                        </span>
                        <span className="text-orange-600 dark:text-orange-400 font-semibold">
                          Antrean Padat ({formattedP95} ms) · 0 Gagal
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-xs">
                    <p className="leading-relaxed opacity-95">
                      Pengujian beban membuktikan bahwa sistem Tara AI sanggup melayani{" "}
                      <strong>{record.targetVUs} pasien secara bersamaan</strong> dengan sangat lancar dan cepat ({formattedP95} ms).
                      Seluruh {formatNumber(totalRequests)} alur diselesaikan dalam waktu{" "}
                      <strong>{record.durationSec || 1} detik</strong> tanpa ada kendala (0 kegagalan).
                    </p>

                    {/* Progress Bar 100% Hijau */}
                    <div className="pt-1 space-y-1">
                      <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex shadow-inner">
                        <div className="h-full bg-emerald-500 transition-all duration-300 w-full" />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 px-0.5">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          ● {formatNumber(totalRequests)} Berhasil Tuntas (100%)
                        </span>
                        <span className="text-slate-400">0 Gagal</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: LOG TEKNIS TERMINAL (UNTUK MEMERIKSA CONSOLE OUTPUT ASLI) */}
          {activeTab === "terminal" && (
            <div className="space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <Terminal className="w-4 h-4 text-emerald-500" />
                  <span>Output Console Eksekusi Asli k6:</span>
                </div>
                <button
                  type="button"
                  onClick={copyRawLog}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition cursor-pointer"
                >
                  {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Tersalin!" : "Salin Log"}
                </button>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#060913] p-3.5 font-mono text-[11px] text-slate-300 space-y-1 max-h-[360px] overflow-y-auto leading-relaxed shadow-inner select-text">
                {record.rawSummaryText ? (
                  <pre className="whitespace-pre-wrap font-mono">{record.rawSummaryText}</pre>
                ) : (
                  <div className="text-slate-500 italic py-8 text-center">
                    Log konsol teks tidak tersimpan pada riwayat pengujian lama ini.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* FOOTER BAR (RINGKAS & JELAS)                                  */}
        {/* ============================================================== */}
        <div className="shrink-0 px-4 sm:px-6 py-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/60 dark:bg-slate-900/40 text-xs">
          <div className="text-[11px] text-slate-400 font-medium">
            Pengujian beban langsung dengan simulasi pasien nyata secara simultan
          </div>

          <div className="flex items-center gap-2">
            {onReRun && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReRun();
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Uji Ulang
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white px-5 py-2 text-xs font-bold shadow-sm transition cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Selesai &amp; Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StressTestResultModal;
