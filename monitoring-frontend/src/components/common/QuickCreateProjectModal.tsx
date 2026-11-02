import React, { useState, useMemo, useEffect } from 'react';
import {
  FolderKanban,
  Plus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Bell,
  Send,
  Check,
  MessageSquare,
  Radio,
} from 'lucide-react';
import { Modal } from './Modal';
import { Server as ServerType, ProjectPayload, ProjectAlertItem, Project } from '../../types';
import { ProjectService } from '../../services/projectService';

interface QuickCreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  servers: ServerType[];
  projectToEdit?: Project | null;
}

export const QuickCreateProjectModal: React.FC<QuickCreateProjectModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  servers,
  projectToEdit,
}) => {
  // ==========================================
  // 1. IDENTITAS PROJEK (LANGKAH AWAL)
  // ==========================================
  const [name, setName] = useState('');
  const [env, setEnv] = useState<'PRODUCTION' | 'STAGING' | 'DEVELOPMENT'>('PRODUCTION');
  const [description, setDescription] = useState('');
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);

  // ==========================================
  // 2. INTEGRASI NOTIFIKASI SLACK (OPSIONAL)
  // ==========================================
  const [notificationMode, setNotificationMode] = useState<'slack' | 'none'>('slack');
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [slackChannel, setSlackChannel] = useState('#alerts');
  const [mentionChoice, setMentionChoice] = useState<'here' | 'channel' | 'none'>('here');

  // Triggers Alert
  const [alertServerDown, setAlertServerDown] = useState(true);
  const [alertServiceDown, setAlertServiceDown] = useState(true);
  const [alertRecovery, setAlertRecovery] = useState(true);

  // Format Pesan
  const [messageStyle, setMessageStyle] = useState<'standard' | 'emergency' | 'compact'>('standard');
  const [teamNote, setTeamNote] = useState('');

  // Testing & Feedback State
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Prepopulate or Reset on open/projectToEdit change
  useEffect(() => {
    if (!isOpen) return;

    if (projectToEdit) {
      setName(projectToEdit.name || '');
      setEnv((['PRODUCTION', 'STAGING', 'DEVELOPMENT'].includes(projectToEdit.env) ? projectToEdit.env : 'PRODUCTION') as any);
      setDescription(projectToEdit.description || '');
      setSelectedServerIds(Array.isArray(projectToEdit.serverIds) ? [...projectToEdit.serverIds] : []);

      const primaryAlert = projectToEdit.alerts && projectToEdit.alerts.length > 0 ? projectToEdit.alerts[0] : null;
      if (primaryAlert && primaryAlert.webhookUrl) {
        setNotificationMode('slack');
        setSlackWebhookUrl(primaryAlert.webhookUrl || '');
        setSlackChannel(primaryAlert.channelLabel || '#alerts');

        if (primaryAlert.mentions?.includes('@channel')) setMentionChoice('channel');
        else if (primaryAlert.mentions?.includes('@here')) setMentionChoice('here');
        else setMentionChoice('none');

        setAlertServerDown(primaryAlert.triggers?.serverDown !== false);
        setAlertServiceDown(primaryAlert.triggers?.serviceDown !== false);
        setAlertRecovery(primaryAlert.triggers?.onRecovery !== false);

        if (primaryAlert.messageStyle) {
          const style = primaryAlert.messageStyle.toLowerCase() as any;
          if (['standard', 'emergency', 'compact'].includes(style)) {
            setMessageStyle(style);
          }
        } else {
          setMessageStyle('standard');
        }
        setTeamNote(primaryAlert.teamNote || '');
      } else {
        setNotificationMode('none');
        setSlackWebhookUrl('');
        setSlackChannel('#alerts');
        setMentionChoice('here');
        setAlertServerDown(true);
        setAlertServiceDown(true);
        setAlertRecovery(true);
        setMessageStyle('standard');
        setTeamNote('');
      }
    } else {
      setName('');
      setEnv('PRODUCTION');
      setDescription('');
      setSelectedServerIds([]);
      setNotificationMode('slack');
      setSlackWebhookUrl('');
      setSlackChannel('#alerts');
      setMentionChoice('here');
      setAlertServerDown(true);
      setAlertServiceDown(true);
      setAlertRecovery(true);
      setMessageStyle('standard');
      setTeamNote('');
    }
    setError(null);
    setSuccessMsg(null);
    setTestResult(null);
  }, [isOpen, projectToEdit]);

  // Resolve mention text
  const activeMentionTag = useMemo(() => {
    if (mentionChoice === 'here') return '@here';
    if (mentionChoice === 'channel') return '@channel';
    return '';
  }, [mentionChoice]);

  // Template Pesan Dinamis
  const generatedTemplate = useMemo(() => {
    const noteLine = teamNote.trim() ? `\n• *Instruksi Tim* : ${teamNote.trim()}` : '';

    if (messageStyle === 'emergency') {
      return `🔥 *[CRITICAL SLA INCIDENT] GANGGUAN PADA {{projectName}}*\n• *Target Server* : {{targetName}} ({{targetHost}})\n• *Lingkungan* : {{environment}}\n• *Waktu Kejadian* : {{time}}\n• *Rincian Error* : \`{{errorMessage}}\`${noteLine}\n• *Panggilan Darurat* : {{mentions}} Mohon segera lakukan penanganan prioritas!`;
    }

    if (messageStyle === 'compact') {
      return `⚠️ *[{{severity}}] {{projectName}}* : {{targetName}} ({{targetHost}}) terkendala pada {{time}}. Error: {{errorMessage}}. ${activeMentionTag ? '{{mentions}}' : ''}${teamNote.trim() ? ` (Catatan: ${teamNote.trim()})` : ''}`;
    }

    return `🚨 *[{{severity}}] PERINGATAN GANGGUAN: {{projectName}}*\n• *Target Server* : {{targetName}} ({{targetHost}})\n• *Waktu* : {{time}}\n• *Diagnosa* : {{errorMessage}}${noteLine}\n• *Perhatian* : {{mentions}} Harap segera periksa dashboard monitoring.`;
  }, [messageStyle, teamNote, activeMentionTag]);

  // Live preview text
  const livePreviewText = useMemo(() => {
    const proj = name.trim() || 'Nama Projek';
    let text = generatedTemplate;
    text = text.replace(/\{\{projectName\}\}/g, proj);
    text = text.replace(/\{\{environment\}\}/g, env);
    text = text.replace(/\{\{targetName\}\}/g, 'Node-Jakarta-01');
    text = text.replace(/\{\{targetHost\}\}/g, '103.187.146.73');
    text = text.replace(/\{\{severity\}\}/g, messageStyle === 'emergency' ? 'CRITICAL' : 'WARNING');
    text = text.replace(/\{\{errorMessage\}\}/g, 'TCP Probe Timeout (>800ms) - Unreachable');
    text = text.replace(/\{\{time\}\}/g, `${new Date().toLocaleTimeString('id-ID')} WIB`);
    text = text.replace(/\{\{mentions\}\}/g, activeMentionTag || '');
    text = text.replace(/\{\{duration\}\}/g, '4 Menit');
    return text;
  }, [generatedTemplate, name, env, messageStyle, activeMentionTag]);

  const toggleServer = (serverId: string) => {
    setSelectedServerIds((prev) =>
      prev.includes(serverId) ? prev.filter((id) => id !== serverId) : [...prev, serverId]
    );
  };

  const handleTestWebhook = async () => {
    if (!slackWebhookUrl.trim()) {
      setTestResult({ success: false, message: 'Masukkan URL Webhook Slack terlebih dahulu.' });
      return;
    }

    setIsTestingWebhook(true);
    setTestResult(null);

    try {
      const channelLabel = slackChannel.trim() || '#alerts';
      const res = await ProjectService.testSlackWebhook(slackWebhookUrl.trim(), channelLabel);
      setTestResult({ success: true, message: res.message || 'Pesan percobaan berhasil mendarat di Slack!' });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Gagal mengirim pesan test ke Slack.' });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setError('Nama projek wajib diisi.');
      return;
    }

    setIsLoading(true);
    try {
      let initialAlerts: ProjectAlertItem[] = [];

      if (notificationMode === 'slack' && slackWebhookUrl.trim()) {
        const existingPrimaryId = projectToEdit?.alerts?.[0]?.id;
        const primaryAlert: ProjectAlertItem = {
          id: existingPrimaryId || `alert-${Date.now()}`,
          name: `${name.trim()} Slack Notification`,
          webhookUrl: slackWebhookUrl.trim(),
          channelLabel: slackChannel.trim() || '#alerts',
          mentions: activeMentionTag,
          triggers: {
            serverDown: alertServerDown,
            serviceDown: alertServiceDown,
            highErrorRate: true,
            highLatency: true,
            highResourceUsage: false,
            onRecovery: alertRecovery,
          },
          messageStyle: messageStyle.toUpperCase() as 'STANDARD' | 'EMERGENCY' | 'COMPACT',
          teamNote: teamNote.trim(),
          useCustomTemplate: true,
          customTemplate: generatedTemplate,
          isEnabled: true,
        };
        const remainingAlerts = projectToEdit?.alerts && projectToEdit.alerts.length > 1
          ? projectToEdit.alerts.slice(1)
          : [];
        initialAlerts = [primaryAlert, ...remainingAlerts];
      } else if (notificationMode === 'none') {
        initialAlerts = [];
      }

      const payload: ProjectPayload = {
        name: name.trim(),
        description: description.trim(),
        env,
        serverIds: selectedServerIds,
        alerts: initialAlerts,
      };

      if (projectToEdit) {
        await ProjectService.updateProject(projectToEdit.id, payload);
        setSuccessMsg(`Perubahan projek "${name.trim()}" berhasil disimpan!`);
      } else {
        const created = await ProjectService.createProject(payload);
        setSuccessMsg(`Projek "${created.name}" berhasil dibuat!`);
      }

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan projek.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-slate-900 dark:text-white">
          <FolderKanban className="w-5 h-5 text-orange-500" />
          <span>
            {projectToEdit ? `Edit Konfigurasi Projek: ${projectToEdit.name}` : 'Daftarkan Projek Monitoring'}
          </span>
        </div>
      }
      subtitle={
        projectToEdit
          ? 'Perbarui identitas, alokasi server host, serta konfigurasi notifikasi & webhook Slack'
          : 'Alur Berurutan: 1. Identitas Projek → 2. Alokasi Server Host → 3. Notifikasi Slack & Pesan Alert'
      }
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="p-5 space-y-5 text-xs font-mono max-h-[85vh] overflow-y-auto">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-400 flex items-center gap-2 font-sans">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-400 flex items-center gap-2 font-sans">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* BAGIAN 1: IDENTITAS PROJEK (LANGKAH PERTAMA & UTAMA)          */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#0f172a]/60 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-slate-200/60 dark:border-slate-800 text-slate-900 dark:text-white font-bold text-xs">
            <span className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center text-[10px]">1</span>
            <span>Identitas &amp; Lingkungan Projek</span>
          </div>

          {/* Nama Projek */}
          <div className="space-y-1.5">
            <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
              Nama Projek <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="misal: Telemedicine Tara AI, Core Banking API"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-orange-500 shadow-sm"
            />
          </div>

          {/* Environment & Deskripsi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                Environment
              </label>
              <select
                value={env}
                onChange={(e) => setEnv(e.target.value as any)}
                className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-orange-500 shadow-sm"
              >
                <option value="PRODUCTION">PRODUCTION (Live Publik)</option>
                <option value="STAGING">STAGING (Testing / QA)</option>
                <option value="DEVELOPMENT">DEVELOPMENT (Pengembangan)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                Deskripsi Projek (Opsional)
              </label>
              <input
                type="text"
                placeholder="Catatan tujuan atau cakupan sistem"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-orange-500 shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* BAGIAN 2: ALOKASI SERVER HOST KE PROJEK                       */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#0f172a]/60 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-slate-200/60 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs">
              <span className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center text-[10px]">2</span>
              <span>Alokasi Server Host ke Projek</span>
            </div>
            <span className="text-[10px] text-slate-400">
              {selectedServerIds.length} Host Dipilih
            </span>
          </div>

          {servers.length === 0 ? (
            <div className="p-3 rounded-xl bg-white dark:bg-[#111827] border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-center text-xs">
              Belum ada server terdaftar. Anda dapat menambahkan server setelah projek dibuat.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {servers.map((s) => {
                const isSelected = selectedServerIds.includes(s.id);
                return (
                  <div
                    key={s.id}
                    onClick={() => toggleServer(s.id)}
                    className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer text-xs transition ${
                      isSelected
                        ? 'bg-orange-500/10 border-orange-500/40 text-orange-600 dark:text-orange-400 font-semibold shadow-xs'
                        : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[9px] ${
                          isSelected
                            ? 'bg-orange-600 border-orange-600 text-white'
                            : 'border-slate-400 dark:border-slate-600'
                        }`}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                      <span>{s.displayName || s.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({s.host || s.ip})</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                      {s.env || 'PROD'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* BAGIAN 3: NOTIFIKASI SLACK & PESAN ALERT                      */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs">
              <span className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center text-[10px]">3</span>
              <span>Notifikasi Slack &amp; Pesan Alert</span>
            </div>
          </div>

          {/* Segmented Switcher (Persis seperti Create Server) */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setNotificationMode('slack')}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition ${
                notificationMode === 'slack'
                  ? 'bg-white dark:bg-[#1e293b] text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Bell className="w-3.5 h-3.5 text-orange-500" />
              <span>Hubungkan Notifikasi Slack</span>
            </button>

            <button
              type="button"
              onClick={() => setNotificationMode('none')}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition ${
                notificationMode === 'none'
                  ? 'bg-white dark:bg-[#1e293b] text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-slate-400" />
              <span>Tanpa Notifikasi (Nanti Saja)</span>
            </button>
          </div>

          {notificationMode === 'slack' && (
            <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#0f172a]/60 border border-slate-200 dark:border-slate-800 space-y-3 animate-in fade-in">
              {/* Webhook Input with Test Button & Channel Label */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                    Slack Incoming Webhook URL <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-slate-400">Channel Label:</span>
                    <input
                      type="text"
                      placeholder="#alerts"
                      value={slackChannel}
                      onChange={(e) => setSlackChannel(e.target.value)}
                      className="w-24 bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-0.5 text-[10px] text-slate-900 dark:text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://hooks.slack.com/services/T.../B.../..."
                    value={slackWebhookUrl}
                    onChange={(e) => {
                      setSlackWebhookUrl(e.target.value);
                      if (testResult) setTestResult(null);
                    }}
                    className="flex-1 bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-orange-500 shadow-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={isTestingWebhook || !slackWebhookUrl.trim()}
                    className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold font-mono transition shadow-sm disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                  >
                    {isTestingWebhook ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Tes Webhook</span>
                  </button>
                </div>

                {testResult && (
                  <div
                    className={`p-2 rounded-lg text-[11px] flex items-center gap-2 ${
                      testResult.success
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>

              {/* Alert Triggers (Checkboxes) */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                  Kapan Alert Dikirim ke Slack?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className={`p-2 rounded-xl border cursor-pointer transition text-xs flex items-center gap-2 ${
                    alertServerDown
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400 font-bold'
                      : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-400'
                  }`}>
                    <input
                      type="checkbox"
                      checked={alertServerDown}
                      onChange={(e) => setAlertServerDown(e.target.checked)}
                      className="rounded text-rose-500 focus:ring-0"
                    />
                    <span>Server Mati / Offline</span>
                  </label>

                  <label className={`p-2 rounded-xl border cursor-pointer transition text-xs flex items-center gap-2 ${
                    alertServiceDown
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 font-bold'
                      : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-400'
                  }`}>
                    <input
                      type="checkbox"
                      checked={alertServiceDown}
                      onChange={(e) => setAlertServiceDown(e.target.checked)}
                      className="rounded text-amber-500 focus:ring-0"
                    />
                    <span>Aplikasi Down / Crash</span>
                  </label>

                  <label className={`p-2 rounded-xl border cursor-pointer transition text-xs flex items-center gap-2 ${
                    alertRecovery
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold'
                      : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-400'
                  }`}>
                    <input
                      type="checkbox"
                      checked={alertRecovery}
                      onChange={(e) => setAlertRecovery(e.target.checked)}
                      className="rounded text-emerald-500 focus:ring-0"
                    />
                    <span>Pulih Kembali (Resolved)</span>
                  </label>
                </div>
              </div>

              {/* Message Style Selection & Mentions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                    Gaya Pesan Notifikasi
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'standard', label: '⚡ Standar', desc: 'Rapi & Lengkap' },
                      { id: 'emergency', label: '🚨 Darurat', desc: 'SLA Kritis' },
                      { id: 'compact', label: '💬 Ringkas', desc: '1 Baris' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setMessageStyle(st.id as any)}
                        className={`p-1.5 rounded-lg border text-center transition ${
                          messageStyle === st.id
                            ? 'bg-orange-500/15 border-orange-500 text-orange-600 dark:text-orange-400 font-bold'
                            : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-500'
                        }`}
                      >
                        <div className="text-[11px]">{st.label}</div>
                        <div className="text-[9px] text-slate-400">{st.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                    Panggilan Suara / Mention
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'here', label: '@here', desc: 'Yang Online' },
                      { id: 'channel', label: '@channel', desc: 'Semua Tim' },
                      { id: 'none', label: 'Senyap', desc: 'Tanpa Tag' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMentionChoice(m.id as any)}
                        className={`p-1.5 rounded-lg border text-center transition ${
                          mentionChoice === m.id
                            ? 'bg-orange-500/15 border-orange-500 text-orange-600 dark:text-orange-400 font-bold'
                            : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-500'
                        }`}
                      >
                        <div className="text-[11px] font-mono">{m.label}</div>
                        <div className="text-[9px] text-slate-400">{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Custom Instruction Note */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                  Catatan Tambahan untuk Tim (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Segera hubungi On-Call PIC atau restart container"
                  value={teamNote}
                  onChange={(e) => setTeamNote(e.target.value)}
                  className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-orange-500 shadow-sm"
                />
              </div>

              {/* Visual Message Preview */}
              <div className="p-3 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 border-l-4 border-l-rose-500 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <MessageSquare className="w-3.5 h-3.5 text-orange-500" />
                  <span>Pratinjau Pesan Yang Diterima Tim di Slack:</span>
                </div>
                <pre className="text-[11px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                  {livePreviewText}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* ─── MODAL FOOTER ACTIONS ─── */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isLoading || !name.trim()}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 text-white font-bold shadow-md transition disabled:opacity-50 flex items-center gap-1.5"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : projectToEdit ? (
              <Check className="w-4 h-4" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            <span>{projectToEdit ? 'Simpan Perubahan Projek' : 'Buat Projek & Simpan'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
