import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, Service } from '../../types';
import { X, ArrowRight, Check, AlertCircle, ExternalLink } from 'lucide-react';

interface ServerDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  server: Server | null;
  allServices?: Service[];
}

export const ServerDetailDrawer: React.FC<ServerDetailDrawerProps> = ({
  isOpen,
  onClose,
  server,
  allServices = [],
}) => {
  const navigate = useNavigate();

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !server) return null;

  // Extract system metrics
  const sys = server.system;
  const cpuPct = sys?.cpu?.usagePercent ?? server.cpuUsagePercent ?? 0;
  const cpuCores = sys?.cpu?.cores ?? 16;

  const memUsedMb = sys?.memory?.usedMb ?? (server.memoryUsedBytes / (1024 * 1024));
  const memTotalMb = sys?.memory?.totalMb ?? (server.memoryTotalBytes / (1024 * 1024));
  const memPct = sys?.memory?.usedPercent ?? Math.round((memUsedMb / (memTotalMb || 1)) * 100);
  const ramUsedGb = (memUsedMb / 1024).toFixed(1);
  const ramTotGb = (memTotalMb / 1024).toFixed(1);

  const diskUsedGb = sys?.disk?.usedGb ?? (server.diskUsedBytes / (1024 * 1024 * 1024));
  const diskTotalGb = sys?.disk?.totalGb ?? (server.diskTotalBytes / (1024 * 1024 * 1024));
  const diskPct = sys?.disk?.usedPercent ?? Math.round((diskUsedGb / (diskTotalGb || 1)) * 100);

  // Extract services data
  // Combine server.servicesData or match with allServices
  const servicesList = (server.servicesData && server.servicesData.length > 0)
    ? server.servicesData
    : server.hostedServices.map((id) => {
        const found = allServices.find((s) => s.id === id);
        return {
          id,
          name: found?.name || id,
          stack: found?.stack || 'nodejs',
          description: found?.description || '',
          status: (found?.rawStatus || (found?.status === 'healthy' ? 'UP' : 'DOWN')) as 'UP' | 'DOWN',
          reqPerSecond: found?.throughputRps ?? 0,
          errorRatePercent: found?.errorRatePercent ?? 0,
          p99LatencyMs: found?.latencyP99Ms ?? 0,
          lastScrapedAt: null,
        };
      });

  const upServicesCount = servicesList.filter((s) => s.status === 'UP').length;
  const totalServicesCount = servicesList.length;

  // Extract databases data
  const databasesList = server.databases || [
    { id: 'postgres', name: 'PostgreSQL', host: 'localhost', port: 5432, status: 'UP', latencyMs: 3 },
    { id: 'redis', name: 'Redis', host: 'localhost', port: 6379, status: 'UP', latencyMs: 3 },
  ];
  const upDbCount = databasesList.filter((d) => d.status === 'UP').length;
  const totalDbCount = databasesList.length;

  const handleServiceClick = (serviceId: string) => {
    onClose();
    navigate(`/services/${serviceId}`);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-300"
      />

      {/* Slide-over Drawer */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-[#0c1222] border-l border-slate-800 text-slate-100 flex flex-col shadow-2xl relative animate-in slide-in-from-right duration-300">
          
          {/* Header */}
          <div className="p-6 border-b border-slate-800/80 flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">
                {server.displayName || server.name}
              </h2>
              <div className="text-xs font-mono text-slate-400 mt-1 flex items-center gap-2">
                <span>host: <strong className="text-cyan-400 font-normal">{server.host || server.ip || 'localhost'}</strong></span>
                <span className="text-slate-600">&bull;</span>
                <span className="capitalize">{server.status}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-7">
            
            {/* 1. SYSTEM RESOURCES */}
            <div>
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                SYSTEM RESOURCES
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {/* CPU Card */}
                <div className="bg-[#131b2e] border border-slate-800/90 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      CPU
                    </span>
                    <div className="mt-2 text-2xl font-bold font-mono text-white">
                      {cpuPct.toFixed(1)}<span className="text-base font-normal text-slate-400">%</span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      {cpuCores} cores
                    </div>
                  </div>
                  <div className="w-full bg-slate-800/80 h-1 rounded-full mt-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        cpuPct >= 85 ? 'bg-rose-500' : cpuPct >= 65 ? 'bg-amber-500' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${Math.min(cpuPct, 100)}%` }}
                    />
                  </div>
                </div>

                {/* MEMORY Card */}
                <div className="bg-[#131b2e] border border-slate-800/90 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      MEMORY
                    </span>
                    <div className="mt-2 text-2xl font-bold font-mono text-white">
                      {memPct.toFixed(1)}<span className="text-base font-normal text-slate-400">%</span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      {ramUsedGb} / {ramTotGb} GB
                    </div>
                  </div>
                  <div className="w-full bg-slate-800/80 h-1 rounded-full mt-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        memPct >= 85 ? 'bg-rose-500' : memPct >= 70 ? 'bg-amber-500' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${Math.min(memPct, 100)}%` }}
                    />
                  </div>
                </div>

                {/* DISK Card */}
                <div className="bg-[#131b2e] border border-slate-800/90 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      DISK
                    </span>
                    <div className="mt-2 text-2xl font-bold font-mono text-white">
                      {diskPct.toFixed(1)}<span className="text-base font-normal text-slate-400">%</span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      {diskUsedGb.toFixed(2)} / {diskTotalGb.toFixed(2)} GB
                    </div>
                  </div>
                  <div className="w-full bg-slate-800/80 h-1 rounded-full mt-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        diskPct >= 90 ? 'bg-rose-500' : diskPct >= 75 ? 'bg-amber-500' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${Math.min(diskPct, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. SERVICES LIST */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  SERVICES ({upServicesCount}/{totalServicesCount} UP)
                </h3>
              </div>

              <div className="divide-y divide-slate-800/70 border-t border-b border-slate-800/70">
                {servicesList.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500 font-mono">
                    No services currently hosted on this server.
                  </div>
                ) : (
                  servicesList.map((svc) => {
                    const isUp = svc.status === 'UP';
                    const isGo = (svc.stack || '').toLowerCase().includes('go');
                    const rps = svc.reqPerSecond != null ? `${svc.reqPerSecond} req/s` : '0 req/s';
                    const lat = svc.p99LatencyMs != null ? `p99 ${svc.p99LatencyMs}ms` : 'p99 0ms';
                    const err = svc.errorRatePercent != null ? `${svc.errorRatePercent}% err` : '0% err';

                    return (
                      <div
                        key={svc.id}
                        onClick={() => handleServiceClick(svc.id)}
                        className="py-4 px-2 -mx-2 rounded-xl hover:bg-slate-800/40 transition cursor-pointer group flex items-center justify-between gap-3"
                        title={`Beralih ke monitoring ${svc.name}`}
                      >
                        {/* Left: Indicator, Name & Description */}
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <span
                            className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 transition-all ${
                              isUp
                                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                                : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-white text-sm group-hover:text-cyan-400 transition truncate">
                                {svc.name}
                              </h4>
                            </div>
                            <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                              {svc.description || 'Microservice hosted instance'}
                            </p>
                          </div>
                        </div>

                        {/* Right: Stack Tag, Telemetry, UP/DOWN Badge, Arrow */}
                        <div className="flex items-center gap-3 shrink-0">
                          {/* Stack Tag */}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider ${
                              isGo
                                ? 'bg-[#0e2238] text-[#38bdf8] border border-[#38bdf8]/30'
                                : 'bg-[#0d2a22] text-[#10b981] border border-[#10b981]/30'
                            }`}
                          >
                            {isGo ? 'GO' : 'NODE.JS'}
                          </span>

                          {/* Mini Telemetry (Desktop/Tablet) */}
                          <div className="hidden sm:flex items-center gap-2.5 text-xs font-mono text-slate-400">
                            <span>{rps}</span>
                            <span>{lat}</span>
                            <span>{err}</span>
                          </div>

                          {/* Status Capsule Badge */}
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono border ${
                              isUp
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                            }`}
                          >
                            {svc.status}
                          </span>

                          {/* Navigation Arrow */}
                          <span className="text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition font-bold text-base pl-1">
                            &rarr;
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 3. DATABASES STATUS */}
            <div>
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                DATABASES ({upDbCount}/{totalDbCount} UP)
              </h3>
              <div className="flex flex-wrap items-center gap-2.5">
                {databasesList.map((db) => {
                  const isUp = db.status === 'UP';
                  return (
                    <div
                      key={db.id}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition ${
                        isUp
                          ? 'bg-[#0d2420] text-emerald-400 border-emerald-500/30'
                          : 'bg-[#29131a] text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {isUp ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                      )}
                      <span>{db.name}</span>
                      {db.latencyMs != null && (
                        <span className="opacity-70 text-[10px] ml-0.5">
                          {db.latencyMs}ms
                        </span>
                      )}
                      {!isUp && (
                        <span className="text-[10px] uppercase font-bold text-rose-500 ml-0.5">
                          (Offline)
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. CO-LOCATION RULES & WHY TOGETHER (if available) */}
            {server.colocation && (
              <div className="p-4 rounded-xl bg-[#090e1c] border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Aturan Penempatan (Co-location)
                  </span>
                  <button
                    onClick={() => {
                      onClose();
                      navigate(`/servers/${server.id}`);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline"
                  >
                    <span>Halaman Lengkap & Simulator</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
                {server.colocation.canShare && server.colocation.canShare.length > 0 && (
                  <div>
                    <span className="text-[11px] font-semibold text-emerald-400 block mb-1">
                      Kenapa Bisa Digabung:
                    </span>
                    <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside font-sans">
                      {server.colocation.canShare.slice(0, 2).map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Footer Bar */}
          <div className="p-4 border-t border-slate-800/80 bg-[#090e1c]/60 flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>Server ID: {server.id}</span>
            <button
              onClick={() => {
                onClose();
                navigate(`/servers/${server.id}`);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
            >
              <span>Detail Alokasi Lengkap</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
