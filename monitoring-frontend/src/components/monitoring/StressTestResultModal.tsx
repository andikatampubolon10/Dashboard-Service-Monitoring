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
  ArrowRight,
  Server,
  Layers,
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

  // Alur microservice berdasarkan flow dan endpoint yang diuji
  const getMicroserviceChain = () => {
    const ep = record.targetEndpoints;
    if (record.flowTitle.includes("AI") || record.flowTitle.includes("Flow 1")) {
      const idUrl = ep?.identity || "http://localhost:8081";
      const aiUrl = ep?.aiConsult || "http://localhost:4006";
      return [
        { name: "Identity Service", port: idUrl, role: "Autentikasi & Validasi JWT" },
        { name: "AI Consultation Service", port: aiUrl, role: "Logika Chat & Sesi AI" },
      ];
    }
    if (record.flowTitle.includes("Lifestyle") || record.flowTitle.includes("Flow 2")) {
      const idUrl = ep?.identity || "http://localhost:8081";
      const lsUrl = ep?.lifestyle || "http://localhost:4007";
      const hpUrl = ep?.healthProfile || "http://localhost:3001";
      return [
        { name: "Identity Service", port: idUrl, role: "Autentikasi & Validasi JWT" },
        { name: "Health Profile Service", port: hpUrl, role: "Validasi PIN & Profil" },
        { name: "Lifestyle Service", port: lsUrl, role: "Katalog Artikel & Kebugaran" },
      ];
    }
    const idUrl = ep?.identity || "http://localhost:8081";
    const lcUrl = ep?.liveConsult || "http://localhost:4004";
    return [
      { name: "Identity Service", port: idUrl, role: "Autentikasi & Validasi JWT" },
      { name: "Live Consult Service", port: lcUrl, role: "Sesi Konsultasi & Dokter Spesialis" },
    ];
  };

  const chain = getMicroserviceChain();

  // Interpretasi mudah dipahami untuk latency
  const getLatencyInterpretation = (ms: number) => {
    if (ms < 100) return "Sangat Instan (kurang dari 0.1 detik)";
    if (ms < 300) return "Cepat & responsif (~0.1 - 0.3 detik)";
    if (ms < 600) return "Mulus (sekitar setengah detik)";
    if (ms <= 1000) return "Normal (masih di bawah 1 detik)";
    if (ms <= 1500) return "Agak lambat (mendekati batas 1.5 detik)";
    return `Kelewat lambat (${(ms / 1000).toFixed(1)} detik)`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header Bar */}
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
                  HASIL UJI DAYA TAHAN
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {record.timestamp}
                </span>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-0.5">
                Rangkuman Hasil Stress Testing &amp; Kesiapan Sistem
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-200 transition cursor-pointer"
            aria-label="Tutup"
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
          <div className="flex items-start gap-3.5">
            <span className="text-2xl mt-0.5">
              {isHealthy ? "🟢" : isDegraded ? "🟡" : "🔴"}
            </span>
            <div className="space-y-1">
              <h3 className="font-black text-base uppercase tracking-wide">
                {isHealthy && "Sistem Sangat Cepat, Kuat, & Lancar (Lulus Uji)"}
                {isDegraded && "Sistem Berfungsi Namun Terjadi Keterlambatan Respon"}
                {isCritical && "Sistem Kewalahan / Kapasitas Terlampaui (Gagal Uji)"}
              </h3>
              <p className="text-xs leading-relaxed opacity-90 font-medium">
                {isHealthy &&
                  `Sistem berhasil melayani ${record.targetVUs} pengguna yang mengakses fitur ini secara bersamaan tanpa kendala. Seluruh transaksi berhasil 100% dan respon server sangat cepat.`}
                {isDegraded &&
                  `Sistem tetap memproses data, namun waktu respon mendekati ambang batas SLA. Pengguna mulai merasakan jeda pemuatan.`}
                {isCritical &&
                  `Kapasitas server terlampaui pada beban ${record.targetVUs} pengguna. Terjadi antrean latensi ekstrem atau transaksi gagal yang melanggar batas toleransi SLA.`}
              </p>
            </div>
          </div>
        </div>

        {/* Jalur Layanan / Microservices Chain */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
              <Layers className="w-3.5 h-3.5 text-orange-500" />
              Alur Microservice yang Diuji:
            </span>
            <span className="font-extrabold text-slate-900 dark:text-white bg-white dark:bg-slate-800 px-2.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs">
              {record.flowTitle}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {chain.map((svc, idx) => (
              <React.Fragment key={idx}>
                <div className="flex items-center gap-2 rounded-xl bg-white dark:bg-[#0B0F19] px-3 py-2 border border-slate-200 dark:border-slate-800 shadow-xs">
                  <Server className="w-3.5 h-3.5 text-emerald-500" />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {svc.name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Port :{svc.port} • {svc.role}
                    </div>
                  </div>
                </div>
                {idx < chain.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* 4 Kartu Metrik Utama */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span className="uppercase tracking-wider text-[11px]">ANGKA METRIK UTAMA &amp; ARTINYA:</span>
            <span className="text-[11px] text-slate-400 font-normal">
              Pengujian selama {record.totalRequests ? `${formatNumber(record.totalRequests)} total request` : "beban penuh"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Metric 1: Target VU */}
            <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Users className="w-3 h-3 text-orange-500" /> Beban Pengguna
                </span>
                <div className="text-xl font-black text-slate-900 dark:text-white font-mono mt-1">
                  {record.targetVUs} <span className="text-xs font-bold text-slate-400">Orang</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 border-t border-slate-200/60 dark:border-slate-800 pt-2 leading-tight">
                Simulasi {record.targetVUs} orang membuka &amp; memakai fitur ini secara serentak.
              </p>
            </div>

            {/* Metric 2: RPS */}
            <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Activity className="w-3 h-3 text-blue-500" /> Kecepatan Balas
                </span>
                <div className="text-xl font-black text-slate-900 dark:text-white font-mono mt-1">
                  {formatNumber(record.currentRps)} <span className="text-xs font-bold text-slate-400">transaksi/dtk</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 border-t border-slate-200/60 dark:border-slate-800 pt-2 leading-tight">
                Server sanggup menuntaskan {formatNumber(record.currentRps)} permintaan dalam setiap 1 detik.
              </p>
            </div>

            {/* Metric 3: Latensi P95 */}
            <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3 h-3 text-purple-500" /> Waktu Tunggu (P95)
                </span>
                <div
                  className={`text-xl font-black font-mono mt-1 ${
                    record.p95LatencyMs > 1500
                      ? "text-rose-500"
                      : record.p95LatencyMs > 1000
                      ? "text-amber-500"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {record.p95LatencyMs} <span className="text-xs font-bold opacity-75">ms</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 border-t border-slate-200/60 dark:border-slate-800 pt-2 leading-tight">
                {record.p95LatencyMs <= 1500
                  ? `${getLatencyInterpretation(record.p95LatencyMs)}. Jauh lebih cepat dari batas toleransi maksimal (1.5 detik).`
                  : `${getLatencyInterpretation(record.p95LatencyMs)}. Melebihi batas toleransi kenyamanan maksimal (1.5 detik).`}
              </p>
            </div>

            {/* Metric 4: Error Rate */}
            <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Zap className="w-3 h-3 text-rose-500" /> Tingkat Gagal
                </span>
                <div
                  className={`text-xl font-black font-mono mt-1 ${
                    record.errorRatePercent > 5
                      ? "text-rose-500"
                      : record.errorRatePercent > 1
                      ? "text-amber-500"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {record.errorRatePercent.toFixed(1)}%
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 border-t border-slate-200/60 dark:border-slate-800 pt-2 leading-tight">
                {record.errorRatePercent === 0
                  ? "Sempurna! 100% permintaan berhasil tanpa ada yang gagal."
                  : `${record.errorRatePercent.toFixed(1)}% permintaan terputus/gagal.`}
              </p>
            </div>
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
                className="inline-flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Uji Ulang
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 text-xs font-bold shadow-md shadow-orange-500/20 transition cursor-pointer"
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

