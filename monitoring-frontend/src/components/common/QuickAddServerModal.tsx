import React, { useState } from 'react';
import { Server, FolderKanban, Plus, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { Project, Server as ServerType, RegisterServerPayload } from '../../types';
import { ProjectService } from '../../services/projectService';
import { monitoringApi } from '../../services/monitoringApi';

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
  const [mode, setMode] = useState<'link_existing' | 'create_new'>('link_existing');
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  
  // New server form fields
  const [newServerName, setNewServerName] = useState('');
  const [newServerHost, setNewServerHost] = useState('');
  const [newServerPort, setNewServerPort] = useState(9100);
  const [newServerEnv, setNewServerEnv] = useState<'PRODUCTION' | 'STAGING' | 'DEVELOPMENT'>('PRODUCTION');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter servers that are not yet in the selected project
  const currentProject = projects.find((p) => p.id === selectedProjectId);
  const assignedServerIds = currentProject?.serverIds || [];
  const availableServers = servers.filter((s) => !assignedServerIds.includes(s.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!selectedProjectId) {
      setError('Silakan pilih project tujuan.');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'link_existing') {
        if (!selectedServerId) {
          setError('Silakan pilih server yang ingin dihubungkan.');
          setIsLoading(false);
          return;
        }
        await ProjectService.addServerToProject(selectedProjectId, selectedServerId);
        setSuccessMsg('Server berhasil dihubungkan ke project.');
      } else {
        if (!newServerName.trim() || !newServerHost.trim()) {
          setError('Nama server dan Host/IP wajib diisi.');
          setIsLoading(false);
          return;
        }
        const payload: RegisterServerPayload = {
          name: newServerName.trim(),
          host: newServerHost.trim(),
          port: Number(newServerPort) || 9100,
          env: newServerEnv,
          projectId: selectedProjectId,
        };
        await monitoringApi.registerServer(payload);
        setSuccessMsg('Server baru berhasil didaftarkan dan dihubungkan ke project.');
      }

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat memproses server.');
    } finally {
      setIsLoading(false);
    }
  };

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
      subtitle="Hubungkan server node yang sudah ada atau daftarkan node baru ke dalam projek."
      maxWidth="lg"
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

        {/* Target Project Select */}
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

        {/* Mode Switcher: Link Existing vs Create New */}
        <div>
          <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1.5 uppercase text-[10px]">
            Opsi Penambahan
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setMode('link_existing')}
              className={`py-2 px-3 rounded-lg font-bold transition flex items-center justify-center gap-1.5 ${
                mode === 'link_existing'
                  ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Hubungkan Server Ada</span>
            </button>
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
              <span>Daftar Node Baru</span>
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
          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
                Nama Server Node
              </label>
              <input
                type="text"
                placeholder="misal: Server Edge Jakarta-02"
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
                  Host / IP Address
                </label>
                <input
                  type="text"
                  placeholder="34.101.xxx.xxx"
                  value={newServerHost}
                  onChange={(e) => setNewServerHost(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
                  Port Probe / Node Exporter
                </label>
                <input
                  type="number"
                  placeholder="9100"
                  value={newServerPort}
                  onChange={(e) => setNewServerPort(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
                Environment
              </label>
              <select
                value={newServerEnv}
                onChange={(e) => setNewServerEnv(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="PRODUCTION">PRODUCTION</option>
                <option value="STAGING">STAGING</option>
                <option value="DEVELOPMENT">DEVELOPMENT</option>
              </select>
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
