import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  X,
  Copy,
  Check,
  Terminal,
  Clock,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Cpu,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { monitoringApi } from '../../services/monitoringApi';
import { AiIncidentTipsData, AiIncidentTipsPayload } from '../../types';

interface AiIncidentTipsModalProps {
  isOpen: boolean;
  onClose: () => void;
  incident: {
    id: string;
    type: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    title: string;
    targetName: string;
    targetId: string;
    linkTo: string;
    metricBadge: string;
    description: string;
    recommendation: string;
  } | null;
}

export const AiIncidentTipsModal: React.FC<AiIncidentTipsModalProps> = ({
  isOpen,
  onClose,
  incident,
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AiIncidentTipsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    if (!isOpen || !incident) {
      setData(null);
      setError(null);
      return;
    }

    let isMounted = true;
    const fetchTips = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload: AiIncidentTipsPayload = {
          issueType: incident.type,
          severity: incident.severity,
          title: incident.title,
          targetName: incident.targetName,
          targetId: incident.targetId,
          metricBadge: incident.metricBadge,
          description: incident.description,
          staticRecommendation: incident.recommendation,
        };

        const result = await monitoringApi.getIncidentAiTips(payload);
        if (isMounted) {
          setData(result);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Gagal memuat rekomendasi tips AI.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchTips();

    return () => {
      isMounted = false;
    };
  }, [isOpen, incident]);

  if (!isOpen || !incident) return null;

  const handleCopyCommand = (command: string, stepIndex: number) => {
    navigator.clipboard.writeText(command);
    setCopiedStep(stepIndex);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  const handleCopyAllCommands = () => {
    if (!data?.steps) return;
    const allCmds = data.steps
      .filter((s) => s.command)
      .map((s) => `# Langkah ${s.step}: ${s.title}\n${s.command}`)
      .join('\n\n');

    navigator.clipboard.writeText(allCmds);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const isCrit = incident.severity === 'CRITICAL';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div
        className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl bg-slate-900 border border-indigo-500/30 dark:border-indigo-500/40 shadow-2xl overflow-hidden font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Glowing AI Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-pulse" />

        {/* Modal Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-slate-800 flex items-start justify-between gap-4 bg-slate-950/60">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/30 text-indigo-400 shrink-0">
              <Sparkles className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  Tips Penanganan AI (Gemini SRE)
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-indigo-400" />
                  Live Diagnostics
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Panduan pemecahan masalah taktis dan perintah CLI bertahap untuk memulihkan layanan.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Incident Summary Context Strip */}
        <div className="px-5 sm:px-6 py-3 bg-slate-950/40 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400">Target Insiden:</span>
            <span className="text-white font-bold">{incident.targetName}</span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${
                isCrit
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
            >
              {incident.severity}
            </span>
            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
              {incident.metricBadge}
            </span>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 custom-scrollbar">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin" />
                <Sparkles className="w-6 h-6 text-indigo-400 absolute inset-0 m-auto animate-pulse" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-white">
                  Gemini AI sedang menganalisis akar masalah...
                </p>
                <p className="text-xs text-slate-400 max-w-md">
                  Meninjau telemetri port, utilisasi host, dan menyusun perintah pemulihan CLI yang tepat untuk {incident.targetName}.
                </p>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-rose-200">Gagal Memuat Analisis AI</h4>
                  <p className="text-xs text-rose-300/80 mt-0.5">{error}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  monitoringApi
                    .getIncidentAiTips({
                      issueType: incident.type,
                      severity: incident.severity,
                      title: incident.title,
                      targetName: incident.targetName,
                      targetId: incident.targetId,
                      metricBadge: incident.metricBadge,
                      description: incident.description,
                      staticRecommendation: incident.recommendation,
                    })
                    .then(setData)
                    .catch((e) => setError(e?.message))
                    .finally(() => setLoading(false));
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold transition flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Coba Lagi</span>
              </button>
            </div>
          )}

          {data && !loading && (
            <div className="space-y-5 animate-fadeIn">
              {/* Meta & Engine info */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 bg-indigo-950/20 border border-indigo-500/20 rounded-2xl p-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>
                    Model: <strong className="text-indigo-300">{data.source}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Estimasi Penanganan: ~{data.estimatedFixTimeMinutes || 5} menit</span>
                </div>
              </div>

              {/* 1. Root Cause Analysis */}
              <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-4 space-y-2">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Analisis Akar Masalah (Root Cause)</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans">
                  {data.rootCause}
                </p>
              </div>

              {/* 2. Step-by-Step Resolution Steps */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-slate-200 font-bold text-xs uppercase tracking-wider">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    <span>Langkah Penanganan Bertahap &amp; Perintah CLI</span>
                  </div>
                  {data.steps.some((s) => s.command) && (
                    <button
                      type="button"
                      onClick={handleCopyAllCommands}
                      className="px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 text-[11px] font-bold transition flex items-center gap-1.5"
                    >
                      {copiedAll ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300">Semua Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Semua Perintah</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {data.steps.map((step, idx) => (
                    <div
                      key={step.step || idx}
                      className="rounded-2xl bg-slate-950/70 border border-slate-800 p-4 space-y-2.5 transition hover:border-slate-700"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-bold flex items-center justify-center shrink-0">
                            {step.step || idx + 1}
                          </span>
                          <h4 className="text-xs sm:text-sm font-bold text-white">
                            {step.title}
                          </h4>
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 font-sans leading-relaxed pl-8">
                        {step.description}
                      </p>

                      {step.command && (
                        <div className="pl-8">
                          <div className="relative group rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/50 border-b border-slate-800 text-[10px] text-slate-400">
                              <span>Terminal Command (Bash)</span>
                              <button
                                type="button"
                                onClick={() => handleCopyCommand(step.command!, step.step || idx)}
                                className="flex items-center gap-1 text-indigo-300 hover:text-white transition font-bold"
                              >
                                {copiedStep === (step.step || idx) ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span className="text-emerald-400">Tersalin!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Salin</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <pre className="p-3 text-xs text-emerald-400 overflow-x-auto selection:bg-indigo-500/40">
                              <code>$ {step.command}</code>
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Preventive Best Practice */}
              {data.preventive && (
                <div className="rounded-2xl bg-emerald-950/15 border border-emerald-500/30 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Tindakan Pencegahan Jangka Panjang</span>
                  </div>
                  <p className="text-xs text-slate-300 font-sans leading-relaxed">
                    {data.preventive}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            Tutup
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              navigate(incident.linkTo);
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-md ${
              isCrit
                ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
            }`}
          >
            <span>Tangani Masalah Langsung</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
