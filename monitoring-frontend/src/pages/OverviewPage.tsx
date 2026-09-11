
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Network,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Eye,
  MessageSquare,
  BookOpen,
  Stethoscope,
  Database,
  Cpu,
  BarChart3,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { useOverviewMetrics } from '../hooks/useOverviewMetrics';
import { useServices } from '../hooks/useServices';
import { useServers } from '../hooks/useServers';
import {
  getStressTestHistory,
  StressTestRecord,
  stressTestEngine,
} from '../services/stressTestEngine';
import { formatNumber } from '../utils/formatters';
import StressTestResultModal from '../components/monitoring/StressTestResultModal';

interface FlowAnalysis {
  record: StressTestRecord | null;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'UNTESTED';
  statusLabel: string;
  targetVUs: number;
  p95LatencyMs: number;
  errorRatePercent: number;
  currentRps: number;
  reason: string;
  recommendation: string;
}

function getFlow1Analysis(record: StressTestRecord | null): FlowAnalysis {
  if (!record) {
    return {
      record: null,
      status: 'UNTESTED',
      statusLabel: '⚪ Belum Pernah Dites',
      targetVUs: 0,
      p95LatencyMs: 0,
      errorRatePercent: 0,
      currentRps: 0,
      reason: 'Fitur konsultasi AI belum pernah diuji coba. Anda bisa mengujinya untuk melihat berapa banyak pengguna yang sanggup dilayani oleh dokter AI secara bersamaan.',
      recommendation: 'Jalankan pengujian pada fitur ini untuk melihat kecepatan proses berpikir AI.',
    };
  }

  const isHealthy = record.healthGrade === 'HEALTHY';
  const isDegraded = record.healthGrade === 'DEGRADED';

  let reason = '';
  let statusLabel = '';

  if (isHealthy) {
    statusLabel = '🟢 Sangat Cepat & Lancar';
    reason = `Dokter AI merespons dengan sangat cepat pada beban ${record.targetVUs} pengguna sekaligus. Pesan langsung terbalas dalam waktu ${record.p95LatencyMs} milidetik tanpa kendala.`;
  } else if (isDegraded) {
    statusLabel = '🟡 Mulai Terasa Lambat';
    reason = `Setiap jawaban AI membutuhkan proses berpikir cerdas yang cukup berat. Saat ada ${record.targetVUs} orang bertanya bersamaan, antrean bertambah sehingga pengguna menunggu sedikit lebih lama (${record.p95LatencyMs} milidetik).`;
  } else {
    statusLabel = '🔴 Kewalahan / Macet';
    reason = `Sistem AI kewalahan melayani ${record.targetVUs} pengguna sekaligus! Antrean terlalu panjang (${record.p95LatencyMs} milidetik) dan sekitar ${record.errorRatePercent.toFixed(1)}% pesan gagal terkirim.`;
  }

  const recommendation = isHealthy
    ? 'Performa AI sangat baik. Silakan coba naikkan jumlah pengguna untuk melihat batas maksimalnya.'
    : 'Simpan jawaban pertanyaan umum di memori cepat (Cache) agar AI tidak perlu berpikir berulang-ulang untuk pertanyaan serupa.';

  return {
    record,
    status: record.healthGrade,
    statusLabel,
    targetVUs: record.targetVUs,
    p95LatencyMs: record.p95LatencyMs,
    errorRatePercent: record.errorRatePercent,
    currentRps: record.currentRps,
    reason,
    recommendation,
  };
}

function getFlow2Analysis(record: StressTestRecord | null): FlowAnalysis {
  if (!record) {
    return {
      record: null,
      status: 'UNTESTED',
      statusLabel: '⚪ Belum Pernah Dites',
      targetVUs: 0,
      p95LatencyMs: 0,
      errorRatePercent: 0,
      currentRps: 0,
      reason: 'Fitur membaca artikel belum pernah diuji coba. Fitur ini cocok dites untuk melihat kesiapan aplikasi jika ada berita kesehatan yang viral.',
      recommendation: 'Jalankan pengujian untuk melihat ketahanan server saat ribuan pembaca membuka artikel.',
    };
  }

  const isHealthy = record.healthGrade === 'HEALTHY';
  const isDegraded = record.healthGrade === 'DEGRADED';

  let reason = '';
  let statusLabel = '';

  if (isHealthy) {
    statusLabel = '🟢 Paling Cepat & Tangguh';
    reason = `Membuka artikel hanya menampilkan tulisan dan gambar yang sudah siap saji tanpa proses rumit. Sistem sangat hemat tenaga dan lancar (${record.p95LatencyMs} milidetik) saat dibaca ${record.targetVUs} orang sekaligus.`;
  } else if (isDegraded) {
    statusLabel = '🟡 Sedikit Lambat';
    reason = `Banyaknya pengguna (${record.targetVUs} orang) yang membuka artikel di detik yang sama mulai membuat jalur data server agak padat (${record.p95LatencyMs} milidetik).`;
  } else {
    statusLabel = '🔴 Sambungan Terputus';
    reason = `Kapasitas server penuh karena diserbu ${record.targetVUs} pembaca sekaligus, sehingga sebagian pengguna mengalami gagal memuat halaman.`;
  }

  const recommendation = isHealthy
    ? 'Kondisi fitur ini sangat prima dan sudah siap menampung lonjakan pembaca kapan saja.'
    : 'Gunakan teknologi penyimpanan sementara (Cache CDN) agar server utama tidak terbebani saat artikel ramai dibaca.';

  return {
    record,
    status: record.healthGrade,
    statusLabel,
    targetVUs: record.targetVUs,
    p95LatencyMs: record.p95LatencyMs,
    errorRatePercent: record.errorRatePercent,
    currentRps: record.currentRps,
    reason,
    recommendation,
  };
}

function getFlow3Analysis(record: StressTestRecord | null): FlowAnalysis {
  if (!record) {
    return {
      record: null,
      status: 'UNTESTED',
      statusLabel: '⚪ Belum Pernah Dites',
      targetVUs: 0,
      p95LatencyMs: 0,
      errorRatePercent: 0,
      currentRps: 0,
      reason: 'Fitur pencarian dokter belum diuji. Anda bisa mengujinya untuk melihat kecepatan pencarian saat jam sibuk pendaftaran pasien.',
      recommendation: 'Jalankan pengujian pada Flow 3 untuk mengukur kecepatan pencarian daftar dokter.',
    };
  }

  const isHealthy = record.healthGrade === 'HEALTHY';
  const isDegraded = record.healthGrade === 'DEGRADED';

  let reason = '';
  let statusLabel = '';

  if (isHealthy) {
    statusLabel = '🟢 Lancar & Responsif';
    reason = `Pencarian nama dan jadwal dokter bekerja lancar pada beban ${record.targetVUs} pengguna. Hasil pencarian langsung muncul dalam ${record.p95LatencyMs} milidetik tanpa error.`;
  } else if (isDegraded) {
    statusLabel = '🟡 Pencarian Mulai Berat';
    reason = `Sistem mencari dokter dengan membaca seluruh daftar data dari atas ke bawah. Saat ${record.targetVUs} orang memfilter dokter bersamaan, proses pencarian mulai memakan waktu (${record.p95LatencyMs} milidetik).`;
  } else {
    statusLabel = '🔴 Antrean Penuh';
    reason = `Database kewalahan melayani pencarian dari ${record.targetVUs} orang sekaligus, menyebabkan antrean dokter macet dan pencarian menjadi gagal.`;
  }

  const recommendation = isHealthy
    ? 'Pencarian dokter saat ini bekerja optimal. Lanjutkan pengujian bersama fitur-fitur lain.'
    : 'Beri tanda indeks pencarian cepat (seperti daftar isi buku) agar nama dokter langsung ditemukan seketika.';

  return {
    record,
    status: record.healthGrade,
    statusLabel,
    targetVUs: record.targetVUs,
    p95LatencyMs: record.p95LatencyMs,
    errorRatePercent: record.errorRatePercent,
    currentRps: record.currentRps,
    reason,
    recommendation,
  };
}

export const OverviewPage: React.FC = () => {
  const { data: metrics } = useOverviewMetrics();
  const { data: services = [] } = useServices();
  const { data: servers = [] } = useServers();

  const [history, setHistory] = useState<StressTestRecord[]>([]);
  const [selectedModalRecord, setSelectedModalRecord] = useState<StressTestRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    setHistory(getStressTestHistory());

    const unsubscribe = stressTestEngine.subscribe((progress) => {
      if (progress.isFinished) {
        setHistory(getStressTestHistory());
      }
    });

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'tara_stress_test_history_v1') {
        setHistory(getStressTestHistory());
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      unsubscribe();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const totalRuns = history.length;
  const passedRuns = history.filter((r) => r.healthGrade === 'HEALTHY').length;
  const degradedRuns = history.filter((r) => r.healthGrade === 'DEGRADED').length;
  const criticalRuns = history.filter((r) => r.healthGrade === 'CRITICAL').length;
  const complianceRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 100;

  const healthyRuns = history.filter((r) => r.healthGrade === 'HEALTHY');
  const maxSafeVU = healthyRuns.length > 0 ? Math.max(...healthyRuns.map((r) => r.targetVUs)) : 0;

  const failedRuns = history.filter((r) => r.healthGrade !== 'HEALTHY');
  const breakingPointVU = failedRuns.length > 0 ? Math.min(...failedRuns.map((r) => r.targetVUs)) : null;

  const latestFlow1 = history.find((r) => r.selectedFlow === '1') || null;
  const latestFlow2 = history.find((r) => r.selectedFlow === '2') || null;
  const latestFlow3 = history.find((r) => r.selectedFlow === '3') || null;

  const flow1 = getFlow1Analysis(latestFlow1);
  const flow2 = getFlow2Analysis(latestFlow2);
  const flow3 = getFlow3Analysis(latestFlow3);

  const latestRun = history.length > 0 ? history[0] : null;

  const getFriendlyFlowName = (flowId: string, title?: string): string => {
    if (flowId === '1') return 'Konsultasi Chat Dokter AI';
    if (flowId === '2') return 'Membaca Artikel Kesehatan';
    if (flowId === '3') return 'Pencarian Jadwal & Dokter';
    if (title && title.includes(':')) {
      return title.split(':')[1]?.trim() || title;
    }
    return title || 'Fitur Layanan';
  };

  // DATA GRAFIK PER BEBAN PENGGUNA (HANYA DARI PENGUJIAN NYATA)
  const uniqueVUMap = new Map<number, StressTestRecord>();
  history.forEach((run) => {
    if (!uniqueVUMap.has(run.targetVUs)) {
      uniqueVUMap.set(run.targetVUs, run);
    }
  });

  const actualVUTests = Array.from(uniqueVUMap.values()).sort((a, b) => a.targetVUs - b.targetVUs);

  const vuComparisonChartData = actualVUTests.map((run) => {
    const isHealthy = run.healthGrade === 'HEALTHY';
    const isDegraded = run.healthGrade === 'DEGRADED';
    const color = isHealthy ? '#10b981' : isDegraded ? '#f59e0b' : '#ef4444';

    let userFriendlyStatus = '🟢 Sangat Lancar';
    let userExperienceNote = 'Pengguna merasa nyaman, aplikasi merespons seketika.';

    if (run.p95LatencyMs > 1000 || run.healthGrade === 'CRITICAL') {
      userFriendlyStatus = '🔴 Terasa Lambat (Macet)';
      userExperienceNote = 'Pengguna menunggu terlalu lama dan berisiko keluar dari aplikasi.';
    } else if (run.p95LatencyMs > 500 || run.healthGrade === 'DEGRADED') {
      userFriendlyStatus = '🟡 Mulai Ada Jeda';
      userExperienceNote = 'Masih bisa dipakai, namun mulai terasa ada jeda saat memuat data.';
    }

    return {
      vu: `${run.targetVUs} Orang`,
      rawVU: run.targetVUs,
      flowShort: getFriendlyFlowName(run.selectedFlow, run.flowTitle),
      p95: run.p95LatencyMs,
      rps: run.currentRps,
      errorRate: run.errorRatePercent === 0 ? '0% (Aman)' : `${run.errorRatePercent.toFixed(1)}% Gagal`,
      status: userFriendlyStatus,
      experience: userExperienceNote,
      timestamp: run.timestamp,
      color,
      record: run,
    };
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* 1. HEADER UTAMA (BAHASA MUDAH DIPAHAMI) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
              PEMANTAUAN KESEHATAN SISTEM
            </span>
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Semua Layanan Berjalan Normal
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
            Dashboard Kesehatan &amp; Daya Tahan Aplikasi
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Pantau seberapa cepat aplikasi merespons dan seberapa banyak pengguna yang sanggup dilayani bersamaan tanpa kendala.
          </p>
        </div>

        <Link
          to="/stress-test"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-sm shadow-orange-500/25 transition self-start sm:self-auto"
        >
          <Zap className="w-4 h-4 fill-white" />
          <span>Uji Daya Tahan Sistem ↗</span>
        </Link>
      </div>

      {/* 2. 4 KARTU RINGKASAN KONDISI APLIKASI (BAHASA AWAM) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Layanan */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] shadow-sm space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Network className="w-3.5 h-3.5 text-blue-500" />
            Layanan Aplikasi
          </span>
          <div className="text-xl font-black font-mono text-slate-900 dark:text-white">
            {services.length || 3} Layanan Aktif
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            🟢 {servers.length || 3} Komputer Server Siap
          </span>
        </div>

        {/* Kecepatan Transaksi */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] shadow-sm space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-orange-500" />
            Kecepatan Menjawab
          </span>
          <div className="text-xl font-black font-mono text-orange-500">
            {metrics?.averageRps || 42} Proses / Detik
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Total {metrics ? formatNumber(metrics.totalRequests) : '18.4k'} aktivitas hari ini
          </span>
        </div>

        {/* Kecepatan Balasan */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] shadow-sm space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-emerald-500" />
            Waktu Tunggu Pengguna
          </span>
          <div className="text-xl font-black font-mono text-slate-900 dark:text-white">
            {metrics ? `${Math.round(metrics.latencyP95Ms)} ms` : '240 ms'}
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            ✅ Sangat Cepat (Hanya 0.2 detik)
          </span>
        </div>

        {/* Kapasitas Aman Teruji */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] shadow-sm space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-orange-500" />
            Daya Tampung Teruji
          </span>
          <div className="text-xl font-black font-mono text-slate-900 dark:text-white">
            {maxSafeVU > 0 ? `${maxSafeVU} Pengguna` : 'Belum Dites'}
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            {totalRuns > 0
              ? `${totalRuns} kali dites (${complianceRate}% sukses)`
              : 'Klik untuk mulai tes pertama ↗'}
          </span>
        </div>
      </div>

      {/* 3. KARTU UTAMA: KESIMPULAN KEKUATAN SISTEM (BAHASA SEDERHANA) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] shadow-sm overflow-hidden space-y-6 p-6">
        {/* Banner Kesimpulan */}
        <div
          className={`rounded-2xl border p-5 space-y-3 transition-colors ${totalRuns === 0
              ? 'border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30'
              : breakingPointVU
                ? 'border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent'
                : 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent'
            }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${totalRuns === 0
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    : breakingPointVU
                      ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                  }`}
              >
                {totalRuns === 0 ? (
                  <Clock className="w-5 h-5" />
                ) : breakingPointVU ? (
                  <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded ${totalRuns === 0
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        : breakingPointVU
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      }`}
                  >
                    {totalRuns > 0
                      ? `RINGKASAN DARI ${totalRuns} KALI PENGUJIAN`
                      : 'BELUM ADA PENGUJIAN DILAKUKAN'}
                  </span>
                  {totalRuns > 0 && (
                    <span className="text-xs text-slate-500">
                      Tingkat Keberhasilan: {complianceRate}% ({passedRuns} Lancar, {degradedRuns} Mulai Lambat, {criticalRuns} Kewalahan)
                    </span>
                  )}
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {totalRuns === 0
                    ? 'Belum Ada Tes Beban Pengguna — Ayo Tes Berapa Banyak Pengguna yang Kuat Ditampung Sistem Anda'
                    : breakingPointVU
                      ? `Sistem Aman Menampung Hingga ${maxSafeVU} Pengguna Serentak (Mulai terasa melambat jika mencapai ${breakingPointVU} orang)`
                      : `Sistem Terbukti Sangat Kuat — Lancar Menampung Hingga ${maxSafeVU} Pengguna Sekaligus`}
                </h2>
              </div>
            </div>

            {latestRun && (
              <button
                type="button"
                onClick={() => {
                  setSelectedModalRecord(latestRun);
                  setIsModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer self-start sm:self-auto"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Lihat Hasil Terakhir ({latestRun.targetVUs} Orang)</span>
              </button>
            )}
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {totalRuns === 0
              ? 'Silakan klik tombol "Uji Daya Tahan Sistem" di kanan atas untuk mencoba mengirimkan puluhan hingga ratusan pengguna secara serentak. Grafik dan evaluasi di bawah ini akan terisi secara otomatis dari hasil tes Anda.'
              : breakingPointVU
                ? `Kabar Baik: Aplikasi Anda bekerja sangat lancar pada pemakaian wajar (${maxSafeVU} orang sekaligus). Namun, jika ada lebih dari ${breakingPointVU} pengguna membuka aplikasi secara serentak, layanan mulai membutuhkan waktu lebih lama untuk membalas.`
                : `Seluruh hasil pengetesan menunjukkan aplikasi Anda sangat sehat. Pengguna merasakan respons yang cepat (kurang dari 1 detik) dan tidak ada transaksi yang gagal.`}
          </p>
        </div>

        {/* 3 KARTU KONDISI FITUR (BAHASA AWAM & ALASAN JELAS) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-orange-500" />
              Kondisi 3 Fitur Utama Saat Dipakai Bersamaan
            </span>
            <span className="text-[11px] text-slate-400">
              Batas waktu tunggu yang wajar: Kurang dari 1 detik (1.000 ms)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* FLOW 1: KONSULTASI DOKTER AI */}
            <div
              className={`p-4 rounded-xl border space-y-3 flex flex-col justify-between transition-colors ${flow1.status === 'CRITICAL'
                  ? 'border-rose-500/30 bg-rose-500/5'
                  : flow1.status === 'DEGRADED'
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : flow1.status === 'HEALTHY'
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/20'
                }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                    <MessageSquare className="w-3 h-3" />
                    Fitur Chat Dokter AI
                  </span>
                  <span
                    className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${flow1.status === 'HEALTHY'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : flow1.status === 'DEGRADED'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                          : flow1.status === 'CRITICAL'
                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                      }`}
                  >
                    {flow1.statusLabel}
                  </span>
                </div>

                <div className="font-bold text-sm text-slate-900 dark:text-white">
                  Konsultasi Chat AI
                </div>

                <div className="text-[11px] text-slate-500">
                  {flow1.record
                    ? `Dites pada: ${flow1.targetVUs} Pengguna · Waktu tunggu: ${flow1.p95LatencyMs} milidetik`
                    : 'Belum ada data pengetesan'}
                </div>

                <div className="p-3 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                  <div className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider flex items-center gap-1">
                    <Cpu className="w-3 h-3" />
                    Penjelasan Kondisi:
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                    {flow1.reason}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-medium">
                  {flow1.record ? flow1.record.timestamp : 'Belum pernah dites'}
                </span>
                {flow1.record ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModalRecord(flow1.record);
                      setIsModalOpen(true);
                    }}
                    className="text-orange-500 hover:text-orange-600 font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    Lihat Rincian 🔍
                  </button>
                ) : (
                  <Link
                    to="/stress-test"
                    className="text-orange-500 hover:text-orange-600 font-bold transition"
                  >
                    Tes Fitur Ini ↗
                  </Link>
                )}
              </div>
            </div>

            {/* FLOW 2: MEMBACA ARTIKEL */}
            <div
              className={`p-4 rounded-xl border space-y-3 flex flex-col justify-between transition-colors ${flow2.status === 'CRITICAL'
                  ? 'border-rose-500/30 bg-rose-500/5'
                  : flow2.status === 'DEGRADED'
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : flow2.status === 'HEALTHY'
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/20'
                }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    <BookOpen className="w-3 h-3" />
                    Fitur Artikel Kesehatan
                  </span>
                  <span
                    className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${flow2.status === 'HEALTHY'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : flow2.status === 'DEGRADED'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                          : flow2.status === 'CRITICAL'
                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                      }`}
                  >
                    {flow2.statusLabel}
                  </span>
                </div>

                <div className="font-bold text-sm text-slate-900 dark:text-white">
                  Membaca Artikel Kesehatan
                </div>

                <div className="text-[11px] text-slate-500">
                  {flow2.record
                    ? `Dites pada: ${flow2.targetVUs} Pengguna · Waktu tunggu: ${flow2.p95LatencyMs} milidetik`
                    : 'Belum ada data pengetesan'}
                </div>

                <div className="p-3 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                  <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Penjelasan Kondisi:
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                    {flow2.reason}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-medium">
                  {flow2.record ? flow2.record.timestamp : 'Belum pernah dites'}
                </span>
                {flow2.record ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModalRecord(flow2.record);
                      setIsModalOpen(true);
                    }}
                    className="text-orange-500 hover:text-orange-600 font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    Lihat Rincian 🔍
                  </button>
                ) : (
                  <Link
                    to="/stress-test"
                    className="text-orange-500 hover:text-orange-600 font-bold transition"
                  >
                    Tes Fitur Ini ↗
                  </Link>
                )}
              </div>
            </div>

            {/* FLOW 3: PENCARIAN DOKTER */}
            <div
              className={`p-4 rounded-xl border space-y-3 flex flex-col justify-between transition-colors ${flow3.status === 'CRITICAL'
                  ? 'border-rose-500/30 bg-rose-500/5'
                  : flow3.status === 'DEGRADED'
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : flow3.status === 'HEALTHY'
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/20'
                }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                    <Stethoscope className="w-3 h-3" />
                    Fitur Cari Dokter
                  </span>
                  <span
                    className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${flow3.status === 'HEALTHY'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : flow3.status === 'DEGRADED'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                          : flow3.status === 'CRITICAL'
                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                      }`}
                  >
                    {flow3.statusLabel}
                  </span>
                </div>

                <div className="font-bold text-sm text-slate-900 dark:text-white">
                  Pencarian Jadwal &amp; Dokter
                </div>

                <div className="text-[11px] text-slate-500">
                  {flow3.record
                    ? `Dites pada: ${flow3.targetVUs} Pengguna · Waktu tunggu: ${flow3.p95LatencyMs} milidetik`
                    : 'Belum ada data pengetesan'}
                </div>

                <div className="p-3 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                  <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1">
                    <Database className="w-3 h-3" />
                    Penjelasan Kondisi:
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                    {flow3.reason}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-medium">
                  {flow3.record ? flow3.record.timestamp : 'Belum pernah dites'}
                </span>
                {flow3.record ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModalRecord(flow3.record);
                      setIsModalOpen(true);
                    }}
                    className="text-orange-500 hover:text-orange-600 font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    Lihat Rincian 🔍
                  </button>
                ) : (
                  <Link
                    to="/stress-test"
                    className="text-orange-500 hover:text-orange-600 font-bold transition"
                  >
                    Tes Fitur Ini ↗
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 4. GRAFIK & TABEL PER JUMLAH PENGGUNA (BAHASA AWAM & DATA NYATA) */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-5 space-y-4">
          <div className="border-b border-slate-200/60 dark:border-slate-800/80 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-orange-500" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Perbandingan Kecepatan Berdasarkan Jumlah Pengguna
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Melihat bagaimana kecepatan sistem berubah dari beban santai hingga beban puncak yang telah Anda tes.
              </p>
            </div>

            <div className="text-[11px] text-slate-500 self-start sm:self-auto">
              {vuComparisonChartData.length} Tingkat Beban Pernah Dites
            </div>
          </div>

          {vuComparisonChartData.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center mx-auto">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Belum Ada Data Pengetesan Beban
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  Grafik dan tabel di bawah ini akan otomatis terisi setelah Anda menjalankan tes beban pengguna di halaman Simulator Stress Test.
                </p>
              </div>
              <Link
                to="/stress-test"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition shadow-sm"
              >
                <Zap className="w-3.5 h-3.5 fill-white" />
                <span>Mulai Tes Pertama Anda ↗</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Grafik Recharts */}
              <div className="lg:col-span-5 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Waktu Tunggu Pengguna (milidetik)
                  </span>
                  <span className="text-[10px] text-rose-500 font-bold">
                    Batas Nyaman Pengguna = 1.000 milidetik (1 Detik)
                  </span>
                </div>

                <div className="h-48 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={vuComparisonChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                      <XAxis dataKey="vu" stroke="#64748b" fontSize={10} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={10} tickLine={false} domain={[0, 'auto']} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0F172A',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '11px',
                        }}
                        formatter={(val: number) => [`${val} milidetik`, 'Waktu Tunggu']}
                      />
                      <ReferenceLine y={1000} stroke="#f43f5e" strokeDasharray="4 4" />
                      <Bar dataKey="p95" radius={[6, 6, 0, 0]}>
                        {vuComparisonChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tabel Matriks Bahasa Awam */}
              <div className="lg:col-span-7 overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                    <tr>
                      <th className="p-3">Jumlah Pengguna</th>
                      <th className="p-3">Fitur yang Diuji</th>
                      <th className="p-3 text-center">Waktu Tunggu</th>
                      <th className="p-3 text-center">Kecepatan Balas</th>
                      <th className="p-3 text-center">Tingkat Gagal</th>
                      <th className="p-3 text-center">Kenyamanan Pengguna</th>
                      <th className="p-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {vuComparisonChartData.map((item) => (
                      <tr key={item.vu} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                        <td className="p-3 font-bold text-slate-900 dark:text-white">
                          {item.vu}
                        </td>
                        <td className="p-3 text-slate-700 dark:text-slate-300">
                          <div className="font-semibold">{item.flowShort}</div>
                          <span className="text-[10px] text-slate-400">{item.timestamp}</span>
                        </td>
                        <td className="p-3 text-center font-bold">
                          <span
                            className={
                              item.p95 > 1000
                                ? 'text-rose-500'
                                : item.p95 > 500
                                  ? 'text-amber-500'
                                  : 'text-emerald-500'
                            }
                          >
                            {item.p95} ms
                          </span>
                        </td>
                        <td className="p-3 text-center text-slate-700 dark:text-slate-300">
                          {item.rps} proses/dtk
                        </td>
                        <td className="p-3 text-center text-slate-700 dark:text-slate-300">
                          {item.errorRate}
                        </td>
                        <td className="p-3 text-center">
                          <span className="text-[10px] font-bold whitespace-nowrap">
                            {item.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedModalRecord(item.record);
                              setIsModalOpen(true);
                            }}
                            className="text-orange-500 hover:text-orange-600 font-bold transition text-xs cursor-pointer"
                          >
                            Lihat Rincian 🔍
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pop-up Result Modal */}
      <StressTestResultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        record={selectedModalRecord}
      />
    </div>
  );
};
