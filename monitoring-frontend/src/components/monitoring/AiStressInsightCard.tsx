import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Cpu,
  Database,
  BookOpen,
  MessageSquare,
  Stethoscope,
  Network,
  Layers,
  ArrowRight,
  Info,
} from 'lucide-react';
import { StressTestRecord } from '../../services/stressTestEngine';
import {
  fetchStressAiInsight,
  fetchAiStatus,
  StressAiInsight,
  AiStatusResponse,
} from '../../services/aiInsightService';

interface AiStressInsightCardProps {
  records: StressTestRecord[];
  onOpenRecordModal?: (record: StressTestRecord) => void;
}

export const AiStressInsightCard: React.FC<AiStressInsightCardProps> = ({
  records,
  onOpenRecordModal,
}) => {
  const [insight, setInsight] = useState<StressAiInsight | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatusResponse>({
    isConfigured: false,
    model: 'gemini-1.5-flash',
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const loadInsight = async (force = false) => {
    if (force) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const [insightRes, statusRes] = await Promise.all([
        fetchStressAiInsight(records, force),
        fetchAiStatus(),
      ]);
      if (insightRes) {
        setInsight(insightRes);
      }
      setAiStatus(statusRes);
    } catch (err) {
      console.error('Failed to load AI insight:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadInsight(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records.length]);

  const getFlowIcon = (flowId: string) => {
    switch (flowId) {
      case '1':
        return <MessageSquare className="w-4 h-4 text-rose-500" />;
      case '2':
        return <BookOpen className="w-4 h-4 text-blue-500" />;
      case '3':
        return <Stethoscope className="w-4 h-4 text-purple-500" />;
      default:
        return <Layers className="w-4 h-4 text-slate-400" />;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'HIGH':
        return (
          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
            Prioritas Tinggi
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            Prioritas Sedang
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            Optimasi Rutin
          </span>
        );
    }
  };

  const getDomainIcon = (domain: string) => {
    switch (domain) {
      case 'AI_ENGINE':
        return <Cpu className="w-3.5 h-3.5 text-rose-400" />;
      case 'DATABASE':
        return <Database className="w-3.5 h-3.5 text-purple-400" />;
      case 'CACHE':
        return <Zap className="w-3.5 h-3.5 text-amber-400" />;
      case 'NETWORK':
        return <Network className="w-3.5 h-3.5 text-cyan-400" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] shadow-sm overflow-hidden p-5 sm:p-6 space-y-6">
      {/* 1. HEADER DENGAN STATUS GEMINI AI */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-500 to-pink-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                AI INTELLIGENCE HUB
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {insight?.isAiGenerated ? (
                  <span className="text-emerald-500 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Gemini 1.5 Flash Active
                  </span>
                ) : (
                  <span className="text-amber-500 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Heuristic Engine
                  </span>
                )}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight mt-0.5">
              Evaluasi &amp; Wawasan Kinerja Sistem
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {insight && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <span>Skor Kesiapan:</span>
              <span
                className={`font-black font-mono ${
                  insight.healthScore >= 80
                    ? 'text-emerald-500'
                    : insight.healthScore >= 60
                      ? 'text-amber-500'
                      : 'text-rose-500'
                }`}
              >
                {insight.healthScore}/100
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => loadInsight(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 text-xs font-bold transition cursor-pointer disabled:opacity-50"
            title="Panggil Gemini AI untuk menganalisis ulang data k6 terbaru"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            <span>{isRefreshing ? 'Menganalisis...' : 'Perbarui AI ✨'}</span>
          </button>
        </div>
      </div>

      {/* BANNER NOTIFIKASI JIKA BELUM ADA API KEY */}
      {!aiStatus.isConfigured && !insight?.isAiGenerated && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-3 text-xs text-amber-700 dark:text-amber-300">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <div className="space-y-0.5 leading-relaxed">
            <span className="font-bold">Mode Analisis Lokal (Heuristik):</span>{' '}
            Insight di bawah ini digenerate secara lokal. Untuk mengaktifkan penalaran mendalam dan analisis rekomendasi arsitektural dinamis dari model{' '}
            <strong className="font-bold">Google Gemini 1.5 Flash</strong>, masukkan{' '}
            <code className="px-1 py-0.5 rounded bg-amber-500/20 font-mono text-[11px]">
              GEMINI_API_KEY=AIzaSy...
            </code>{' '}
            pada file <code className="font-mono">monitoring-backend/.env</code>.
          </div>
        </div>
      )}

      {/* 2. VERDICT & HEADLINE BANNER */}
      {isLoading ? (
        <div className="h-28 rounded-2xl bg-slate-100 dark:bg-slate-800/50 animate-pulse flex items-center justify-center text-xs text-slate-400">
          Menghubungi Gemini AI Engine untuk membedah data performa...
        </div>
      ) : insight ? (
        <div
          className={`rounded-2xl border p-5 space-y-2.5 transition-colors ${
            insight.verdict === 'CRITICAL'
              ? 'border-rose-500/30 bg-rose-500/5'
              : insight.verdict === 'DEGRADED'
                ? 'border-amber-500/30 bg-amber-500/5'
                : 'border-emerald-500/30 bg-emerald-500/5'
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                insight.verdict === 'CRITICAL'
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                  : insight.verdict === 'DEGRADED'
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
              }`}
            >
              {insight.verdict === 'CRITICAL' ? (
                <ShieldAlert className="w-3 h-3" />
              ) : insight.verdict === 'DEGRADED' ? (
                <AlertTriangle className="w-3 h-3" />
              ) : (
                <CheckCircle2 className="w-3 h-3" />
              )}
              {insight.verdict === 'CRITICAL'
                ? 'STATUS KRITIS — BUTUH TINDAKAN'
                : insight.verdict === 'DEGRADED'
                  ? 'KONDISI TERTEKAN — PERINGATAN'
                  : 'STATUS STABIL & SANGAT TANGGUH'}
            </span>
            <span className="text-[11px] text-slate-400">
              Analisis per {new Date(insight.analyzedAt).toLocaleTimeString()}
            </span>
          </div>

          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug">
            {insight.headline}
          </h3>

          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {insight.summary}
          </p>
        </div>
      ) : null}

      {/* 3. PERBANDINGAN PERFORMA LINTAS FITUR (FLOW COMPARISON) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-indigo-500" />
            Perbandingan Karakteristik Antar Fitur
          </span>
          <span className="text-[11px] text-slate-400">
            Perbedaan perilaku di bawah beban serentak
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {insight?.flowComparison && insight.flowComparison.length > 0 ? (
            insight.flowComparison.map((flow) => {
              const matchedRecord = records.find(
                (r) => String(r.selectedFlow || (r as unknown as { flow?: string }).flow) === String(flow.flowId)
              );

              return (
                <div
                  key={flow.flowId}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {getFlowIcon(flow.flowId)}
                        <span className="font-bold text-xs text-slate-900 dark:text-white">
                          Flow {flow.flowId}: {flow.flowName}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${
                          flow.status === 'HEALTHY'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                            : flow.status === 'DEGRADED'
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                              : flow.status === 'CRITICAL'
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {flow.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-medium">
                        Kategori Beban:
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {flow.performanceCategory}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-medium">
                        Latensi P95 Teruji:
                      </span>
                      <span
                        className={`font-mono font-bold ${
                          flow.p95LatencyMs > 1000
                            ? 'text-rose-500'
                            : flow.p95LatencyMs > 500
                              ? 'text-amber-500'
                              : flow.p95LatencyMs > 0
                                ? 'text-emerald-500'
                                : 'text-slate-400'
                        }`}
                      >
                        {flow.p95LatencyMs > 0
                          ? `${flow.p95LatencyMs} ms`
                          : 'Belum Dites'}
                      </span>
                    </div>

                    {/* Catatan Komparatif */}
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      {flow.comparisonNote}
                    </div>
                  </div>

                  {matchedRecord && onOpenRecordModal && (
                    <button
                      type="button"
                      onClick={() => onOpenRecordModal(matchedRecord)}
                      className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80 text-[11px] font-bold text-indigo-500 hover:text-indigo-600 flex items-center justify-between cursor-pointer"
                    >
                      <span>Lihat Riwayat Mentah k6</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="col-span-3 text-center py-6 text-xs text-slate-400 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl">
              Menunggu data uji k6 untuk membandingkan performa ketiga alur layanan.
            </div>
          )}
        </div>
      </div>

      {/* 4. BATAS KAPASITAS SISTEM & LEHER BOTOL (CAPACITY CEILING) */}
      {insight?.capacityCeiling && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Kapasitas Aman Teruji (Max Safe VU)
            </span>
            <div className="text-xl font-black font-mono text-slate-900 dark:text-white">
              {insight.capacityCeiling.maxSafeVU > 0
                ? `${insight.capacityCeiling.maxSafeVU} Pengguna Serentak`
                : 'Belum Terkalibrasi'}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Taraf konkurensi di mana seluruh SLA latency &lt; 1s dan 0% error terpenuhi sempurna.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Titik Melambat / Gagal (Breaking Point)
            </span>
            <div className="text-xl font-black font-mono text-rose-500">
              {insight.capacityCeiling.breakingPointVU
                ? `${insight.capacityCeiling.breakingPointVU} Pengguna Serentak`
                : 'Belum Mencapai Titik Jenuh'}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {insight.capacityCeiling.breakingPointVU
                ? 'Titik di mana respon server mulai melambat tajam atau timbul kegagalan request.'
                : 'Sistem belum menunjukkan tanda-tanda jenuh pada beban pengujian saat ini.'}
            </p>
          </div>

          <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              Faktor Pembatas (Limiting Bottleneck)
            </span>
            <div className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2">
              {insight.capacityCeiling.limitingFactor || 'Antrean HTTP & Koneksi DB'}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Komponen utama yang paling cepat mencapai ambang batas saat volume request dinaikkan.
            </p>
          </div>
        </div>
      )}

      {/* 5. REKOMENDASI TINDAKAN TEKNIS (ACTIONABLE RECOMMENDATIONS) */}
      {insight?.actionableRecommendations &&
        insight.actionableRecommendations.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-500" />
                Rekomendasi Arsitektural AI untuk Tim Engineering
              </span>
              <span className="text-[11px] text-slate-400">
                Solusi prioritas untuk meningkatkan skalabilitas
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {insight.actionableRecommendations.map((rec, index) => (
                <div
                  key={index}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-2 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        {getDomainIcon(rec.domain)}
                      </div>
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        {rec.title}
                      </span>
                    </div>
                    {getPriorityBadge(rec.priority)}
                  </div>

                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    {rec.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
};

export default AiStressInsightCard;
