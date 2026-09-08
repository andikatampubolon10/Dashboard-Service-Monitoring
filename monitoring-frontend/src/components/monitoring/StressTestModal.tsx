import { useState, useEffect } from "react";
import { Zap, Play, Square, AlertCircle, CheckCircle2, RefreshCw, AlertTriangle, ArrowRight, ShieldCheck, MessageSquare, BookOpen, Stethoscope } from "lucide-react";
import { stressTestEngine, StressTestProgress, SelectedFlowType } from "../../services/stressTestEngine";
import { formatNumber, formatPercent } from "../../utils/formatters";

interface StressTestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function StressTestModal({ isOpen, onClose }: StressTestModalProps) {
  const [progress, setProgress] = useState<StressTestProgress>(stressTestEngine.getProgress());
  const [selectedFlow, setSelectedFlow] = useState<SelectedFlowType>("1");
  const [targetVUs, setTargetVUs] = useState<number>(50);

  useEffect(() => {
    const unsubscribe = stressTestEngine.subscribe((p) => setProgress(p));
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  const handleStart = () => {
    stressTestEngine.start(selectedFlow, targetVUs, 30);
  };

  const handleStop = () => {
    stressTestEngine.stop();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Stress Test & Performance Simulator</h2>
              <p className="text-xs text-muted-foreground">Uji ketahanan microservices Tara AI dengan simulasi beban pengguna nyata</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground text-sm font-semibold transition"
          >
            ✕
          </button>
        </div>

        {/* Step 1: Pilih Flow Scenario */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-[11px] font-extrabold">1</span>
              Pilih Alur Fitur Yang Ingin Diuji (Flow Scenario)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Flow 1 Card */}
            <button
              type="button"
              disabled={progress.isRunning}
              onClick={() => {
                setSelectedFlow("1");
                stressTestEngine.setSelectedFlow("1");
              }}
              className={`rounded-xl border p-3.5 text-left transition-all relative flex flex-col justify-between space-y-3 ${
                selectedFlow === "1"
                  ? "border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/20 shadow-md"
                  : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-foreground">
                    <MessageSquare className="w-3.5 h-3.5 text-rose-500" />
                    <span>Flow 1</span>
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20">
                    AI Service
                  </span>
                </div>
                <div className="text-xs font-bold text-foreground">Konsultasi AI Healthcare</div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Menguji proses Login, pembuatan ruang AI, hingga penerimaan respon balasan diagnosis.
                </p>
              </div>

              {/* Step Sequence Details */}
              <div className="pt-2 border-t border-border/50 text-[10px] space-y-1 text-muted-foreground">
                <div className="flex items-center gap-1 font-semibold text-foreground">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>1. Login Identity</span>
                </div>
                <div className="flex items-center gap-1 font-semibold text-foreground">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>2. Sesi AI Chat</span>
                </div>
                <div className="flex items-center gap-1 font-semibold text-foreground">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>3. Respon AI Received</span>
                </div>
              </div>
            </button>

            {/* Flow 2 Card */}
            <button
              type="button"
              disabled={progress.isRunning}
              onClick={() => {
                setSelectedFlow("2");
                stressTestEngine.setSelectedFlow("2");
              }}
              className={`rounded-xl border p-3.5 text-left transition-all relative flex flex-col justify-between space-y-3 ${
                selectedFlow === "2"
                  ? "border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/20 shadow-md"
                  : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-foreground">
                    <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                    <span>Flow 2</span>
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    Lifestyle
                  </span>
                </div>
                <div className="text-xs font-bold text-foreground">PIN & Baca Artikel</div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Menguji verifikasi kode PIN keamanan, membaca katalog, dan detail isi artikel kesehatan.
                </p>
              </div>

              {/* Step Sequence Details */}
              <div className="pt-2 border-t border-border/50 text-[10px] space-y-1 text-muted-foreground">
                <div className="flex items-center gap-1 font-semibold text-foreground">
                  <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>1. Verifikasi PIN</span>
                </div>
                <div className="flex items-center gap-1 font-semibold text-foreground">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>2. List Artikel</span>
                </div>
                <div className="flex items-center gap-1 font-semibold text-foreground">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>3. Baca Detail Artikel</span>
                </div>
              </div>
            </button>

            {/* Flow 3 Card */}
            <button
              type="button"
              disabled={progress.isRunning}
              onClick={() => {
                setSelectedFlow("3");
                stressTestEngine.setSelectedFlow("3");
              }}
              className={`rounded-xl border p-3.5 text-left transition-all relative flex flex-col justify-between space-y-3 ${
                selectedFlow === "3"
                  ? "border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/20 shadow-md"
                  : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-foreground">
                    <Stethoscope className="w-3.5 h-3.5 text-blue-500" />
                    <span>Flow 3</span>
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
                    Medical Record
                  </span>
                </div>
                <div className="text-xs font-bold text-foreground">Pencarian & Profil Dokter</div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Menguji Login pengguna, pencarian spesialis dokter, hingga membuka profil detail dokter.
                </p>
              </div>

              {/* Step Sequence Details */}
              <div className="pt-2 border-t border-border/50 text-[10px] space-y-1 text-muted-foreground">
                <div className="flex items-center gap-1 font-semibold text-foreground">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>1. Login Identity</span>
                </div>
                <div className="flex items-center gap-1 font-semibold text-foreground">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>2. Cari & List Dokter</span>
                </div>
                <div className="flex items-center gap-1 font-semibold text-foreground">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>3. Profil Detail Dokter</span>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Keterangan Detail Flow Yang Dipilih */}
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-3 text-xs text-foreground space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
            <ArrowRight className="w-3.5 h-3.5" />
            <span>Keterangan Alur Yang Dipilih ({selectedFlow === "1" ? "Flow 1: Konsultasi AI" : selectedFlow === "2" ? "Flow 2: Artikel" : "Flow 3: Cari Dokter"}):</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed pl-5">
            {selectedFlow === "1" && "Setiap Virtual User akan melakukan Login (Identity Service), membuat sesi konsultasi (AI Service), lalu mengirim pertanyaan gejala hingga AI memberikan respon diagnosis."}
            {selectedFlow === "2" && "Setiap Virtual User akan memverifikasi PIN 6-digit (Identity Service), mengambil daftar artikel kesehatan (Lifestyle Service), lalu membaca detail artikel."}
            {selectedFlow === "3" && "Setiap Virtual User akan melakukan Login (Identity Service), mencari daftar dokter spesialis (Medical Record Service), lalu membuka profil lengkap dokter."}
          </p>
        </div>

        {/* Step 2: Tentukan Jumlah User (VU) */}
        <div className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-[11px] font-extrabold">2</span>
              <span>Tentukan Jumlah Pengguna Bersamaan (Virtual Users / VU)</span>
            </span>

            <div className="flex items-center gap-1.5">
              <input
                type="number"
                disabled={progress.isRunning}
                min={1}
                max={2000}
                value={targetVUs}
                onChange={(e) => setTargetVUs(Math.max(1, parseInt(e.target.value || "1", 10)))}
                className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-bold font-mono text-center text-foreground focus:border-orange-500 focus:outline-none shadow-sm"
              />
              <span className="text-xs font-bold text-muted-foreground">VU</span>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-muted-foreground font-semibold">Preset Cepat:</span>
            {[25, 50, 100, 200, 500].map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={progress.isRunning}
                onClick={() => setTargetVUs(preset)}
                className={`rounded-lg px-3 py-1 text-xs font-bold font-mono transition-all ${
                  targetVUs === preset
                    ? "bg-orange-500 text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                {preset} User
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground italic">
            💡 {targetVUs} VU mensimulasikan {targetVUs} pengguna aktif yang menekan fitur ini secara bersamaan.
          </p>
        </div>

        {/* Live Progress & Progress Bar */}
        <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="flex items-center gap-2 text-foreground">
              {progress.isRunning ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-orange-500" />
                  <span>Tahap {progress.currentStageIndex + 1}/{progress.totalStages}: <span className="text-orange-500 font-mono font-extrabold">{progress.activeVUs} VU</span> Aktif</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Status: Siap Menjalankan Pengujian</span>
                </>
              )}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              Waktu: {progress.elapsedSec}s / {progress.totalDurationSec}s
            </span>
          </div>

          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
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

        {/* Real-time Result Stats with Explanations */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-foreground">
            <span>Metrik Hasil Pengujian Real-Time:</span>
            <span className="text-[11px] font-normal text-muted-foreground">Total Request: {formatNumber(progress.totalRequests)} ({formatNumber(progress.successRequests)} Sukses, {formatNumber(progress.failedRequests)} Gagal)</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <span className="text-[10px] font-semibold text-muted-foreground block">Pengguna Aktif</span>
              <p className="text-xl font-extrabold font-mono text-foreground mt-0.5">{progress.activeVUs} <span className="text-xs font-normal text-muted-foreground">User</span></p>
              <span className="text-[9px] text-muted-foreground block mt-1">Virtual Users (VU)</span>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <span className="text-[10px] font-semibold text-muted-foreground block">Kecepatan Transaksi</span>
              <p className="text-xl font-extrabold font-mono text-orange-500 mt-0.5">{progress.currentRps} <span className="text-xs font-normal text-muted-foreground">RPS</span></p>
              <span className="text-[9px] text-muted-foreground block mt-1">Request / Detik</span>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <span className="text-[10px] font-semibold text-muted-foreground block">Waktu Tunggu (P95)</span>
              <p className={`text-xl font-extrabold font-mono mt-0.5 ${progress.p95LatencyMs > 1000 ? "text-rose-500" : "text-foreground"}`}>
                {progress.p95LatencyMs} <span className="text-xs font-normal text-muted-foreground">ms</span>
              </p>
              <span className="text-[9px] text-muted-foreground block mt-1">Lama Respon Aplikasi</span>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <span className="text-[10px] font-semibold text-muted-foreground block">Tingkat Kegagalan</span>
              <p className={`text-xl font-extrabold font-mono mt-0.5 ${progress.errorRatePercent > 5 ? "text-rose-500" : "text-emerald-500"}`}>
                {formatPercent(progress.errorRatePercent, 1)}
              </p>
              <span className="text-[9px] text-muted-foreground block mt-1">Persentase Error</span>
            </div>
          </div>
        </div>

        {/* Laporan Kesimpulan Hasil Pengujian (System Health Verdict Card) */}
        {(progress.isRunning || progress.isFinished || progress.totalRequests > 0) && (
          <div className={`rounded-xl border p-4 text-xs space-y-1.5 transition-all ${
            progress.healthGrade === 'HEALTHY'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : progress.healthGrade === 'DEGRADED'
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
          }`}>
            <div className="font-bold text-sm flex items-center gap-2">
              {progress.healthGrade === 'HEALTHY' && <span>🟢 KESIMPULAN: SISTEM SANGAT STABIL & SEHAT</span>}
              {progress.healthGrade === 'DEGRADED' && <span>🟡 KESIMPULAN: SISTEM MULAI TERTEKAN (AGAK LAMBAT)</span>}
              {progress.healthGrade === 'CRITICAL' && <span>🔴 KESIMPULAN: SISTEM OVERLOAD / KRITIS!</span>}
            </div>
            <p className="text-xs leading-relaxed font-medium">
              {progress.healthVerdict}
            </p>
            <div className="pt-1.5 text-[11px] font-mono border-t border-current/10 flex items-center justify-between">
              <span>Rincian Hasil: {formatNumber(progress.successRequests)} Request Berhasil Diproses</span>
              <span>Rata-rata Respon: {progress.avgLatencyMs} ms</span>
            </div>
          </div>
        )}

        {/* Threshold Critical Warning Banner */}
        {progress.isThresholdBreached && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-500">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-bold">⚠️ Batas Kritis SLA Terlampaui: Waktu Tunggu (P95) &gt; 1000ms atau Tingkat Kegagalan &gt; 5.0%!</span>
          </div>
        )}

        {/* Main Action Control Button */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span>Targeting Live Local Microservices</span>
          </div>

          <div>
            {progress.isRunning ? (
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-6 py-3 text-xs font-bold text-white hover:bg-rose-600 transition-colors shadow-md cursor-pointer"
              >
                <Square className="h-4 w-4 fill-white" /> HENTIKAN PENGUJIAN
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-xs font-extrabold text-white hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/25 cursor-pointer uppercase tracking-wider"
              >
                <Play className="h-4 w-4 fill-white" /> JALANKAN STRESS TEST ({targetVUs} USER)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



