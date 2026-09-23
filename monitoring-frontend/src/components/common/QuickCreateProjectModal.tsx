import React, { useState } from 'react';
import { FolderKanban, Plus, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { Server as ServerType, ProjectPayload } from '../../types';
import { ProjectService } from '../../services/projectService';

interface QuickCreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  servers: ServerType[];
}

export const QuickCreateProjectModal: React.FC<QuickCreateProjectModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  servers,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [env, setEnv] = useState<'PRODUCTION' | 'STAGING' | 'DEVELOPMENT'>('PRODUCTION');
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const toggleServer = (serverId: string) => {
    setSelectedServerIds((prev) =>
      prev.includes(serverId) ? prev.filter((id) => id !== serverId) : [...prev, serverId]
    );
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
      const payload: ProjectPayload = {
        name: name.trim(),
        description: description.trim(),
        env,
        serverIds: selectedServerIds,
      };

      const created = await ProjectService.createProject(payload);
      setSuccessMsg(`Projek "${created.name}" berhasil dibuat.`);

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Gagal membuat projek baru.');
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
          <FolderKanban className="w-5 h-5 text-indigo-500" />
          <span>Buat Projek Baru</span>
        </div>
      }
      subtitle="Kelompokkan server dan microservice ke dalam satu domain projek monitoring."
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

        {/* Project Name */}
        <div>
          <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
            Nama Projek
          </label>
          <input
            type="text"
            placeholder="misal: E-Health Platform, Core Banking API"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        {/* Environment */}
        <div>
          <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
            Environment
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['PRODUCTION', 'STAGING', 'DEVELOPMENT'] as const).map((envOption) => (
              <button
                key={envOption}
                type="button"
                onClick={() => setEnv(envOption)}
                className={`py-2 px-2.5 rounded-xl border text-center font-bold transition text-[11px] ${
                  env === envOption
                    ? 'bg-indigo-500/15 border-indigo-500 text-indigo-400 dark:text-indigo-300 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {envOption}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
            Deskripsi Projek (Opsional)
          </label>
          <textarea
            rows={2}
            placeholder="Deskripsi singkat arsitektur atau tujuan projek..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-sans"
          />
        </div>

        {/* Initial Servers Assignment */}
        <div>
          <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
            Tautkan Server Awal ({selectedServerIds.length} dipilih)
          </label>
          {servers.length === 0 ? (
            <p className="text-slate-400 italic">Belum ada server terdaftar di sistem.</p>
          ) : (
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {servers.map((s) => {
                const isSelected = selectedServerIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    onClick={() => toggleServer(s.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                      />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {s.displayName || s.name}
                      </span>
                      <span className="text-[10px] text-slate-500">({s.host})</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {s.env || 'PROD'}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

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
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-white font-bold shadow-md transition disabled:opacity-50 flex items-center gap-1.5"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>Buat Projek</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
