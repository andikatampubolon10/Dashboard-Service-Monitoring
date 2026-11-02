import React, { useState, useEffect } from 'react';
import {
  Bell,
  Plus,
  Send,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Check,
  X,
  RefreshCw,
  History,
} from 'lucide-react';
import { ProjectAlertItem, ProjectAlertTriggers } from '../../types';
import { ProjectService } from '../../services/projectService';
import { Modal } from '../common/Modal';

interface ProjectAlertsTabProps {
  projectId: string;
  projectName: string;
  alerts: ProjectAlertItem[];
  onAlertsChanged: () => void;
}

export const ProjectAlertsTab: React.FC<ProjectAlertsTabProps> = ({
  projectId,
  projectName,
  alerts,
  onAlertsChanged,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [channelLabel, setChannelLabel] = useState('#alerts');
  const [mentionChoice, setMentionChoice] = useState<'here' | 'channel' | 'none'>('here');
  const [triggers, setTriggers] = useState<ProjectAlertTriggers>({
    serverDown: true,
    serviceDown: true,
    highErrorRate: true,
    highLatency: true,
    highResourceUsage: false,
    onRecovery: true,
  });

  // Message Style & Notes
  const [messageStyle, setMessageStyle] = useState<'standard' | 'emergency' | 'compact'>('standard');
  const [teamNote, setTeamNote] = useState('');
  const [useCustomTemplate, setUseCustomTemplate] = useState(false);
  const [customTemplate, setCustomTemplate] = useState('');

  // Testing Webhook state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Alert History Logs State
  const [alertHistory, setAlertHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const history = await ProjectService.getProjectAlertHistory(projectId);
      setAlertHistory(history);
    } catch {
      setAlertHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [projectId]);

  const activeMentionTag = mentionChoice === 'here' ? '@here' : mentionChoice === 'channel' ? '@channel' : '';

  const buildTemplate = () => {
    if (useCustomTemplate && customTemplate.trim()) {
      return customTemplate.trim();
    }
    const noteLine = teamNote.trim() ? `\\n• *Instruksi Tim* : ${teamNote.trim()}` : '';
    if (messageStyle === 'emergency') {
      return `🔥 *[CRITICAL SLA INCIDENT] GANGGUAN PADA {{projectName}}*\\n• *Target Server* : {{targetName}} ({{targetHost}})\\n• *Lingkungan* : {{environment}}\\n• *Waktu Kejadian* : {{time}}\\n• *Rincian Error* : \`{{errorMessage}}\`${noteLine}\\n• *Panggilan Darurat* : {{mentions}} Mohon segera lakukan penanganan prioritas!`;
    }
    if (messageStyle === 'compact') {
      return `⚠️ *[{{severity}}] {{projectName}}* : {{targetName}} ({{targetHost}}) terkendala pada {{time}}. Error: {{errorMessage}}. ${activeMentionTag ? '{{mentions}}' : ''}${teamNote.trim() ? ` (Catatan: ${teamNote.trim()})` : ''}`;
    }
    return `🚨 *[{{severity}}] PERINGATAN GANGGUAN: {{projectName}}*\\n• *Target Server* : {{targetName}} ({{targetHost}})\\n• *Waktu* : {{time}}\\n• *Diagnosa* : {{errorMessage}}${noteLine}\\n• *Perhatian* : {{mentions}} Harap segera periksa dashboard monitoring.`;
  };

  const resetForm = () => {
    setEditingAlertId(null);
    setName('');
    setWebhookUrl('');
    setChannelLabel('#alerts');
    setMentionChoice('here');
    setTriggers({
      serverDown: true,
      serviceDown: true,
      highErrorRate: true,
      highLatency: true,
      highResourceUsage: false,
      onRecovery: true,
    });
    setMessageStyle('standard');
    setTeamNote('');
    setUseCustomTemplate(false);
    setCustomTemplate('');
    setActionError(null);
  };

  const handleOpenCreateModal = () => {
    resetForm();
    setName(`Alert ${channelLabel || 'Slack'}`);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (alert: ProjectAlertItem) => {
    setEditingAlertId(alert.id);
    setName(alert.name);
    setWebhookUrl(alert.webhookUrl);
    setChannelLabel(alert.channelLabel || '#alerts');
    if (alert.mentions?.includes('@channel')) setMentionChoice('channel');
    else if (alert.mentions?.includes('@here')) setMentionChoice('here');
    else setMentionChoice('none');

    setTriggers({
      serverDown: alert.triggers?.serverDown !== false,
      serviceDown: alert.triggers?.serviceDown !== false,
      highErrorRate: Boolean(alert.triggers?.highErrorRate),
      highLatency: Boolean(alert.triggers?.highLatency),
      highResourceUsage: Boolean(alert.triggers?.highResourceUsage),
      onRecovery: alert.triggers?.onRecovery !== false,
    });
    if (alert.messageStyle) {
      const lower = alert.messageStyle.toLowerCase() as any;
      if (['standard', 'emergency', 'compact'].includes(lower)) {
        setMessageStyle(lower);
      }
    } else {
      setMessageStyle('standard');
    }
    setTeamNote(alert.teamNote || '');
    setUseCustomTemplate(Boolean(alert.useCustomTemplate));
    setCustomTemplate(alert.customTemplate || '');
    setActionError(null);
    setIsModalOpen(true);
  };

  const handleSaveAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl.trim()) {
      setActionError('URL Webhook Slack wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    try {
      const payload: Partial<ProjectAlertItem> = {
        name: name.trim() || 'Slack Channel Alert',
        webhookUrl: webhookUrl.trim(),
        channelLabel: channelLabel.trim() || '#alerts',
        mentions: activeMentionTag,
        triggers,
        messageStyle: messageStyle.toUpperCase() as any,
        teamNote: teamNote.trim(),
        useCustomTemplate: true,
        customTemplate: buildTemplate(),
        isEnabled: true,
      };

      if (editingAlertId) {
        await ProjectService.updateProjectAlert(projectId, editingAlertId, payload);
      } else {
        await ProjectService.addProjectAlert(projectId, payload);
      }

      setIsModalOpen(false);
      resetForm();
      onAlertsChanged();
    } catch (err: any) {
      setActionError(err.message || 'Gagal menyimpan aturan alert.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus aturan notifikasi ini?')) return;
    try {
      await ProjectService.deleteProjectAlert(projectId, alertId);
      onAlertsChanged();
    } catch (err: any) {
      alert(`Gagal menghapus alert: ${err.message}`);
    }
  };

  const handleToggleAlert = async (alertId: string, currentEnabled: boolean) => {
    try {
      await ProjectService.toggleProjectAlert(projectId, alertId, !currentEnabled);
      onAlertsChanged();
    } catch (err: any) {
      alert(`Gagal mengubah status alert: ${err.message}`);
    }
  };

  const handleTestPing = async (alertId: string, url: string, channel: string) => {
    setTestingId(alertId);
    setTestResult(null);
    try {
      const res = await ProjectService.testSlackWebhook(url, channel);
      setTestResult({ id: alertId, success: true, message: res.message || 'Pesan percobaan berhasil terkirim ke Slack!' });
    } catch (err: any) {
      setTestResult({ id: alertId, success: false, message: err.message || 'Gagal mengirim test pesan.' });
    } finally {
      setTestingId(null);
    }
  };

  const [isSimulatingAlert, setIsSimulatingAlert] = useState(false);

  const handleSimulateAlert = async () => {
    setIsSimulatingAlert(true);
    setTestResult(null);
    try {
      const res = await ProjectService.triggerTestAlert(projectId, {
        targetType: 'SERVER',
        targetName: 'Simulasi Server Host',
        errorMessage: 'TCP Probe Timeout (>800ms) - Target Unreachable',
      });
      setTestResult({ id: 'sim', success: true, message: res.message || 'Simulasi notifikasi insiden berhasil dikirim ke Slack!' });
      setTimeout(() => {
        fetchHistory();
      }, 1000);
    } catch (err: any) {
      setTestResult({ id: 'sim', success: false, message: err.message || 'Gagal mengirim simulasi alert.' });
    } finally {
      setIsSimulatingAlert(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── 1. TOP HEADER BANNER ────────────────────────────────────────────── */}
      <div className="p-4 rounded-xl border border-orange-500/30 bg-orange-50/40 dark:bg-orange-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-orange-600/30">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-orange-500 text-white">
                SLACK ALERTING
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Pengelolaan Notifikasi Slack: {projectName}
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Atur channel penerima, tombol On/Off cepat, dan pantau riwayat notifikasi terkirim.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSimulateAlert}
            disabled={isSimulatingAlert}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-orange-500/40 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 font-semibold text-xs transition disabled:opacity-50"
            title="Kirim pesan simulasi insiden darurat langsung ke Slack sekarang"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSimulatingAlert ? 'Mengirim...' : '⚡ Uji Kirim Alert Darurat'}</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs shadow-sm shadow-orange-600/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Channel Alert Baru</span>
          </button>
        </div>
      </div>

      {/* Test Feedback Result */}
      {testResult && (
        <div
          className={`p-3 rounded-xl border text-xs font-mono flex items-center justify-between ${
            testResult.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 dark:text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
          }`}
        >
          <div className="flex items-center gap-2">
            {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{testResult.message}</span>
          </div>
          <button onClick={() => setTestResult(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── 2. ACTIVE ALERT RULES CARDS ─────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5 font-mono">
            <Bell className="w-3.5 h-3.5 text-orange-500" />
            <span>Aturan Alert Aktif ({alerts.length} Saluran)</span>
          </h4>
          <span className="text-[11px] text-slate-400">
            Klik saklar switch untuk menyalakan/mematikan alert sementara.
          </span>
        </div>

        {alerts.length === 0 ? (
          <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2">
            <Bell className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Belum ada channel notifikasi Slack di projek ini
            </h5>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              Tambahkan webhook Slack agar tim otomatis menerima laporan saat ada server mati.
            </p>
            <button
              onClick={handleOpenCreateModal}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Pasang Slack Sekarang</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {alerts.map((alert) => {
              const isTesting = testingId === alert.id;
              const isEnabled = alert.isEnabled !== false;

              return (
                <div
                  key={alert.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isEnabled
                      ? 'bg-white dark:bg-[#111622] border-slate-200 dark:border-slate-800 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        <h5 className="font-bold text-xs text-slate-900 dark:text-white font-mono">
                          {alert.name}
                        </h5>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Channel: <strong className="text-slate-700 dark:text-slate-300">{alert.channelLabel || '#alerts'}</strong> {alert.mentions ? `(${alert.mentions})` : ''}
                      </div>
                    </div>

                    {/* Quick Toggle ON/OFF Switch */}
                    <button
                      onClick={() => handleToggleAlert(alert.id, isEnabled)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono transition ${
                        isEnabled
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                      }`}
                      title={isEnabled ? 'Klik untuk mematikan alert' : 'Klik untuk menyalakan alert'}
                    >
                      {isEnabled ? '● AKTIF' : '○ NONAKTIF'}
                    </button>
                  </div>

                  {/* Triggers Tags */}
                  <div className="flex flex-wrap gap-1.5 my-3 text-[10px] font-mono">
                    {alert.triggers?.serverDown && (
                      <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20">
                        🔴 Server Down
                      </span>
                    )}
                    {alert.triggers?.serviceDown && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        🟡 App Down
                      </span>
                    )}
                    {alert.triggers?.onRecovery && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                        🟢 Recovery
                      </span>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                    <button
                      onClick={() => handleTestPing(alert.id, alert.webhookUrl, alert.channelLabel)}
                      disabled={isTesting}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-orange-500 hover:border-orange-500/40 transition disabled:opacity-50"
                    >
                      {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      <span>Tes Webhook</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditModal(alert)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Edit Aturan Alert"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteAlert(alert.id)}
                        className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                        title="Hapus Aturan Alert"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── 3. RIWAYAT NOTIFIKASI TERKIRIM (ALERT HISTORY LOG TABLE) ──────── */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-orange-500" />
            <h4 className="text-xs font-bold text-slate-900 dark:text-white font-mono uppercase tracking-wider">
              Log Riwayat Pengiriman Notifikasi Slack (Audit Trail)
            </h4>
          </div>
          <button
            onClick={fetchHistory}
            disabled={isLoadingHistory}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-orange-500 transition font-mono"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingHistory ? 'animate-spin' : ''}`} />
            <span>Segarkan Log</span>
          </button>
        </div>

        {alertHistory.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 font-mono">
            Belum ada notifikasi insiden yang terkirim untuk projek ini. Semua sistem terpantau stabil.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-2">Waktu Kirim</th>
                  <th className="pb-2">Target</th>
                  <th className="pb-2">Kejadian</th>
                  <th className="pb-2">Status Slack</th>
                  <th className="pb-2">Channel</th>
                  <th className="pb-2">Rincian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {alertHistory.map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 text-slate-500 whitespace-nowrap">
                      {new Date(item.sent_at || Date.now()).toLocaleTimeString('id-ID')} WIB
                    </td>
                    <td className="py-2.5 font-bold text-slate-800 dark:text-slate-200">
                      {item.target_name} ({item.target_host || 'Host'})
                    </td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.event_type === 'RECOVERY'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-rose-500/10 text-rose-500'
                      }`}>
                        {item.event_type === 'RECOVERY' ? '🟢 PULIH' : '🔴 GANGGUAN'}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.status === 'SENT'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-rose-500/10 text-rose-500'
                      }`}>
                        {item.status === 'SENT' ? '✓ TERKIRIM' : '✕ GAGAL'}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-400">
                      {item.channel_label || '#alerts'}
                    </td>
                    <td className="py-2.5 text-slate-500 max-w-xs truncate">
                      {item.error_message || (item.duration_sec ? `Downtime: ${item.duration_sec}s` : '-')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── 4. MODAL TAMBAH / EDIT ALERT RULE ─────────────────────────────────── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center font-bold">
              <Bell className="w-4 h-4" />
            </div>
            <span>{editingAlertId ? 'Edit Aturan Alert Slack' : 'Tambah Channel Alert Slack Baru'}</span>
          </div>
        }
        subtitle={`Atur webhook Slack dan format pesan insiden untuk projek ${projectName}.`}
        maxWidth="xl"
      >
        <form onSubmit={handleSaveAlert} className="p-5 space-y-4 text-xs font-mono max-h-[82vh] overflow-y-auto">
          {actionError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Nama Aturan Alert */}
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
              Label / Nama Aturan Alert *
            </label>
            <input
              type="text"
              required
              placeholder="misal: Tim DevOps Infra, Core Backend Alert"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Webhook URL */}
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
              Slack Incoming Webhook URL *
            </label>
            <input
              type="url"
              required
              placeholder="https://hooks.slack.com/services/T00/B00/XXXXX"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Channel Label & Panggilan Mention */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
                Label Channel
              </label>
              <input
                type="text"
                placeholder="#alerts-infra"
                value={channelLabel}
                onChange={(e) => setChannelLabel(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
                Panggilan Mention Suara
              </label>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { id: 'here', label: '@here' },
                  { id: 'channel', label: '@channel' },
                  { id: 'none', label: 'Senyap' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMentionChoice(m.id as any)}
                    className={`py-2 rounded-lg border text-center transition ${
                      mentionChoice === m.id
                        ? 'bg-orange-500/15 border-orange-500 text-orange-600 dark:text-orange-400 font-bold'
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Pemicu Notifikasi (Triggers) */}
          <div className="space-y-1.5">
            <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase text-[10px]">
              Kapan Alert Dikirim?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={triggers.serverDown}
                  onChange={(e) => setTriggers((t) => ({ ...t, serverDown: e.target.checked }))}
                  className="rounded text-rose-500 focus:ring-0"
                />
                <span>Server Mati</span>
              </label>

              <label className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={triggers.serviceDown}
                  onChange={(e) => setTriggers((t) => ({ ...t, serviceDown: e.target.checked }))}
                  className="rounded text-amber-500 focus:ring-0"
                />
                <span>App Down</span>
              </label>

              <label className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={triggers.onRecovery}
                  onChange={(e) => setTriggers((t) => ({ ...t, onRecovery: e.target.checked }))}
                  className="rounded text-emerald-500 focus:ring-0"
                />
                <span>Pulih (Resolved)</span>
              </label>
            </div>
          </div>

          {/* Gaya Pesan & Catatan Tim */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-3">
            <label className="block text-slate-800 dark:text-slate-200 font-bold uppercase text-[10px]">
              Pilih Gaya Pesan Notifikasi
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
                  className={`p-2 rounded-lg border text-center transition ${
                    messageStyle === st.id
                      ? 'bg-orange-500/15 border-orange-500 text-orange-600 dark:text-orange-400 font-bold'
                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}
                >
                  <div className="text-xs">{st.label}</div>
                  <div className="text-[9px] text-slate-400">{st.desc}</div>
                </button>
              ))}
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
                Catatan Tambahan untuk Tim (Opsional)
              </label>
              <input
                type="text"
                placeholder="Contoh: Segera hubungi tim on-call"
                value={teamNote}
                onChange={(e) => setTeamNote(e.target.value)}
                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !webhookUrl.trim()}
              className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>{editingAlertId ? 'Simpan Perubahan' : 'Tambahkan Alert'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
