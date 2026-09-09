import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Zap,
  Clock,
  Users,
  Activity,
  X,
  RotateCcw,
  Sparkles,
  ShieldCheck,
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
  if (!isOpen || !record) return null;

  const isHealthy = record.healthGrade === "HEALTHY";
  const isDegraded = record.healthGrade === "DEGRADED";
  const isCritical = record.healthGrade === "CRITICAL";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header Title Bar */}
        <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
                isHealthy
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                  : isDegraded
                  ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                  : "bg-rose-500/10 text-rose-500 border-rose-500/30"
              }`}
            >
              {isHealthy && <CheckCircle2 className="w-7 h-7" />}
              {isDegraded && <AlertTriangle className="w-7 h-7" />}
              {isCritical && <AlertTriangle className="w-7 h-7" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                  LAPORAN KEKUATAN SISTEM
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {record.timestamp}
                </span>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-0.5">
                Hasil Uji Daya Tahan &amp; Solusi Penguatan Sistem
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Health Verdict Status Banner */}
        <div
          className={`rounded-2xl border p-4 sm:p-5 ${
            isHealthy
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200"
              : isDegraded
              ? "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-200"
              : "bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">
              {isHealthy ? "🟢" : isDegraded ? "🟡" : "🔴"}
            </span>
            <div>
              <h3 className="font-black text-base uppercase tracking-wide">
                {isHealthy && "Sistem Sangat Cepat & Lancar"}
                {isDegraded && "Sistem Mulai Terasa Ada Jeda (Waktu Tunggu Meningkat)"}
                {isCritical && "Sistem Kewalahan / Ada Transaksi Gagal!"}
              </h3>
              <p className="text-xs opacity-90 font-medium mt-0.5">
                {record.healthVerdict}
              </p>
            </div>
          </div>
        </div>

        {/* Flow & Metrics Summary Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>FITUR YANG DIUJI:</span>
            <span className="font-extrabold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
              {record.flowTitle}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Metric 1: Target VU */}
            <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center justify-center gap-1">
                <Users className="w-3 h-3 text-orange-500" /> Beban Pengguna
              </span>
              <span className="text-lg font-black text-slate-900 dark:text-white font-mono mt-0.5 block">
                {record.targetVUs} <span className="text-xs font-bold text-slate-400">Orang</span>
              </span>
            </div>

            {/* Metric 2: RPS */}
            <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center justify-center gap-1">
                <Activity className="w-3 h-3 text-blue-500" /> Kecepatan Balas
              </span>
              <span className="text-lg font-black text-slate-900 dark:text-white font-mono mt-0.5 block">
                {formatNumber(record.currentRps)} <span className="text-xs font-bold text-slate-400">proses/dtk</span>
              </span>
            </div>

            {/* Metric 3: Latensi P95 */}
            <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center justify-center gap-1">
                <Clock className="w-3 h-3 text-purple-500" /> Waktu Tunggu
              </span>
              <span
                className={`text-lg font-black font-mono mt-0.5 block ${
                  record.p95LatencyMs > 1000 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {record.p95LatencyMs} <span className="text-xs font-bold opacity-75">ms</span>
              </span>
            </div>

            {/* Metric 4: Error Rate */}
            <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center justify-center gap-1">
                <Zap className="w-3 h-3 text-rose-500" /> Tingkat Gagal
              </span>
              <span
                className={`text-lg font-black font-mono mt-0.5 block ${
                  record.errorRatePercent > 5 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {record.errorRatePercent.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Actionable Recommendations Section */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-5 space-y-3.5">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-extrabold text-sm border-b border-slate-200/60 dark:border-slate-800 pb-2.5">
            <Sparkles className="w-4 h-4 text-orange-500" />
            <span>Langkah Praktis untuk Memperkuat Aplikasi:</span>
          </div>

          <div className="space-y-2 text-xs">
            {record.recommendations && record.recommendations.length > 0 ? (
              record.recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 bg-white dark:bg-[#0B0F19] p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 leading-relaxed font-medium"
                >
                  <span className="text-orange-500 font-bold shrink-0 mt-0.5">#{idx + 1}</span>
                  <span>{rec}</span>
                </div>
              ))
            ) : (
              <p className="text-slate-500 text-xs italic">Tidak ada rekomendasi khusus.</p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
          <div className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Tersimpan di Riwayat Pengujian</span>
          </div>

          <div className="flex items-center gap-3">
            {onReRun && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReRun();
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 transition"
              >
                <RotateCcw className="w-4 h-4" />
                Uji Ulang
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 text-xs font-bold shadow-md shadow-orange-500/20 transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              Tutup Laporan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StressTestResultModal;
