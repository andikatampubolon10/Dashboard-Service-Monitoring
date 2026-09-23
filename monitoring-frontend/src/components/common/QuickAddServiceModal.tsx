import React, { useState } from 'react';
import { Layers, Server, Plus, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { Server as ServerType, RegisterServicePayload } from '../../types';
import { monitoringApi } from '../../services/monitoringApi';

interface QuickAddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  servers: ServerType[];
  defaultServerId?: string;
}

export const QuickAddServiceModal: React.FC<QuickAddServiceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  servers,
  defaultServerId,
}) => {
  const [selectedServerId, setSelectedServerId] = useState<string>(
    defaultServerId || (servers[0]?.id || '')
  );
  const [name, setName] = useState('');
  const [port, setPort] = useState(8080);
  const [metricsPath, setMetricsPath] = useState('/metrics');
  const [stack, setStack] = useState<'nodejs' | 'go' | 'python' | 'java' | string>('nodejs');
  const [description, setDescription] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const selectedServer = servers.find((s) => s.id === selectedServerId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setError('Nama microservice wajib diisi.');
      return;
    }

    if (!selectedServerId) {
      setError('Silakan tentukan server target penempatan service.');
      return;
    }

    setIsLoading(true);
    try {
      const payload: RegisterServicePayload = {
        name: name.trim(),
        serverId: selectedServerId,
        port: Number(port) || 8080,
        stack,
        metricsPath: metricsPath.trim() || '/metrics',
        description: description.trim() || undefined,
      };

      await monitoringApi.createService(payload);
      setSuccessMsg(`Service "${name}" berhasil didaftarkan ke ${selectedServer?.displayName || selectedServer?.name || 'server'}.`);

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Gagal menambahkan service ke server.');
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
          <Layers className="w-5 h-5 text-emerald-500" />
          <span>Tambah Service ke Server</span>
        </div>
      }
      subtitle="Daftarkan microservice baru ke host server target untuk memulai scraping metrik Prometheus secara otomatis."
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

        {/* Target Server Select */}
        <div>
          <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1.5 uppercase text-[10px]">
            Server Target
          </label>
          <div className="relative">
            <select
              value={selectedServerId}
              onChange={(e) => setSelectedServerId(e.target.value)}
              className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  🖥️ {s.displayName || s.name} ({s.host}) - {s.env || 'PROD'}
                </option>
              ))}
            </select>
            <Server className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
          </div>
        </div>

        {/* Service Name */}
        <div>
          <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
            Nama Microservice
          </label>
          <input
            type="text"
            placeholder="misal: Payment Gateway Service, Auth Worker"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Port */}
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
              Port HTTP Listening
            </label>
            <input
              type="number"
              placeholder="8080"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {/* Stack */}
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
              Runtime Stack
            </label>
            <select
              value={stack}
              onChange={(e) => setStack(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="nodejs">Node.js (Express/Nest)</option>
              <option value="go">Go (Gin/Fiber)</option>
              <option value="python">Python (FastAPI/Django)</option>
              <option value="java">Java (Spring Boot)</option>
              <option value="rust">Rust (Actix/Axum)</option>
            </select>
          </div>
        </div>

        {/* Metrics Path */}
        <div>
          <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
            Prometheus Metrics Path
          </label>
          <input
            type="text"
            placeholder="/metrics"
            value={metricsPath}
            onChange={(e) => setMetricsPath(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            Target URL Scraping: <code>http://{selectedServer?.host || 'host'}:{port}{metricsPath}</code>
          </span>
        </div>

        {/* Description */}
        <div>
          <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 uppercase text-[10px]">
            Deskripsi Singkat (Opsional)
          </label>
          <input
            type="text"
            placeholder="Deskripsi fungsi service..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
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
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold shadow-md transition disabled:opacity-50 flex items-center gap-1.5"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>Tambah Service</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
