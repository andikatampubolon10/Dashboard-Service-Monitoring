import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  ShieldCheck,
  Zap,
  ChevronDown,
  ChevronUp,
  Activity,
  ArrowRight,
  Gauge,
} from 'lucide-react';
import { Project, ProjectAiInsight } from '../../types';
import { ProjectService } from '../../services/projectService';

interface ProjectAiInsightCardProps {
  project: Project;
}

export const ProjectAiInsightCard: React.FC<ProjectAiInsightCardProps> = ({ project }) => {
  const [insight, setInsight] = useState<ProjectAiInsight | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const fetchInsight = async (force = false) => {
    if (force) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const data = await ProjectService.getProjectAiInsight(project.id, force);
      if (data) {
        setInsight(data);
      }
    } catch (err) {
      console.error('Failed to load project AI insight:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInsight(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const getVerdictBadge = (verdict?: string) => {
    switch (verdict) {
      case 'OPTIMAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            OPTIMAL
          </span>
        );
      case 'ATTENTION':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5" />
            PERLU PERHATIAN
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
            <AlertOctagon className="w-3.5 h-3.5" />
            DEGRADASI
          </span>
        );
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 animate-pulse">
            <AlertOctagon className="w-3.5 h-3.5" />
            KRITIS
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/10 text-slate-500 border border-slate-500/20">
            STANDBY
          </span>
        );
    }
  };

  const getPriorityBadge = (priority: 'HIGH' | 'MEDIUM' | 'LOW') => {
    switch (priority) {
      case 'HIGH':
        return (
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
            PRIORITAS TINGGI
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            PRIORITAS MENENGAH
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            OPTIMASI RUTIN
          </span>
        );
    }
  };

  const getCategoryBadge = (category: string) => {
    return (
      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
        {category}
      </span>
    );
  };

  const getAnomalyIcon = (severity: 'CRITICAL' | 'WARNING' | 'INFO') => {
    switch (severity) {
      case 'CRITICAL':
        return <AlertOctagon className="w-4 h-4 text-rose-500 shrink-0" />;
      case 'WARNING':
        return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-blue-500 shrink-0" />;
    }
  };

  if (isLoading && !insight) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-5 shadow-sm space-y-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-6 w-52 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          <div className="h-6 w-28 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        </div>
        <div className="h-14 bg-slate-100 dark:bg-slate-800/60 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="h-28 bg-slate-100 dark:bg-slate-800/40 rounded-xl" />
          <div className="h-28 bg-slate-100 dark:bg-slate-800/40 rounded-xl" />
          <div className="h-28 bg-slate-100 dark:bg-slate-800/40 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!insight) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#0B0F19] shadow-sm overflow-hidden transition-all duration-300">
      {/* 1. TOP HEADER & MODEL STATUS BAR */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                AI INFRASTRUCTURE INTELLIGENCE HUB
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {insight.isAiGenerated ? (
                  <span className="text-emerald-500 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {insight.source || 'Gemini 2.5 Flash Active'}
                  </span>
                ) : (
                  <span className="text-amber-500 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    SRE Heuristic Engine
                  </span>
                )}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight mt-0.5 flex items-center gap-2">
              <span>Evaluasi &amp; Wawasan Infrastruktur — Projek {project.name}</span>
            </h2>
          </div>
        </div>

        {/* Action Controls: Refresh & Collapse/Expand */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => fetchInsight(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition cursor-pointer disabled:opacity-60"
            title="Analisis ulang seluruh host dan microservice projek menggunakan Gemini AI"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-500' : 'text-slate-500'}`} />
            <span>{isRefreshing ? 'Menganalisis...' : 'Analisis Ulang AI ↺'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title={isCollapsed ? 'Buka detail insight' : 'Sembunyikan detail insight'}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 2. EXECUTIVE HEADLINE & HEALTH SCORE BANNER */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-50/50 via-white to-slate-50/30 dark:from-[#0f172a]/40 dark:via-[#0B0F19] dark:to-[#0f172a]/20 border-b border-slate-100 dark:border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-3xl">
          <div className="flex items-center gap-2.5">
            {getVerdictBadge(insight.verdict)}
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">
              {insight.headline}
            </h3>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {insight.summary}
          </p>
        </div>

        {/* Health Score Ring Badge */}
        <div className="flex items-center gap-3 shrink-0 self-start md:self-auto bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 px-4 py-2.5 rounded-2xl shadow-2xs">
          <div className="text-right">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Fleet Health Score
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white">
              {insight.healthScore}
              <span className="text-xs text-slate-400 font-normal">/100</span>
            </span>
          </div>
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
              insight.healthScore >= 90
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                : insight.healthScore >= 70
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
            }`}
          >
            {insight.healthScore >= 90 ? 'A+' : insight.healthScore >= 70 ? 'B' : 'C'}
          </div>
        </div>
      </div>

      {/* COLLAPSIBLE DETAILS (3 PILLARS & SRE RUNBOOK) */}
      {!isCollapsed && (
        <div className="p-4 sm:p-5 space-y-5">
          {/* 3. THREE CORE PILLARS GRID (Datadog Watchdog & Dynatrace Davis Aligned) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Pillar 1: SLA & Availability Health */}
            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-indigo-500" />
                  SLA &amp; Ketersediaan
                </span>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                    insight.slaAssessment.riskLevel === 'RENDAH'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : insight.slaAssessment.riskLevel === 'SEDANG'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                  }`}
                >
                  RISIKO {insight.slaAssessment.riskLevel}
                </span>
              </div>
              <div className="text-2xl font-black font-mono text-slate-900 dark:text-white">
                {insight.slaAssessment.availabilityScore}%
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {insight.slaAssessment.verdictText}
              </p>
            </div>

            {/* Pillar 2: Saturation & Capacity Headroom */}
            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-orange-500" />
                  Kejenuhan (Saturation)
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 font-mono">
                  {insight.saturationAnalysis.limitingResource}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Host Terberat (Peak Node):</span>
                <span className="text-sm font-black font-mono text-slate-900 dark:text-white truncate block">
                  {insight.saturationAnalysis.highestPressureNode}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {insight.saturationAnalysis.imbalanceNote}
              </p>
            </div>

            {/* Pillar 3: Active Anomalies & Outliers */}
            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-purple-500" />
                  Deteksi Anomali
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                  {insight.anomalies.length} Temuan
                </span>
              </div>
              <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                {insight.anomalies.map((anom, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-[11px]">
                    {getAnomalyIcon(anom.severity)}
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">
                        {anom.title}
                      </span>
                      <span className="text-[10px] text-slate-400 block truncate">
                        {anom.component}: {anom.description}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 4. ACTIONABLE SRE RUNBOOK (DevOps Recommendations) */}
          <div className="border-t border-slate-100 dark:border-slate-800/80 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Rekomendasi Tindakan SRE &amp; Optimasi Arsitektur
                </h4>
              </div>
              <span className="text-[10px] text-slate-400">
                Langkah konkret untuk stabilitas SLA projek
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {insight.actionableRecommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 shadow-2xs space-y-2 hover:border-slate-300 dark:hover:border-slate-700 transition"
                >
                  <div className="flex items-center justify-between gap-1">
                    {getPriorityBadge(rec.priority)}
                    {getCategoryBadge(rec.category)}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                      {rec.title}
                    </h5>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      {rec.action}
                    </p>
                  </div>
                  <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/60 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <ArrowRight className="w-3 h-3 shrink-0" />
                    <span>Dampak: {rec.impact}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
