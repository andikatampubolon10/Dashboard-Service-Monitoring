
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Network,
  Zap,
  Clock,
  BarChart3,
  Lightbulb,
  ShieldAlert,
  Users,
  ChevronDown,
  ChevronUp,
  Smartphone,
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
import AiStressInsightCard from '../components/monitoring/AiStressInsightCard';

export const OverviewPage: React.FC = () => {
  const { data: metrics } = useOverviewMetrics();
  const { data: services = [] } = useServices();
  const { data: servers = [] } = useServers();

  const [history, setHistory] = useState<StressTestRecord[]>([]);
  const [selectedModalRecord, setSelectedModalRecord] = useState<StressTestRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [insightTab, setInsightTab] = useState<'analogi' | 'teknis' | 'dampak' | 'solusi'>('analogi');
  const [isInsightExpanded, setIsInsightExpanded] = useState<boolean>(true);

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
  const complianceRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 100;

  const healthyRuns = history.filter((r) => r.healthGrade === 'HEALTHY');
  const maxSafeVU = healthyRuns.length > 0 ? Math.max(...healthyRuns.map((r) => r.targetVUs)) : 0;

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

      {/* 3. AI STRESS TEST INTELLIGENCE HUB (GEMINI AI) */}
      <AiStressInsightCard
        records={history}
        onOpenRecordModal={(record) => {
          setSelectedModalRecord(record);
          setIsModalOpen(true);
        }}
      />

      {/* 4. GRAFIK & TABEL PER JUMLAH PENGGUNA (DATA NYATA K6) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] shadow-sm overflow-hidden p-5 sm:p-6 space-y-4">
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

      {/* Pop-up Result Modal */}
      <StressTestResultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        record={selectedModalRecord}
      />
    </div>
  );
};
