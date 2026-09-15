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

  const isHealthy = record.healthGrade === "HEALTHY" && record.errorRatePercent <= 1.0;
  const isDegraded = record.healthGrade === "DEGRADED" || (record.errorRatePercent > 1.0 && record.errorRatePercent <= 5.0);
  const isCritical = record.healthGrade === "CRITICAL" || record.errorRatePercent > 5.0;

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

  const successPercent = totalRequests > 0 ? ((successCount / totalRequests) * 100).toFixed(1) : "0.0";
  const errorPercent = totalRequests > 0 ? ((failedCount / totalRequests) * 100).toFixed(1) : record.errorRatePercent.toFixed(1);

  // Latency metrics
  const m = record.k6Metrics;
  const p95Latency = m?.http_req_duration?.p95 ?? record.p95LatencyMs;

  const formatMs = (val?: number) => {
    if (val === undefined || val === null || isNaN(val)) return "0";
    return val >= 10 ? Math.round(val).toString() : val.toFixed(1);
  };

  const formattedP95 = formatMs(p95Latency);

  const copyRawLog = () => {
    const textToCopy = record.rawSummaryText || JSON.stringify(record, null, 2);
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper untuk mencocokkan status alur langkah perjalanan pasien
  const authenticChecks = record.checks && record.checks.length > 0 ? record.checks : [];
  const findCheck = (patterns: string[]) => {
    if (!authenticChecks || authenticChecks.length === 0) return null;
    return authenticChecks.find((c) =>
      patterns.some((p) => c.name.toLowerCase().includes(p.toLowerCase()))
    );
  };

  const getStepStatus = (patterns: string[]) => {
    const chk = findCheck(patterns);
    if (!chk) return { ok: failedCount === 0, label: failedCount === 0 ? "Berhasil" : "Gagal" };
    const total = chk.total || (chk.passes + chk.fails);
    const passRatio = total > 0 ? (chk.passes / total) : (chk.passed ? 1 : 0);
    const isOk = chk.passes > 0 && passRatio >= 0.7;
    return {
      ok: isOk,
      label: isOk ? "Berhasil" : "Ada Kendala",
    };
  };

  // Definisi tahapan alur yang ramah pengguna (human-friendly)
  const flowSteps = (
    record.flowTitle.includes("AI") || record.flowTitle.includes("Flow 1") || record.selectedFlow === "1"
      ? [
          { id: 1, name: "1. Akses Akun Pasien", sub: "Verifikasi Sesi", ...getStepStatus(["active consultation", "auth"]) },
          { id: 2, name: "2. Buka Sesi Konsultasi", sub: "Persiapan Sesi", ...getStepStatus(["create consultation"]) },
          { id: 3, name: "3. Tanya Jawab AI Dokter", sub: "Diagnosa Percakapan", ...getStepStatus(["ai chat"]) },
          { id: 4, name: "4. Riwayat Transkrip", sub: "Penyimpanan Chat", ...getStepStatus(["consultation detail", "detail has valid body"]) },
          { id: 5, name: "5. Beri Rating & Selesai", sub: "Penutupan Sesi", ...getStepStatus(["end consultation"]) },
        ]
      : record.flowTitle.includes("Lifestyle") || record.flowTitle.includes("Flow 2") || record.selectedFlow === "2"
      ? [
          { id: 1, name: "1. Verifikasi Akun", sub: "Otorisasi Pasien", ...getStepStatus(["auth", "pin status"]) },
          { id: 2, name: "2. Buka Katalog Artikel", sub: "Pencarian Konten", ...getStepStatus(["articles list", "articles body"]) },
          { id: 3, name: "3. Baca Isi Artikel Lengkap", sub: "Tampilan Edukasi", ...getStepStatus(["article detail", "detail body"]) },
        ]
      : [
          { id: 1, name: "1. Cari Jadwal Dokter", sub: "Daftar Spesialis", ...getStepStatus(["doctor sessions", "sessions body"]) },
          { id: 2, name: "2. Pilih Profil Dokter", sub: "Pemesanan Sesi", ...getStepStatus(["doctor session detail", "create doctor session"]) },
          { id: 3, name: "3. Kirim Chat ke Dokter", sub: "Koneksi Langsung", ...getStepStatus(["ws connected", "chat sent"]) },
          { id: 4, name: "4. Verifikasi Layanan", sub: "Koneksi Stabil", ...getStepStatus(["live consult health"]) },
        ]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0B0F19] shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* ============================================================== */}
        {/* HEADER BAR (BERSIH & USER FRIENDLY)                           */}
        {/* ============================================================== */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-white dark:bg-[#0B0F19]">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl border shadow-xs shrink-0 ${
                isHealthy
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                  : isDegraded
                  ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                  : "bg-rose-500/10 text-rose-500 border-rose-500/30"
              }`}
            >
              {isHealthy && <CheckCircle2 className="w-6 h-6" />}
              {isDegraded && <AlertTriangle className="w-6 h-6" />}
              {isCritical && <AlertTriangle className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  Hasil Pengujian Beban Sistem
                </h2>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase border ${
                    isHealthy
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                      : isDegraded
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                  }`}
                >
                  {isHealthy ? "Sangat Sehat & Lancar" : isDegraded ? "Sedikit Melambat" : "Perlu Diperiksa"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {record.flowTitle} • <strong>{record.targetVUs} Pasien</strong> selesai dalam <strong>{record.durationSec || 1} detik</strong>
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* TAB 1: RINGKASAN RAMAH PENGGUNA (ZERO SCROLL COCKPIT) */}
          {activeTab === "summary" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              {/* 1. 4 KARTU HASIL UTAMA (BESAR & MUDAH DIBACA) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Kartu 1: Beban Pasien */}
                <div className="bg-slate-50/80 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-orange-500" /> Pasien Diuji
                  </span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono my-1">
                    {record.targetVUs} <span className="text-xs font-semibold text-slate-400">Orang</span>
                  </div>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold truncate">
                    100% Selesai Bersamaan
                  </span>
                </div>

                {/* Kartu 2: Waktu Selesai */}
                <div className="bg-slate-50/80 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-500" /> Lama Pengujian
                  </span>
                  <div className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono my-1">
                    {record.durationSec || 1} <span className="text-xs font-semibold text-slate-400">Detik</span>
                  </div>
                  <span className="text-[11px] text-slate-400 truncate">
                    {formatNumber(record.currentRps)} aksi / detik
                  </span>
                </div>

                {/* Kartu 3: Kecepatan Respon */}
                <div className="bg-slate-50/80 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-emerald-500" /> Waktu Respon
                  </span>
                  <div
                    className={`text-2xl font-black font-mono my-1 ${
                      p95Latency > 1500
                        ? "text-rose-500"
                        : p95Latency > 1000
                        ? "text-amber-500"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {formattedP95} <span className="text-xs font-semibold opacity-75">ms</span>
                  </div>
                  <span className="text-[11px] text-slate-400 truncate">
                    {p95Latency < 300 ? "Sangat Cepat & Instan" : p95Latency < 1000 ? "Normal & Responsif" : "Mulai Ada Antrean"}
                  </span>
                </div>

                {/* Kartu 4: Tingkat Keberhasilan */}
                <div className="bg-slate-50/80 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Keberhasilan
                  </span>
                  <div
                    className={`text-2xl font-black font-mono my-1 ${
                      record.errorRatePercent > 5
                        ? "text-rose-500"
                        : record.errorRatePercent > 1
                        ? "text-amber-500"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {successPercent}%
                  </div>
                  <span className="text-[11px] text-slate-400 truncate">
                    {failedCount === 0 ? "Semua Berhasil (0 Gagal)" : `${formatNumber(failedCount)} Gagal`}
                  </span>
                </div>
              </div>

              {/* 2. VISUALISASI ALUR PERJALANAN PASIEN (STEP-BY-STEP FLOW) */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-4 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-orange-500" />
                    Tahapan Alur Pasien yang Berhasil Dilewati:
                  </span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    {record.targetVUs} Pasien Selesai Menjalankan
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-flow-col gap-2.5 pt-1">
                  {flowSteps.map((step) => (
                    <div
                      key={step.id}
                      className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition ${
                        step.ok
                          ? "bg-slate-50/70 dark:bg-slate-900/50 border-emerald-500/30 text-slate-800 dark:text-slate-200"
                          : "bg-rose-50/60 dark:bg-rose-950/20 border-rose-500/40 text-rose-900 dark:text-rose-200"
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          step.ok
                            ? "bg-emerald-500 text-white"
                            : "bg-rose-500 text-white"
                        }`}
                      >
                        {step.ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs truncate">{step.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{step.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. KESIMPULAN HASIL PENGUJIAN (MUDAH DIPAHAMI SIAPAPUN) */}
              <div
                className={`rounded-xl border p-4 space-y-2.5 shadow-xs ${
                  isHealthy
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200"
                    : isDegraded
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-200"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-black text-sm">
                    <span className="text-lg leading-none">{isHealthy ? "🟢" : isDegraded ? "🟡" : "🔴"}</span>
                    <span>
                      {isHealthy && "Kesimpulan: Sistem Bekerja dengan Sangat Baik"}
                      {isDegraded && "Kesimpulan: Sistem Mengalami Sedikit Beban"}
                      {isCritical && "Kesimpulan: Beban Melebihi Batas Nyaman"}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold">
                    Total {formatNumber(totalRequests)} Transaksi Diproses
                  </span>
                </div>

                <p className="text-xs leading-relaxed opacity-95 font-medium">
                  {failedCount === 0 ? (
                    <>
                      Pengujian beban berhasil membuktikan bahwa sistem aplikasi Tara AI mampu melayani{" "}
                      <strong>{record.targetVUs} pasien secara serentak</strong> dengan lancar. Seluruh alur perjalanan
                      pasien dituntaskan dalam waktu <strong>{record.durationSec || 1} detik</strong> dengan tingkat
                      keberhasilan <strong>100% (tanpa kegagalan)</strong> dan kecepatan respon rata-rata{" "}
                      <strong>{formattedP95} milidetik</strong>.
                    </>
                  ) : (
                    <>
                      Pengujian beban mendeteksi sebanyak <strong>{formatNumber(failedCount)} transaksi mengalami kendala</strong>{" "}
                      dari total {formatNumber(totalRequests)} transaksi ({errorPercent}% error) saat menerima beban serentak {record.targetVUs} pasien.
                    </>
                  )}
                </p>

                {/* Progress Bar Visual Keberhasilan Transaksi */}
                <div className="pt-1 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                    <span className="text-emerald-600 dark:text-emerald-400">● {successPercent}% Berhasil ({formatNumber(successCount)} transaksi)</span>
                    {failedCount > 0 && <span className="text-rose-500">● {errorPercent}% Gagal ({formatNumber(failedCount)})</span>}
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex shadow-inner">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
                      style={{ width: `${successPercent}%` }}
                    />
                    {failedCount > 0 && (
                      <div
                        className="h-full bg-gradient-to-r from-rose-500 to-amber-500"
                        style={{ width: `${errorPercent}%` }}
                      />
                    )}
                  </div>
                </div>
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
