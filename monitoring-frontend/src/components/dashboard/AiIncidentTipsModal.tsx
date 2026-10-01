import React, { useEffect, useState, useMemo } from 'react';
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
  Bot,
  Download,
  Wand2,
  CheckCheck,
  MessageSquare,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { monitoringApi } from '../../services/monitoringApi';
import { AiIncidentTipsData, AiIncidentTipsPayload } from '../../types';

export type AgentPromptPreset = 'universal' | 'cursor' | 'chatgpt';

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
  initialTab?: 'guide' | 'prompt';
}

/**
 * Builds a structured, high-context prompt for external AI Agents
 * (e.g. Cursor, Antigravity, Claude Code, ChatGPT, Claude, Devin)
 */
export function buildAgentPrompt({
  incident,
  data,
  preset = 'universal',
  customNote = '',
}: {
  incident: {
    id: string;
    type: string;
    severity: string;
    title: string;
    targetName: string;
    targetId: string;
    linkTo: string;
    metricBadge: string;
    description: string;
    recommendation: string;
  };
  data: AiIncidentTipsData | null;
  preset: AgentPromptPreset;
  customNote?: string;
}): string {
  const steps = data?.steps && data.steps.length > 0 ? data.steps : [];
  const rootCause = data?.rootCause || incident.description || 'Layanan tidak merespon health check probe.';
  const preventive = data?.preventive || incident.recommendation || 'Terapkan healthcheck otomatis dan batasan resource kontainer.';
  const fixTime = data?.estimatedFixTimeMinutes ? `~${data.estimatedFixTimeMinutes} menit` : '~5 menit';
  const modelSource = data?.source || 'SRE Telemetry Engine';
  const dateStr = data?.analyzedAt ? new Date(data.analyzedAt).toLocaleString('id-ID') : new Date().toLocaleString('id-ID');

  const stepsMarkdown = steps.length > 0
    ? steps.map((s) => {
        let stepBlock = `### Langkah ${s.step || 1}: ${s.title}\n- **Tujuan:** ${s.description}`;
        if (s.command) {
          stepBlock += `\n\`\`\`bash\n${s.command}\n\`\`\``;
        }
        return stepBlock;
      }).join('\n\n')
    : `### Langkah 1: Investigasi Status Kontainer & Jaringan\n\`\`\`bash\ndocker ps -a | grep -i "${incident.targetName.slice(0, 15)}"\ndocker logs --tail 100 <CONTAINER_ID>\n\`\`\``;

  const noteSection = customNote.trim()
    ? `\n\n## 📝 Catatan Tambahan Operator:\n> ${customNote.trim()}\n`
    : '';

  if (preset === 'cursor') {
    return `# 🚨 SRE TASK: Remediasi Insiden ${incident.targetName} (${incident.severity})

Anda adalah Agent DevOps/SRE otomatis dengan kapabilitas eksekusi terminal (Cursor / Antigravity / Claude Code / Devin).
Tugas Anda adalah mendiagnosis dan memulihkan insiden infrastruktur berikut hingga layanan kembali UP dan berstatus HEALTHY.

---
## 📌 DATA INSIDEN & TELEMETRI
- **Target:** \`${incident.targetName}\` (ID: \`${incident.targetId}\`)
- **Tingkat Keparahan:** **${incident.severity}**
- **Indikator Metrik:** \`${incident.metricBadge}\`
- **Waktu Terdeteksi:** ${dateStr}
- **Deskripsi Masalah:** ${incident.description}
- **Akar Masalah (Diagnostik ObservePulse):** ${rootCause}
- **Estimasi Penanganan:** ${fixTime} (Engine: ${modelSource})
${noteSection}
---
## 💻 URUTAN PERINTAH EKSEKUSI TERMINAL
Eksekusi baris perintah berikut satu per satu. Periksa output setiap perintah sebelum melangkah ke perintah berikutnya:

${stepsMarkdown}

---
## 🛡️ TINDAKAN PENCEGAHAN
${preventive}

---
## 🎯 INSTRUKSI PENYELESAIAN
1. Jalankan perintah diagnostik awal untuk mengonfirmasi status aktual kontainer atau host.
2. Jika kontainer crash atau exit, periksa 50 baris terakhir log dengan \`docker logs\` untuk menemukan error fatal (unhandled exception, DB connection refused, port collision EADDRINUSE).
3. Jika konfigurasi atau environment variable perlu diperbaiki, sesuaikan file konfigurasi atau restart kontainer.
4. Uji endpoint healthcheck menggunakan \`curl\` untuk memastikan layanan merespon HTTP 200 OK.
5. Laporkan ringkasan pemulihan beserta status akhir layanan kepada pengguna.`.trim();
  }

  if (preset === 'chatgpt') {
    return `Anda adalah seorang Principal Site Reliability Engineer (SRE), Linux System Architect, dan spesialis Container & Microservices.

Saya memerlukan bantuan Anda untuk memecahkan insiden produksi berikut yang terdeteksi oleh sistem monitoring ObservePulse:

============================================================
INFORMASI INSIDEN:
- Nama Komponen / Target: ${incident.targetName}
- Kategori Masalah: ${incident.type}
- Tingkat Keparahan (Severity): ${incident.severity}
- Metrik / Status Terpantau: ${incident.metricBadge}
- Gejala & Observasi Awal: ${incident.description}
- Rekomendasi Awal: ${incident.recommendation}
============================================================

DIAGNOSIS AKAR MASALAH (ROOT CAUSE TELEMETRI):
${rootCause}

LANGKAH TROUBLESHOOTING & PERINTAH TERMINAL YANG DIREKOMENDASIKAN:
${stepsMarkdown}

SARAN PENCEGAHAN JANGKA PANJANG:
${preventive}
${noteSection}
MOHON BANTUAN ANDA UNTUK:
1. Menganalisis skenario kegagalan: mengapa error atau kondisi ini dapat terjadi pada microservice/server di atas?
2. Menjelaskan secara rinci apakah perintah CLI di atas aman untuk dijalankan di lingkungan production dan apa efek sampingnya.
3. Memberikan rekomendasi perbaikan kode atau konfigurasi (seperti docker-compose.yml, batas memori OOM, restart policy, atau database connection pool).
4. Panduan step-by-step jika perintah di atas masih belum menyelesaikan masalah.`.trim();
  }

  // Universal SRE Prompt (Default)
  return `# 🚨 [ObservePulse SRE Incident] ${incident.targetName} - ${incident.severity}

## 📌 Ringkasan Masalah
- **Komponen Target:** \`${incident.targetName}\` (ID: \`${incident.targetId}\`)
- **Tingkat Keparahan:** **${incident.severity}**
- **Indikator Metrik:** \`${incident.metricBadge}\`
- **Waktu Deteksi:** ${dateStr}
- **Deskripsi Gejala:** ${incident.description}

## 🔍 Analisis Akar Masalah (Root Cause)
> ${rootCause}

## 🛠️ Langkah Penanganan Bertahap & Perintah CLI
${stepsMarkdown}

## 🛡️ Rekomendasi Pencegahan Jangka Panjang
${preventive}
${noteSection}
---
## 🤖 Prompt Tugas untuk AI Agent
"Halo AI Assistant / Agent, bertindaklah sebagai Senior SRE & DevOps Engineer. Bantu saya menyelesaikan insiden pada \`${incident.targetName}\` di atas. Tinjau langkah perbaikan dan perintah CLI yang telah disiapkan, bantu saya menginterpretasikan respon log terminal, dan pastikan layanan berhasil dipulihkan hingga normal. Beritahu saya jika ada langkah keselamatan yang perlu diperhatikan sebelum mengeksekusi perintah."`.trim();
}

export const AiIncidentTipsModal: React.FC<AiIncidentTipsModalProps> = ({
  isOpen,
  onClose,
  incident,
  initialTab = 'guide',
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'guide' | 'prompt'>(initialTab);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AiIncidentTipsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // AI Prompt Generator States
  const [agentPreset, setAgentPreset] = useState<AgentPromptPreset>('universal');
  const [customNote, setCustomNote] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Sync initial tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setCopiedPrompt(false);
    }
  }, [isOpen, initialTab]);

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

  // Compute generated prompt text
  const currentGeneratedPrompt = useMemo(() => {
    if (!incident) return '';
    return buildAgentPrompt({
      incident,
      data,
      preset: agentPreset,
      customNote,
    });
  }, [incident, data, agentPreset, customNote]);

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

  const handleCopyPrompt = () => {
    if (!currentGeneratedPrompt) return;
    navigator.clipboard.writeText(currentGeneratedPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  const handleDownloadPrompt = () => {
    if (!currentGeneratedPrompt) return;
    const blob = new Blob([currentGeneratedPrompt], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = incident.targetName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    link.href = url;
    link.setAttribute('download', `prompt-agent-${safeName}-${agentPreset}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
              <p className="text-xs text-slate-400 mt-1 font-sans">
                Panduan pemecahan masalah taktis dan prompt generator terstruktur untuk AI Agent.
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
        <div className="px-5 sm:px-6 py-2.5 bg-slate-950/40 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
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

        {/* Interactive View Navigation Tabs */}
        <div className="px-5 sm:px-6 pt-2 pb-0 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('guide')}
              className={`pb-2 px-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
                activeTab === 'guide'
                  ? 'border-indigo-400 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              <span>Panduan Langkah (SRE)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('prompt')}
              className={`pb-2 px-3 text-xs font-bold border-b-2 transition flex items-center gap-2 relative ${
                activeTab === 'prompt'
                  ? 'border-purple-400 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-purple-400" />
              <span>Prompt AI untuk Agent</span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-gradient-to-r from-purple-500/30 to-pink-500/30 text-purple-300 border border-purple-500/40">
                Generate
              </span>
            </button>
          </div>

          {/* Quick tab switcher shortcut */}
          <div className="pb-2 hidden sm:block">
            {activeTab === 'guide' ? (
              <button
                type="button"
                onClick={() => setActiveTab('prompt')}
                className="text-[11px] text-purple-400 hover:text-purple-300 transition flex items-center gap-1"
              >
                <span>Export ke Agent AI</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('guide')}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1"
              >
                <span>Lihat Panduan CLI</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
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
                <p className="text-xs text-slate-400 max-w-md font-sans">
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

          {/* TAB 1: Panduan Langkah SRE */}
          {!loading && activeTab === 'guide' && (
            <div className="space-y-5 animate-fadeIn">
              {/* Meta & Engine info */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 bg-indigo-950/20 border border-indigo-500/20 rounded-2xl p-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>
                    Model: <strong className="text-indigo-300">{data?.source || 'SRE Heuristic Engine'}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Estimasi Penanganan: ~{data?.estimatedFixTimeMinutes || 5} menit</span>
                </div>
              </div>

              {/* Banner Shortcut to AI Prompt Generator */}
              <div className="rounded-2xl bg-gradient-to-r from-purple-950/50 via-indigo-950/30 to-slate-950/50 border border-purple-500/30 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      Ingin mendelegasikan insiden ini ke AI Agent lain?
                    </h4>
                    <p className="text-[11px] text-slate-400 font-sans">
                      Ekspor analisis telemetri dan langkah ini menjadi Prompt AI siap pakai untuk Claude, ChatGPT, Cursor, atau Antigravity.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab('prompt')}
                    className="px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-purple-300" />
                    <span>Generate Prompt</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold transition flex items-center gap-1"
                    title="Salin langsung prompt siap pakai"
                  >
                    {copiedPrompt ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 text-[11px]">Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span className="text-[11px]">Salin Prompt</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 1. Root Cause Analysis */}
              <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-4 space-y-2">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Analisis Akar Masalah (Root Cause)</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans">
                  {data?.rootCause || incident.description}
                </p>
              </div>

              {/* 2. Step-by-Step Resolution Steps */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-slate-200 font-bold text-xs uppercase tracking-wider">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    <span>Langkah Penanganan Bertahap &amp; Perintah CLI</span>
                  </div>
                  {data?.steps && data.steps.some((s) => s.command) && (
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
                  {(data?.steps || []).map((step, idx) => (
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
              {data?.preventive && (
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

          {/* TAB 2: Prompt AI untuk Agent */}
          {!loading && activeTab === 'prompt' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Informative Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-950/40 via-indigo-950/30 to-slate-950/70 border border-purple-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-purple-300 font-bold text-xs">
                    <Bot className="w-4 h-4 text-purple-400" />
                    <span>Prompt Generator untuk External AI Agent</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-sans">
                    Format: Markdown
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  Gunakan prompt terstruktur di bawah ini untuk disalin ke AI Agent seperti <strong>Claude, ChatGPT, Cursor, Antigravity, GitHub Copilot</strong>, atau autonomous DevOps agent lainnya. Prompt ini sudah memuat konteks penuh insiden, telemetri, analisis akar masalah, serta perintah CLI perbaikan.
                </p>
              </div>

              {/* Preset Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>Pilih Profil / Target AI Agent:</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAgentPreset('universal')}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                      agentPreset === 'universal'
                        ? 'bg-purple-950/40 border-purple-500 text-white shadow-sm'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-bold flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                        Universal SRE
                      </span>
                      {agentPreset === 'universal' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                    </div>
                    <span className="text-[10px] text-slate-400 font-sans">
                      Format standar lengkap untuk semua AI / LLM (Claude, ChatGPT, Gemini).
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAgentPreset('cursor')}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                      agentPreset === 'cursor'
                        ? 'bg-purple-950/40 border-purple-500 text-white shadow-sm'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-bold flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                        Terminal / Cursor
                      </span>
                      {agentPreset === 'cursor' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                    </div>
                    <span className="text-[10px] text-slate-400 font-sans">
                      Instruksi eksekusi terminal otonom (Cursor, Antigravity, Claude Code).
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAgentPreset('chatgpt')}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                      agentPreset === 'chatgpt'
                        ? 'bg-purple-950/40 border-purple-500 text-white shadow-sm'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-bold flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-pink-400" />
                        Deep Analysis
                      </span>
                      {agentPreset === 'chatgpt' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                    </div>
                    <span className="text-[10px] text-slate-400 font-sans">
                      Analisis arsitektural, investigasi kode &amp; rekomendasi konfigurasi.
                    </span>
                  </button>
                </div>
              </div>

              {/* Optional Custom Operator Note */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                  <span>Catatan Khusus Tambahan untuk Agent (Opsional):</span>
                </label>
                <input
                  type="text"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder="Contoh: Port 4006 di-mapping ke 8080 di docker-compose, atau OS Ubuntu 22.04 LTS"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950/70 border border-slate-800 focus:border-purple-500 text-xs text-white placeholder-slate-500 focus:outline-none transition"
                />
              </div>

              {/* Generated Prompt Code View Box */}
              <div className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden shadow-inner">
                {/* Prompt Box Toolbar */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/80 border-b border-slate-800 flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    <span className="text-white font-bold text-xs">Pratinjau Prompt Siap Salin</span>
                    <span className="text-[10px] text-slate-400 font-sans">
                      ({currentGeneratedPrompt.length} karakter)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadPrompt}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition text-[11px] font-bold flex items-center gap-1 border border-slate-700"
                      title="Download file .md"
                    >
                      <Download className="w-3 h-3 text-slate-400" />
                      <span>Unduh .md</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition text-[11px] font-bold flex items-center gap-1.5 shadow-sm shadow-purple-600/30"
                    >
                      {copiedPrompt ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-300" />
                          <span className="text-emerald-200">Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Salin Seluruh Prompt</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Preformatted Prompt Content */}
                <div className="relative">
                  <pre className="p-4 text-xs text-slate-200 font-mono whitespace-pre-wrap break-words leading-relaxed max-h-80 sm:max-h-96 overflow-y-auto selection:bg-purple-500/40 custom-scrollbar">
                    {currentGeneratedPrompt}
                  </pre>
                </div>
              </div>

              {/* Toast confirmation alert */}
              {copiedPrompt && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn font-sans">
                  <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Prompt AI berhasil disalin ke clipboard! Silakan paste (<strong>Ctrl+V</strong>) ke AI Agent Anda (Cursor, Claude, ChatGPT, Antigravity, dll).
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            Tutup
          </button>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Quick Prompt Copy Button in Footer */}
            <button
              type="button"
              onClick={handleCopyPrompt}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-500/20 to-indigo-500/20 hover:from-purple-500/30 hover:to-indigo-500/30 border border-purple-500/40 text-purple-200 transition shadow-sm"
              title="Salin prompt terstruktur siap pakai ke clipboard"
            >
              {copiedPrompt ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Prompt Tersalin!</span>
                </>
              ) : (
                <>
                  <Bot className="w-3.5 h-3.5 text-purple-400" />
                  <span>Salin Prompt AI</span>
                </>
              )}
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
    </div>
  );
};
