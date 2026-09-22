import React, { useState, useMemo } from "react";
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
  Layers,
  Activity,
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

  // Deteksi failure point yang nyata dari record.failurePoint ataupun log k6 otentik
  // (Diletakkan di tingkat teratas sebelum early return sesuai aturan Hooks React)
  const detectedFailureFromLogs = useMemo(() => {
    if (!record) return null;
    if (record.failurePoint) return record.failurePoint;
    const textToScan = (record.rawSummaryText || "") + "\n" + (record.logs ? record.logs.join("\n") : "");
    if (!textToScan) return null;
    const lines = textToScan.split("\n");
    for (const line of lines) {
      const match = line.match(/\[GAGAL TAHAP\s*(\d+)\/(\d+)\](?:\s*VU\s*\d+:)?\s*\\?"([^\\"]+)\\?"\s*->\s*(.+)/i);
      if (match) {
        const rawReason = match[4]
          .replace(/\\?"\s*source=console.*$/i, "")
          .replace(/\.?\s*Tahap berikutnya dibatalkan\.?$/i, "")
          .replace(/^[->\s:]+/, "")
          .trim();
        return {
          stepNum: parseInt(match[1], 10),
          totalSteps: parseInt(match[2], 10),
          stepName: match[3].trim(),
          reason: rawReason || "Gagal",
        };
      }
    }
    return null;
  }, [record?.failurePoint, record?.rawSummaryText, record?.logs]);

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

  const effectiveFailurePoint = record.failurePoint || detectedFailureFromLogs;

  const checkFailuresCount =
    record.k6Metrics?.checks?.fails ??
    (record.checks ? record.checks.reduce((acc, c) => acc + (c.fails || 0), 0) : 0);
  const hasFailedChecks = checkFailuresCount > 0;

  // Status Overload yang otentik: jika ada kegagalan request nyata, check gagal, atau ada alur terputus
  const hasRealFailures =
    !isSetupTimeout &&
    (failedCount > 0 ||
      record.errorRatePercent > 0 ||
      hasFailedChecks ||
      Boolean(effectiveFailurePoint) ||
      record.healthGrade === "CRITICAL");

  const isOverload =
    !isSetupTimeout &&
    (hasRealFailures ||
      record.errorRatePercent >= 5.0 ||
      record.healthGrade === "CRITICAL");

  const isFullyCompleted =
    !isSetupTimeout &&
    !hasRealFailures &&
    !effectiveFailurePoint &&
    !hasFailedChecks &&
    failedCount === 0;
  const isSlowQueue = isFullyCompleted && p95Latency > 1000;
  const isOptimal = isFullyCompleted && !isSlowQueue && failedCount === 0 && !hasFailedChecks;

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
    // Kasus 0: Jika k6 membatalkan pengujian karena setup timeout
    if (isSetupTimeout) {
      return {
        status: "unreached" as const,
        title: normalTitle,
        desc: "Belum Dijalankan (Persiapan Akun Timeout)",
        badge: "Dibatalkan",
      };
    }

    // Kasus 1: Terdeteksi titik kegagalan eksplisit (Fail-Fast Stop di k6)
    if (effectiveFailurePoint) {
      const failStep = effectiveFailurePoint.stepNum;
      if (stepIndex < failStep) {
        const chk = findCheck(patterns);
        const fails = chk?.fails ?? 0;
        const passes = chk?.passes ?? 0;
        if (fails > 0) {
          return {
            status: "bottleneck" as const,
            title: normalTitle,
            desc: `Gagal (${formatNumber(fails)} penolakan check k6)`,
            badge: "Titik Gagal",
          };
        }
        return {
          status: "success" as const,
          title: normalTitle,
          desc: passes > 0 ? `${formatNumber(passes)} Selesai Tervalidasi k6` : normalDesc,
          badge: "Lolos",
        };
      } else if (stepIndex === failStep) {
        const chk = findCheck(patterns);
        const fails = chk?.fails ?? 0;
        const passes = chk?.passes ?? 0;
        return {
          status: "bottleneck" as const,
          title: normalTitle,
          desc:
            chk && (passes > 0 || fails > 0)
              ? `${formatNumber(passes)} Lolos, ${formatNumber(fails)} Gagal (${effectiveFailurePoint.reason})`
              : `Titik Kegagalan k6: ${effectiveFailurePoint.reason}`,
          badge: "Titik Gagal",
        };
      } else {
        return {
          status: "unreached" as const,
          title: normalTitle,
          desc: `Tidak Dieksekusi (Tahap #${failStep} Gagal)`,
          badge: "Dilewati",
        };
      }
    }

    // Kasus 2: Periksa check otentik k6 dari metrik riil
    const chk = findCheck(patterns);
    if (chk) {
      const fails = chk.fails ?? 0;
      const passes = chk.passes ?? 0;

      if (fails > 0 && passes === 0) {
        return {
          status: "bottleneck" as const,
          title: normalTitle,
          desc: bottleneckDesc || `${normalTitle} Gagal (${formatNumber(fails)} gagal)`,
          badge: "Titik Macet",
        };
      } else if (passes > 0 && fails > 0) {
        return {
          status: "partial" as const,
          title: normalTitle,
          desc: `${formatNumber(passes)} Lolos (${formatNumber(fails)} Gagal)`,
          badge: `${chk.passRate || Math.round((passes / (passes + fails)) * 100)}% Lolos`,
        };
      } else if (fails === 0 && (passes > 0 || chk.passed)) {
        return {
          status: "success" as const,
          title: normalTitle,
          desc: passes > 0 ? `${formatNumber(passes)} Sukses Tervalidasi k6` : normalDesc,
          badge: "100% Lolos",
        };
      }
    }

    // Kasus 3: Seluruh alur selesai dijalankan sampai tuntas tanpa kegagalan apapun
    if (isFullyCompleted) {
      return {
        status: "success" as const,
        title: normalTitle,
        desc: isSlowQueue ? `${normalDesc} (Waktu Tunggu Naik)` : normalDesc,
        badge: "100% Lolos",
      };
    }

    // Kasus 4: Jika terjadi kegagalan / overload nyata dan step tidak tercatat check k6
    if (hasRealFailures) {
      return {
        status: "unreached" as const,
        title: normalTitle,
        desc: unreachedDesc || "Tidak Tercatat oleh k6",
        badge: "Dilewati",
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
    record.customSteps && record.customSteps.length > 0
      ? record.customSteps.map((cs, idx) => {
          const stepNum = idx + 1;
          const searchKeys = [cs.name.toLowerCase(), cs.path.toLowerCase(), cs.serviceKey.toLowerCase(), `[tahap ${stepNum}]`];
          return {
            id: stepNum,
            targetDesc: `${cs.serviceKey} • ${cs.method} ${cs.path}`,
            ...evaluateStep(
              stepNum,
              searchKeys,
              `${stepNum}. ${cs.name}`,
              `${cs.method} ${cs.path} Sukses`,
              `${cs.method} ${cs.path} Gagal/Macet`,
              "Belum Terjangkau (Dibatalkan)"
            ),
          };
        })
      : record.flowTitle.includes("AI") || record.flowTitle.includes("Flow 1") || record.selectedFlow === "1"
      ? [
          { id: 1, targetDesc: "ai-consultation • GET /api/consultations/active", ...evaluateStep(1, ["tahap 1", "cek sesi konsultasi aktif", "cek sesi aktif"], "1. Cek Sesi Konsultasi Aktif", "Verifikasi Sesi Aktif Berhasil", "Pintu Masuk Terlalu Padat", "Belum Terjangkau") },
          { id: 2, targetDesc: "ai-consultation • POST /api/consultations", ...evaluateStep(2, ["tahap 2", "pembuatan sesi konsultasi baru", "sesi konsultasi tersedia"], "2. Buat Sesi Konsultasi Baru", "Ruang Dokter Siap", "Koneksi Ruang Dokter Macet", "Belum Terjangkau") },
          { id: 3, targetDesc: "ai-consultation • POST /api/consultation/chat", ...evaluateStep(3, ["tahap 3", "streaming respon dokter ai"], "3. Kirim Chat AI Streaming", "Diagnosa Berjalan", "Waktu Tunggu AI Habis", "Alur Terputus di Awal") },
          { id: 4, targetDesc: "ai-consultation • GET /api/consultations/:id", ...evaluateStep(4, ["tahap 4", "baca detail konsultasi"], "4. Baca Riwayat Konsultasi", "Transkrip Tersimpan", "Gagal Simpan Chat", "Belum Sempat Tersimpan") },
          { id: 5, targetDesc: "ai-consultation • PATCH /api/consultations/:id", ...evaluateStep(5, ["tahap 5", "akhiri sesi & feedback", "akhiri sesi"], "5. Rating & Penutupan Sesi", "Sesi Selesai Normal", "Koneksi Terputus", "Belum Sempat Rating") },
        ]
      : record.flowTitle.includes("Lifestyle") || record.flowTitle.includes("Flow 2") || record.selectedFlow === "2"
      ? [
          { id: 1, targetDesc: "identity • GET /health", ...evaluateStep(1, ["tahap 1", "validasi status akun identity"], "1. Validasi Akun Identity", "Otorisasi Pasien Berhasil", "Antrean Masuk Padat (Ditolak)", "Belum Terjangkau") },
          { id: 2, targetDesc: "lifestyle • GET /api/articles", ...evaluateStep(2, ["tahap 2", "ambil katalog artikel kesehatan"], "2. Buka Katalog Artikel Medis", "Daftar Artikel Siap Dibaca", "Antrean Server & Database Penuh", "Belum Sempat Dibuka") },
          { id: 3, targetDesc: "lifestyle • GET /api/articles/:slug", ...evaluateStep(3, ["tahap 3", "baca detail artikel lengkap"], "3. Baca Konten Detail Artikel", "Artikel Terbuka Sempurna", "Gagal Membaca Konten", "Belum Sempat Dibaca Pasien") },
        ]
      : [
          { id: 1, targetDesc: "live-consult • GET /api/live-consult", ...evaluateStep(1, ["tahap 1", "daftar jadwal sesi dokter"], "1. Cari Jadwal Sesi Dokter", "Daftar Spesialis Terbuka", "Pencarian Dokter Penuh", "Belum Terjangkau") },
          { id: 2, targetDesc: "live-consult • GET /api/live-consult/:id", ...evaluateStep(2, ["tahap 2", "detail sesi konsultasi dokter"], "2. Detail Sesi Konsultasi", "Pemesanan Jadwal Selesai", "Antrean Reservasi Penuh", "Belum Sempat Memesan") },
          { id: 3, targetDesc: "live-consult • WS /ws/live-consult/:id", ...evaluateStep(3, ["tahap 3", "koneksi websocket", "chat dokter"], "3. Sambungan WebSocket & Chat", "Koneksi Chat Terhubung", "Sambungan Terputus", "Belum Terhubung") },
          { id: 4, targetDesc: "live-consult • GET /health/live", ...evaluateStep(4, ["tahap 4", "health probe live consult"], "4. Health Probe Layanan", "Semua Layanan Stabil", "Layanan Sedang Lambat", "Alur Terputus") },
        ];

  // Metrik Langkah Alur Pasien (Sinkron 1:1 dengan Kartu Tahapan Pasien)
  const unreachedStepsCount = flowSteps.filter((s) => s.status === "unreached").length;
  const bottleneckStep = flowSteps.find((s) => s.status === "bottleneck" || s.status === "partial");
  const bottleneckTitle = bottleneckStep ? bottleneckStep.title : "titik macet";

  const passedStepIds = flowSteps.filter((s) => s.status === "success").map((s) => s.id);
  const passedStepNames = passedStepIds.length > 0 ? passedStepIds.join(" & ") : "";

  // 100% DATA OTENTIK DARI GRAFANA k6 (BEBAS DARI ASUMSI / PENGADA-ADAAN):
  const totalHttpRequests = totalRequests;
  const successHttpRequests = successCount;
  const failedHttpRequests = failedCount;

  const passedChecksCount =
    record.k6Metrics?.checks?.passes ??
    (record.checks ? record.checks.reduce((acc, c) => acc + (c.passes || 0), 0) : 0);
  const failedChecksCount =
    record.k6Metrics?.checks?.fails ??
    (record.checks ? record.checks.reduce((acc, c) => acc + (c.fails || 0), 0) : 0);
  const totalChecksCount = passedChecksCount + failedChecksCount;

  const calcBase = Math.max(totalHttpRequests, 1);
  const pctSuccess = totalHttpRequests > 0 ? Number(((successHttpRequests / calcBase) * 100).toFixed(1)) : 0;
  const pctFailed = totalHttpRequests > 0 ? Number(((failedHttpRequests / calcBase) * 100).toFixed(1)) : 0;
  const pctChecksPass = totalChecksCount > 0 ? Number(((passedChecksCount / totalChecksCount) * 100).toFixed(1)) : 0;
  const pctChecksFail = totalChecksCount > 0 ? Number(((failedChecksCount / totalChecksCount) * 100).toFixed(1)) : 0;

  // Kasus khusus kegagalan non-HTTP (misal WebSocket rate limit 429 atau check assertion gagal sementara seluruh HTTP 200)
  const isWsOrCheckFailureOnly = (hasRealFailures || isOverload) && failedChecksCount > 0 && failedHttpRequests === 0;

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
                  {record.testType === "load_test" ? "Hasil Load Test (1x Gelombang)" : "Hasil Stress Test (Ketahanan Server)"}
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
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {record.testType === "load_test" ? "1x Iterasi Serentak" : "Tekanan Berkelanjutan"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {record.flowTitle} • Diuji dengan <strong>{record.targetVUs} Pasien Serentak</strong> {record.testType === "load_test" ? `(1x iterasi penuh, tuntas dalam ${record.durationSec || 1}s)` : `selama ${record.durationSec || 1} detik`}
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

              {/* Banner Pembeda Kategori: Load Test vs Stress Test */}
              {record.testType === "load_test" ? (
                <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-indigo-950 dark:text-indigo-200 shadow-2xs">
                  <div className="flex items-center gap-2.5 font-bold">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
                      <Zap className="w-4 h-4" />
                    </span>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                        Kategori Pengujian:
                      </span>
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        LOAD TEST (Beban Serentak 1x Gelombang)
                      </span>
                    </div>
                  </div>
                  <div className="text-[11px] text-indigo-700 dark:text-indigo-300 font-medium sm:text-right">
                    Kapasitas Konkurensi: <strong>{record.targetVUs} Pasien Masuk Sekaligus</strong> (Selesai dalam {record.durationSec || 1}s)
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-purple-950 dark:text-purple-200 shadow-2xs">
                  <div className="flex items-center gap-2.5 font-bold">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-purple-600 text-white shadow-xs">
                      <Activity className="w-4 h-4" />
                    </span>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 block">
                        Kategori Pengujian:
                      </span>
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        STRESS TEST (Uji Daya Tahan & Breakpoint Server)
                      </span>
                    </div>
                  </div>
                  <div className="text-[11px] text-purple-700 dark:text-purple-300 font-medium sm:text-right">
                    Uji Ketahanan: <strong>Puncak {record.targetVUs} VU</strong> selama <strong>{record.durationSec || 1} Detik</strong> (Looping Terus-menerus)
                  </div>
                </div>
              )}

              {/* Banner Titik Kegagalan Alur Sekuensial */}
              {effectiveFailurePoint && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 dark:bg-rose-950/30 flex items-start gap-3 shadow-xs">
                  <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-xs font-black">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                        Titik Macet Terdeteksi (Tahap {effectiveFailurePoint.stepNum} dari {effectiveFailurePoint.totalSteps})
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300">
                        FAIL-FAST STOP
                      </span>
                    </div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                      "{effectiveFailurePoint.stepName}" gagal: {effectiveFailurePoint.reason}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Sesuai alur sekuensial ketat, pengujian langsung dihentikan pada tahap ini untuk mencegah cascading failure. Seluruh tahap berikutnya ({effectiveFailurePoint.stepNum + 1} s/d {effectiveFailurePoint.totalSteps}) dibatalkan secara tertib.
                    </p>
                  </div>
                </div>
              )}
              
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
                    {effectiveFailurePoint
                      ? `Terhenti di Tahap #${effectiveFailurePoint.stepNum}`
                      : hasRealFailures
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
                        : effectiveFailurePoint || isOverload
                        ? "text-rose-500"
                        : isSlowQueue
                        ? "text-orange-500"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {isSetupTimeout
                      ? "Batal (Timeout)"
                      : effectiveFailurePoint
                      ? `Gagal di Tahap #${effectiveFailurePoint.stepNum}`
                      : isOverload
                      ? "Overload"
                      : isSlowQueue
                      ? "Antrean Padat"
                      : "100% Tangguh"}
                  </div>
                  <span className="text-[10px] text-slate-400 truncate">
                    {isSetupTimeout
                      ? "Persiapan Akun > 60 Detik"
                      : effectiveFailurePoint
                      ? `Alur terputus: ${effectiveFailurePoint.stepName}`
                      : isOverload
                      ? isWsOrCheckFailureOnly
                        ? `Kapasitas Terlampaui (${formatNumber(failedChecksCount)} Sesi Ditolak)`
                        : `Kapasitas Terlampaui (${record.errorRatePercent.toFixed(1)}% Error)`
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
                      : effectiveFailurePoint || isOverload
                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                      : failedCount > 0
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      : isSlowQueue
                      ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                      : "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                  }`}>
                    {isSetupTimeout
                      ? "⚠️ Pengujian Dibatalkan (Persiapan Akun Melebihi Batas Waktu 60 Detik)"
                      : effectiveFailurePoint
                      ? `⚠️ Terhenti di Tahap #${effectiveFailurePoint.stepNum} (${effectiveFailurePoint.stepName})`
                      : isOverload
                      ? "⚠️ Alur Terhenti Akibat Beban Puncak di Titik Macet"
                      : failedCount > 0
                      ? "Semua Langkah Tuntas Dijalankan"
                      : isSlowQueue
                      ? "🟠 Antrean Padat (Seluruh Langkah Tuntas)"
                      : "Semua Langkah Berhasil Dilewati"}
                  </span>
                </div>

                <div
                  className={`grid gap-2 pt-0.5 ${
                    flowSteps.length === 1
                      ? "grid-cols-1 max-w-xl"
                      : flowSteps.length === 2
                      ? "grid-cols-1 sm:grid-cols-2"
                      : flowSteps.length === 3
                      ? "grid-cols-1 sm:grid-cols-3"
                      : flowSteps.length === 4
                      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                      : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
                  }`}
                >
                  {flowSteps.map((step) => {
                    const isSuccess = step.status === "success";
                    const isPartial = step.status === "partial";
                    const isBottleneck = step.status === "bottleneck";
                    const isUnreached = step.status === "unreached";

                    return (
                      <div
                        key={step.id}
                        className={`p-3 rounded-xl border flex flex-col justify-between gap-2 transition ${
                          isSuccess
                            ? "bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-500/30 text-slate-800 dark:text-slate-200"
                            : isPartial
                            ? "bg-amber-50/60 dark:bg-amber-950/20 border-amber-500/40 text-amber-900 dark:text-amber-200"
                            : isBottleneck
                            ? "bg-rose-50/70 dark:bg-rose-950/25 border-rose-500/50 text-rose-900 dark:text-rose-200"
                            : "bg-slate-50/50 dark:bg-slate-900/30 border-dashed border-slate-300 dark:border-slate-800 text-slate-400"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-start gap-1.5 min-w-0 flex-1">
                            <div
                              className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 ${
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
                            <span className="font-bold text-xs leading-snug break-words" title={step.title}>
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

                        <div className="text-[10px] opacity-85 leading-relaxed break-words" title={step.desc}>
                          {step.desc}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* TABEL MATRIKS EKSEKUSI TAHAPAN BERURUTAN (STEP EXECUTION MATRIX) */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] overflow-hidden shadow-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-orange-500" />
                    Matriks Eksekusi Tahapan Berurutan (Step-by-Step Matrix)
                  </span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    {flowSteps.length} Tahap
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200/80 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-50/50 dark:bg-slate-900/40">
                        <th className="py-2.5 px-3 w-12 text-center">Tahap</th>
                        <th className="py-2.5 px-3">Nama Skenario</th>
                        <th className="py-2.5 px-3">Target Microservice & Endpoint</th>
                        <th className="py-2.5 px-3 text-center w-28">Status</th>
                        <th className="py-2.5 px-3 text-right">Hasil Diagnostik</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                      {flowSteps.map((st, i) => {
                        const isSuccess = st.status === "success";
                        const isBottleneck = st.status === "bottleneck";
                        const isPartial = st.status === "partial";

                        return (
                          <tr
                            key={st.id || i}
                            className={`transition hover:bg-slate-50/70 dark:hover:bg-slate-900/40 ${
                              isBottleneck ? "bg-rose-500/5 dark:bg-rose-950/20" : ""
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400">
                              #{st.id}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                              {st.title}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                              {(st as any).targetDesc || "-"}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase border ${
                                  isSuccess
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                    : isBottleneck
                                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                                    : isPartial
                                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700"
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isSuccess
                                      ? "bg-emerald-500"
                                      : isBottleneck
                                      ? "bg-rose-500 animate-pulse"
                                      : isPartial
                                      ? "bg-amber-500"
                                      : "bg-slate-400"
                                  }`}
                                />
                                {isSuccess ? "Lulus" : isBottleneck ? "Titik Gagal" : isPartial ? "Sebagian" : "Dilewati"}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              {st.desc}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
                      {!isSetupTimeout && isOverload && (
                        isWsOrCheckFailureOnly
                          ? `Kesimpulan: Server Mengalami Kendala Beban — ${formatNumber(failedChecksCount)} Sesi Ditolak (${effectiveFailurePoint?.reason || 'Batas Sambungan Terlampaui'})`
                          : `Kesimpulan: Server Mengalami Kendala Beban pada ${record.targetVUs} Pasien Serentak (${record.errorRatePercent.toFixed(1)}% Gagal)`
                      )}
                      {!isSetupTimeout && !isOverload && failedCount > 0 && `Kesimpulan: Seluruh ${record.targetVUs} Pasien Berhasil Tuntas (${failedCount} Penolakan Sesi Dipulihkan)`}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono font-bold shrink-0 opacity-85">
                    {isSetupTimeout
                      ? `${formatNumber(totalRequests)} request di tahap setup`
                      : isWsOrCheckFailureOnly
                      ? `${formatNumber(totalHttpRequests)} HTTP Lolos • ${formatNumber(failedChecksCount)} Sesi Ditolak`
                      : `${formatNumber(totalHttpRequests)} Total Request HTTP (${formatNumber(successHttpRequests)} Sukses, ${formatNumber(failedHttpRequests)} Gagal)`}
                    {isFullyCompleted ? " • 100% Lolos" : ""}
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
                    {isWsOrCheckFailureOnly ? (
                      <p className="leading-relaxed opacity-95">
                        Hasil pengujian k6 dengan beban <strong>{record.targetVUs} pasien serentak</strong> mencatat seluruh <strong>{formatNumber(totalHttpRequests)} request HTTP fisik berhasil diproses normal (100%)</strong> tanpa kegagalan HTTP{passedStepNames ? ` (Tahap ${passedStepNames} lolos)` : ""}.
                        Namun saat memasuki tahap interaksi real-time pada <strong>{bottleneckTitle}</strong>, batas koneksi server tercapai sehingga <strong>{formatNumber(failedChecksCount)} sambungan WebSocket ditolak ({pctChecksFail}%)</strong>{effectiveFailurePoint?.reason ? ` (${effectiveFailurePoint.reason})` : " (Status 429 Too Many Requests)"}.
                        {effectiveFailurePoint ? (
                          <span> Pengujian dihentikan secara tertib (fail-fast) pada <strong>Tahap #{effectiveFailurePoint.stepNum}: {effectiveFailurePoint.stepName}</strong> untuk menjaga stabilitas sistem.</span>
                        ) : unreachedStepsCount > 0 ? (
                          <span> Sebanyak {unreachedStepsCount} tahapan berikutnya dilewati untuk mencegah kegagalan berantai (cascading failure).</span>
                        ) : null}
                      </p>
                    ) : (
                      <p className="leading-relaxed opacity-95">
                        Hasil pengujian k6 dengan beban <strong>{record.targetVUs} pasien serentak</strong> mencatat total <strong>{formatNumber(totalHttpRequests)} request HTTP fisik</strong> yang dieksekusi oleh sistem.
                        Sebanyak <strong>{formatNumber(successHttpRequests)} request berhasil ({pctSuccess}%)</strong> diproses normal oleh server{passedStepNames ? ` (Langkah ${passedStepNames} lolos)` : ""}, sedangkan <strong>{formatNumber(failedHttpRequests)} request mengalami penolakan / kegagalan ({pctFailed}%)</strong>{bottleneckStep ? ` pada ${bottleneckTitle}` : ""}.
                        {totalChecksCount > 0 && (
                          <span> Dari validasi k6 (checks), tercatat <strong>{formatNumber(passedChecksCount)} validasi lolos ({pctChecksPass}%)</strong> dan <strong>{formatNumber(failedChecksCount)} validasi gagal ({pctChecksFail}%)</strong>.</span>
                        )}
                        {effectiveFailurePoint ? (
                          <span> Pengujian terhenti secara tertib di <strong>Tahap #{effectiveFailurePoint.stepNum}: {effectiveFailurePoint.stepName}</strong> karena: <em>{effectiveFailurePoint.reason}</em>.</span>
                        ) : unreachedStepsCount > 0 ? (
                          <span> Sebanyak {unreachedStepsCount} tahapan berikutnya tidak dieksekusi untuk mencegah beban berlebih (cascading failure).</span>
                        ) : (
                          <span> Seluruh alur transaksi selesai dievaluasi hingga akhir.</span>
                        )}
                      </p>
                    )}

                    {/* 3 Kotak Rincian Transparan */}
                    {isWsOrCheckFailureOnly ? (
                      <div className="p-2.5 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-rose-500/20 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                        <div>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold block text-xs">
                            ✓ {formatNumber(totalHttpRequests)} HTTP Sukses (100%)
                          </span>
                          <span className="text-slate-500 text-[10px]">
                            {passedStepNames ? `Tahap ${passedStepNames} lolos tervalidasi` : "Semua request HTTP lolos"}
                          </span>
                        </div>
                        <div>
                          <span className="text-rose-500 font-bold block text-xs">
                            ✗ {formatNumber(failedChecksCount)} Sesi Ditolak ({pctChecksFail}%)
                          </span>
                          <span className="text-slate-500 text-[10px]">
                            {bottleneckStep ? `Koneksi ditolak di ${bottleneckTitle}` : "Batas koneksi WebSocket tercapai"}
                          </span>
                        </div>
                        <div>
                          <span className="text-blue-600 dark:text-blue-400 font-bold block text-xs">
                            📋 {formatNumber(passedChecksCount)}/{formatNumber(totalChecksCount)} Check Lolos ({pctChecksPass}%)
                          </span>
                          <span className="text-slate-500 text-[10px]">
                            Rasio validasi k6 yang terpenuhi
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-rose-500/20 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                        <div>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold block text-xs">
                            ✓ {formatNumber(successHttpRequests)} Request Sukses ({pctSuccess}%)
                          </span>
                          <span className="text-slate-500 text-[10px]">
                            {passedStepNames ? `Langkah ${passedStepNames} lolos dieksekusi` : "Request HTTP lolos diproses"}
                          </span>
                        </div>
                        <div>
                          <span className="text-rose-500 font-bold block text-xs">
                            ✗ {formatNumber(failedHttpRequests)} Request Gagal ({pctFailed}%)
                          </span>
                          <span className="text-slate-500 text-[10px]">
                            {bottleneckStep ? `Penolakan respon di ${bottleneckTitle}` : "Request HTTP ditolak server"}
                          </span>
                        </div>
                        <div>
                          {totalChecksCount > 0 ? (
                            <>
                              <span className="text-blue-600 dark:text-blue-400 font-bold block text-xs">
                                📋 {formatNumber(passedChecksCount)}/{formatNumber(totalChecksCount)} Check Lolos ({pctChecksPass}%)
                              </span>
                              <span className="text-slate-500 text-[10px]">
                                {failedChecksCount > 0 ? `${formatNumber(failedChecksCount)} validasi check k6 gagal` : "Semua check k6 terpenuhi"}
                              </span>
                            </>
                          ) : effectiveFailurePoint ? (
                            <>
                              <span className="text-amber-600 dark:text-amber-400 font-bold block text-xs">
                                ⚠️ Titik Gagal: Tahap #{effectiveFailurePoint.stepNum}
                              </span>
                              <span className="text-slate-500 text-[10px] truncate block" title={effectiveFailurePoint.reason}>
                                {effectiveFailurePoint.stepName}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-slate-600 dark:text-slate-400 font-bold block text-xs">
                                ⏱️ Error Rate: {record.errorRatePercent.toFixed(1)}%
                              </span>
                              <span className="text-slate-500 text-[10px]">Tingkat kegagalan total k6</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Stacked Progress Bar 100% Data Riil k6 */}
                    <div className="pt-1 space-y-1">
                      <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex shadow-inner">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${isWsOrCheckFailureOnly ? pctChecksPass : pctSuccess}%` }}
                          title={isWsOrCheckFailureOnly ? `Validasi Lolos: ${passedChecksCount} (${pctChecksPass}%)` : `Request Sukses: ${successHttpRequests} (${pctSuccess}%)`}
                        />
                        <div
                          className="h-full bg-rose-500 transition-all duration-300"
                          style={{ width: `${isWsOrCheckFailureOnly ? pctChecksFail : pctFailed}%` }}
                          title={isWsOrCheckFailureOnly ? `Sesi Ditolak: ${failedChecksCount} (${pctChecksFail}%)` : `Request Gagal: ${failedHttpRequests} (${pctFailed}%)`}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 px-0.5">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          ● {isWsOrCheckFailureOnly ? `${formatNumber(passedChecksCount)} Validasi Lolos (${pctChecksPass}%)` : `${formatNumber(successHttpRequests)} Request Sukses (${pctSuccess}%)`}
                        </span>
                        <span className="text-rose-500 font-semibold">
                          ● {isWsOrCheckFailureOnly ? `${formatNumber(failedChecksCount)} Sesi Ditolak (${pctChecksFail}%)` : `${formatNumber(failedHttpRequests)} Request Gagal (${pctFailed}%)`}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 font-semibold">
                          {isWsOrCheckFailureOnly
                            ? `Total ${formatNumber(totalChecksCount)} Validasi k6 (${pctChecksFail}% Ditolak)`
                            : `Total ${formatNumber(totalHttpRequests)} Request HTTP (Error: ${record.errorRatePercent.toFixed(1)}%)`}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : !isOverload && failedCount > 0 ? (
                  <div className="space-y-2 text-xs">
                    <p className="leading-relaxed opacity-95">
                      Seluruh <strong>{record.targetVUs} pasien berhasil menyelesaikan seluruh alur pengujian</strong>
                      {flowSteps.length > 0 ? ` (${flowSteps.filter(s => s.status === "success").map(s => s.title).join(", ")} — tuntas 100%)` : ""}.
                      Tercatat <strong>{formatNumber(failedCount)} penolakan HTTP</strong> (respon error non-2xx, kemungkinan status 409 Konflik karena sesi sebelumnya masih aktif), namun k6 langsung melanjutkan alur menggunakan sesi tersebut sehingga seluruh pasien berhasil menyelesaikan transaksi tanpa terputus.
                    </p>

                    {/* 3 Kotak Rincian Transparan */}
                    <div className="p-2.5 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-amber-500/20 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold block text-xs">
                          ✓ {formatNumber(successHttpRequests)} Request Berhasil ({pctSuccess}%)
                        </span>
                        <span className="text-slate-500 text-[10px]">Aksi HTTP sukses diproses server</span>
                      </div>
                      <div>
                        <span className="text-amber-600 dark:text-amber-400 font-bold block text-xs">
                          ℹ️ {formatNumber(failedHttpRequests)} Request Ditolak ({pctFailed}%)
                        </span>
                        <span className="text-slate-500 text-[10px]">Respon error HTTP / status non-2xx</span>
                      </div>
                      <div>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold block text-xs">
                          ✓ {totalChecksCount > 0 ? `${formatNumber(passedChecksCount)}/${formatNumber(totalChecksCount)} Check Lolos` : `Total ${formatNumber(totalHttpRequests)} Request`}
                        </span>
                        <span className="text-slate-500 text-[10px]">Tervalidasi langsung oleh k6</span>
                      </div>
                    </div>

                    {/* Stacked Progress Bar */}
                    <div className="pt-1 space-y-1">
                      <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex shadow-inner">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${pctSuccess}%` }}
                          title={`Request Berhasil: ${successHttpRequests} (${pctSuccess}%)`}
                        />
                        <div
                          className="h-full bg-amber-500 transition-all duration-300"
                          style={{ width: `${pctFailed}%` }}
                          title={`Request Ditolak: ${failedHttpRequests} (${pctFailed}%)`}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 px-0.5">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          ● {formatNumber(successHttpRequests)} Request Sukses ({pctSuccess}%)
                        </span>
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          ● {formatNumber(failedHttpRequests)} Request Ditolak ({pctFailed}%)
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 font-semibold">
                          Total {formatNumber(totalHttpRequests)} Request HTTP
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
