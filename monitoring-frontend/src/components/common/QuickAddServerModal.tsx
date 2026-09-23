import React, { useState } from 'react';
import {
  Server,
  FolderKanban,
  Plus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Radio,
  Terminal,
  Sparkles,
  Cpu,
  HardDrive,
  Layers,
  Upload,
} from 'lucide-react';
import { Modal } from './Modal';
import { Project, Server as ServerType, DiscoverServerResponse, DiscoveredService } from '../../types';
import { ProjectService } from '../../services/projectService';
import { useDiscoverServer, useRegisterServer } from '../../hooks/useServers';

interface QuickAddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projects: Project[];
  servers: ServerType[];
  defaultProjectId?: string;
}

export const QuickAddServerModal: React.FC<QuickAddServerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  projects,
  servers,
  defaultProjectId,
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    defaultProjectId && defaultProjectId !== 'all' ? defaultProjectId : (projects[0]?.id || '')
  );
  const [mode, setMode] = useState<'create_new' | 'link_existing'>('create_new');
  const [selectedServerId, setSelectedServerId] = useState<string>('');

  // Auto-Discovery Mode & Credentials (Zero-Config probe vs SSH)
  const [discoveryMode, setDiscoveryMode] = useState<'probe' | 'ssh'>('probe');
  const [sshConfig, setSshConfig] = useState({
    sshPort: '22',
    username: 'ubuntu',
    password: '',
    privateKey: '',
  });

  // Server Form Fields
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: '9100',
    env: 'PRODUCTION',
    region: 'jakarta-idc',
    description: '',
  });

  // Discovered Telemetry State
  const [discoveredData, setDiscoveredData] = useState<DiscoverServerResponse | null>(null);
  const [discoveredServicesSelection, setDiscoveredServicesSelection] = useState<DiscoveredService[]>([]);

  // Feedback State
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const discoverServerMutation = useDiscoverServer();
  const registerServerMutation = useRegisterServer();

  // Filter servers not yet in selected project
  const currentProject = projects.find((p) => p.id === selectedProjectId);
  const assignedServerIds = currentProject?.serverIds || [];
  const availableServers = servers.filter((s) => !assignedServerIds.includes(s.id));

  // Run Auto-Discovery Probe / SSH
  const handleRunDiscovery = async () => {
    setError(null);
    setSuccessMsg(null);

    const cleanHost = formData.host.trim();
    if (!cleanHost) {
      setError('Masukkan IP Address atau Host target terlebih dahulu.');
      return;
    }

    try {
      const res = await discoverServerMutation.mutateAsync({
        host: cleanHost,
        mode: discoveryMode,
        sshPort: parseInt(sshConfig.sshPort, 10) || 22,
        username: sshConfig.username.trim() || undefined,
        password: sshConfig.password || undefined,
        passphrase: sshConfig.password || undefined,
        privateKey: sshConfig.privateKey.trim() || undefined,
        exporterPort: parseInt(formData.port, 10) || 9100,
      } as any);

      setDiscoveredData(res);
      setDiscoveredServicesSelection(res.services || []);

      if (!formData.name.trim()) {
        const shortHost = cleanHost.replace(/[^a-zA-Z0-9]/g, '-');
        setFormData((prev) => ({
          ...prev,
          name: discoveryMode === 'ssh' ? `Node-${shortHost}` : `Server-${shortHost}`,
          description: `Discovered via ${discoveryMode === 'ssh' ? 'SSH' : 'Zero-Config'} (${res.os || 'Linux Node'}) with ${res.services?.length || 0} active listening ports`,
          port: discoveryMode === 'ssh' ? sshConfig.sshPort : (formData.port || '9100'),
        }));
      }

      setSuccessMsg(
        `Deteksi berhasil! Ditemukan ${res.services?.length || 0} service aktif di ${cleanHost} (${res.os || 'Linux Node'}).`
      );
    } catch (err: any) {
      setError(err?.message || 'Gagal melakukan deteksi ke target host.');
      setDiscoveredData(null);
    }
  };

  const toggleDiscoveredService = (serviceId: string) => {
    if (!discoveredData) return;
    const found = discoveredData.services.find((s) => s.id === serviceId);
    if (!found) return;

    setDiscoveredServicesSelection((prev) => {
      const exists = prev.some((s) => s.id === serviceId);
      if (exists) {
        return prev.filter((s) => s.id !== serviceId);
      } else {
        return [...prev, found];
      }
    });
  };

  const handleUpdateServiceName = (serviceId: string, newName: string) => {
    setDiscoveredServicesSelection((prev) =>
      prev.map((s) => (s.id === serviceId ? { ...s, name: newName } : s))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!selectedProjectId) {
      setError('Silakan pilih project tujuan.');
      return;
    }

    try {
      if (mode === 'link_existing') {
        if (!selectedServerId) {
          setError('Silakan pilih server yang ingin dihubungkan.');
          return;
        }
        await ProjectService.addServerToProject(selectedProjectId, selectedServerId);
        setSuccessMsg('Server berhasil dihubungkan ke project.');
      } else {
        if (!formData.name.trim() || !formData.host.trim()) {
          setError('Nama server dan Host / IP wajib diisi.');
          return;
        }

        const portNum = parseInt(formData.port, 10) || 22;

        await registerServerMutation.mutateAsync({
          name: formData.name.trim(),
          host: formData.host.trim(),
          port: portNum,
          env: formData.env,
          region: formData.region.trim(),
          description: formData.description.trim(),
          services: discoveredServicesSelection,
          databases: discoveredData?.databases || [],
          spec: discoveredData?.spec,
          ssh: discoveryMode === 'ssh' ? {
            port: parseInt(sshConfig.sshPort, 10) || 22,
            username: sshConfig.username.trim(),
            password: sshConfig.password || undefined,
            passphrase: sshConfig.password || undefined,
            privateKey: sshConfig.privateKey.trim() || undefined,
          } : undefined,
          projectId: selectedProjectId,
        } as any);

        setSuccessMsg('Server baru berhasil didaftarkan dan dihubungkan ke projek!');
      }

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err?.message || 'Terjadi kesalahan saat memproses server.');
    }
  };

  const isLoading = registerServerMutation.isPending || discoverServerMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-cyan-500" />
          <span>Tambah Server ke Projek</span>
        </div>
      }
      subtitle="Daftarkan host node baru dengan Zero-Config / SSH atau hubungkan server yang sudah ada."
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs font-mono">
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Project Selector (if multiple projects exist) */}
        {projects.length > 1 && (
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1.5 uppercase text-[10px]">
              Projek Tujuan
            </label>
            <div className="relative">
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    📁 {p.name} ({p.env || 'PROD'})
                  </option>
                ))}
              </select>
              <FolderKanban className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Mode Switcher: Create New vs Link Existing */}
        <div>
          <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1.5 uppercase text-[10px]">
            Opsi Penambahan
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setMode('create_new')}
              className={`py-2 px-3 rounded-lg font-bold transition flex items-center justify-center gap-1.5 ${
                mode === 'create_new'
                  ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Daftar Node Baru (Auto-Discovery)</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('link_existing')}
              className={`py-2 px-3 rounded-lg font-bold transition flex items-center justify-center gap-1.5 ${
                mode === 'link_existing'
                  ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Hubungkan Server Yang Ada</span>
            </button>
          </div>
        </div>

        {mode === 'link_existing' ? (
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1.5 uppercase text-[10px]">
              Pilih Server Yang Belum Terhubung
            </label>
            {availableServers.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center text-slate-400">
                Semua server yang ada sudah terhubung ke projek ini. Silakan pilih opsi &quot;Daftar Node Baru&quot;.
              </div>
            ) : (
              <select
                value={selectedServerId}
                onChange={(e) => setSelectedServerId(e.target.value)}
                className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">-- Pilih Server --</option>
                {availableServers.map((s) => (
                  <option key={s.id} value={s.id}>
                    🖥️ {s.displayName || s.name} ({s.host})
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Connection Mode Switcher: Zero-Config Probe vs SSH */}
            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                Metode Koneksi &amp; Auto-Discovery
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDiscoveryMode('probe')}
                  className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition ${
                    discoveryMode === 'probe'
                      ? 'bg-white dark:bg-[#1e293b] text-cyan-600 dark:text-cyan-400 shadow-sm border border-slate-200 dark:border-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5 text-emerald-500" />
                  <span>HTTP Port Probe (Zero-Config)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDiscoveryMode('ssh')}
                  className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition ${
                    discoveryMode === 'ssh'
                      ? 'bg-white dark:bg-[#1e293b] text-cyan-600 dark:text-cyan-400 shadow-sm border border-slate-200 dark:border-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5 text-cyan-500" />
                  <span>SSH Remote (Linux / EC2)</span>
                </button>
              </div>
            </div>

            {/* Network Host & Discovery Parameters */}
            <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#0f172a]/60 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                    IP Address / Host Target <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 34.101.207.115, 192.168.1.105 atau localhost"
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                  />
                </div>

                {discoveryMode === 'ssh' ? (
                  <div className="space-y-1.5">
                    <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                      Port SSH
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      value={sshConfig.sshPort}
                      onChange={(e) => setSshConfig({ ...sshConfig, sshPort: e.target.value })}
                      className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                      Port Exporter
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      placeholder="9100"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                      className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                    />
                  </div>
                )}
              </div>

              {discoveryMode === 'ssh' && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                        SSH Username <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. ubuntu atau ec2-user"
                        value={sshConfig.username}
                        onChange={(e) => setSshConfig({ ...sshConfig, username: e.target.value })}
                        className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                        SSH Password (Opsional)
                      </label>
                      <input
                        type="password"
                        placeholder="Password user SSH (jika ada)"
                        value={sshConfig.password}
                        onChange={(e) => setSshConfig({ ...sshConfig, password: e.target.value })}
                        className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                        SSH Private Key (.pem) — AWS EC2 / Key Pair
                      </label>
                      <label className="cursor-pointer text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-sans">
                        <Upload className="w-3 h-3" />
                        <span>Pilih File .pem</span>
                        <input
                          type="file"
                          accept=".pem,.key,text/plain"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                setSshConfig((prev) => ({
                                  ...prev,
                                  privateKey: (event.target?.result as string) || '',
                                }));
                              };
                              reader.readAsText(file);
                            }
                          }}
                        />
                      </label>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Paste isi file .pem di sini (atau klik 'Pilih File .pem')."
                      value={sshConfig.privateKey}
                      onChange={(e) => setSshConfig({ ...sshConfig, privateKey: e.target.value })}
                      className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-[11px] font-mono text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Discovery Trigger Button */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                  {discoveryMode === 'ssh'
                    ? '💡 Pastikan SSH di host target aktif dan port 22 dapat dihubungi.'
                    : '💡 Backend akan mendeteksi port yang listening & info OS target.'}
                </span>

                <button
                  type="button"
                  onClick={handleRunDiscovery}
                  disabled={discoverServerMutation.isPending || !formData.host.trim()}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold font-mono transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {discoverServerMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Memindai Host...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
                      <span>Tes &amp; Auto-Detect Service</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Discovered Specs & Services Panel */}
            {discoveredData && (
              <div className="p-4 rounded-xl bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-bold text-xs text-slate-900 dark:text-white font-mono">
                      Hasil Deteksi: {discoveredData.os || 'Linux Node'}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    {discoveredData.services.length} Service Ditemukan
                  </span>
                </div>

                {discoveredData.spec && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center">
                      <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                        <Cpu className="w-3 h-3 text-cyan-500" />
                        <span>CPU</span>
                      </div>
                      <div className="font-bold text-sm text-slate-800 dark:text-white mt-0.5">
                        {discoveredData.spec.cores} Cores
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center">
                      <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                        <HardDrive className="w-3 h-3 text-emerald-500" />
                        <span>RAM</span>
                      </div>
                      <div className="font-bold text-sm text-slate-800 dark:text-white mt-0.5">
                        {Math.round(discoveredData.spec.totalMemoryMb / 1024)} GB
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center">
                      <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                        <Layers className="w-3 h-3 text-amber-500" />
                        <span>Disk SSD</span>
                      </div>
                      <div className="font-bold text-sm text-slate-800 dark:text-white mt-0.5">
                        {discoveredData.spec.totalDiskGb} GB
                      </div>
                    </div>
                  </div>
                )}

                {/* Discovered Services Checklist */}
                {discoveredData.services.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] block">
                      Pilih Service yang Ingin Dipantau:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                      {discoveredData.services.map((svc) => {
                        const isSelected = discoveredServicesSelection.some((s) => s.id === svc.id);
                        return (
                          <div
                            key={svc.id}
                            onClick={() => toggleDiscoveredService(svc.id)}
                            className={`p-2 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition select-none ${
                              isSelected
                                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-900 dark:text-emerald-100 shadow-sm'
                                : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 opacity-60'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="rounded text-emerald-500 focus:ring-emerald-400 h-3.5 w-3.5 pointer-events-none shrink-0"
                              />
                              <div className="min-w-0">
                                <input
                                  type="text"
                                  value={svc.name}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => handleUpdateServiceName(svc.id, e.target.value)}
                                  className="font-bold text-[10px] bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 px-1 py-0.5 rounded text-slate-900 dark:text-white transition w-full"
                                />
                                <div className="text-[9px] text-slate-400 font-mono truncate px-1">
                                  :{svc.port} &bull; {svc.url}
                                </div>
                              </div>
                            </div>
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold font-mono uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                              {svc.stack}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Server Identity Form */}
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
                  Nama Server Node <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="misal: Node-34-101-207-115"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
                    Environment
                  </label>
                  <select
                    value={formData.env}
                    onChange={(e) => setFormData({ ...formData, env: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="PRODUCTION">PRODUCTION</option>
                    <option value="STAGING">STAGING</option>
                    <option value="DEVELOPMENT">DEVELOPMENT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
                    Region
                  </label>
                  <input
                    type="text"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
                  Deskripsi Node
                </label>
                <input
                  type="text"
                  placeholder="Catatan penempatan server atau fungsinya"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>
        )}

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
            disabled={isLoading || (mode === 'link_existing' && !selectedServerId)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold shadow-md transition disabled:opacity-50 flex items-center gap-1.5"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>{mode === 'link_existing' ? 'Hubungkan Server' : 'Daftarkan & Hubungkan'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
