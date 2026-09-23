import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HardDrive,
  Layers,
  Server,
  FolderKanban,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { Server as ServerType, Service, Project } from '../../types';
import { AiIncidentTipsModal } from './AiIncidentTipsModal';

interface AttentionCenterProps {
  servers: ServerType[];
  services: Service[];
  projects: Project[];
}

interface AttentionItem {
  id: string;
  type: 'server_disk' | 'server_cpu' | 'service_down' | 'project_degraded';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  targetName: string;
  targetId: string;
  linkTo: string;
  metricBadge: string;
  description: string;
  recommendation: string;
}

export const AttentionCenter: React.FC<AttentionCenterProps> = ({
  servers,
  services,
  projects,
}) => {
  const navigate = useNavigate();
  const [selectedIssueForAi, setSelectedIssueForAi] = useState<AttentionItem | null>(null);

  const issues = useMemo<AttentionItem[]>(() => {
    const list: AttentionItem[] = [];

    // 1. Check Server Storage / Disk Saturation
    for (const srv of servers) {
      const sys = srv.system;
      const diskPct = sys?.disk?.usedPercent ?? (srv.diskTotalBytes ? Math.round(((srv.diskUsedBytes ?? 0) / srv.diskTotalBytes) * 100) : 0);
      const diskUsedGb = sys?.disk?.usedGb ?? ((srv.diskUsedBytes ?? 0) / (1024 * 1024 * 1024));
      const diskTotalGb = sys?.disk?.totalGb ?? ((srv.diskTotalBytes ?? 0) / (1024 * 1024 * 1024));
      const freeGb = Math.max(0, diskTotalGb - diskUsedGb);

      if (diskPct >= 85) {
        list.push({
          id: `disk-${srv.id}`,
          type: 'server_disk',
          severity: diskPct >= 90 ? 'CRITICAL' : 'WARNING',
          title: 'Kapasitas Storage Mendekati Penuh',
          targetName: srv.displayName || srv.name,
          targetId: srv.id,
          linkTo: `/servers/${srv.id}`,
          metricBadge: `Disk ${diskPct.toFixed(1)}% (${freeGb.toFixed(1)} GB Free)`,
          description: `Partisi root pada server ${srv.host} telah terpakai ${diskPct.toFixed(1)}% (${diskUsedGb.toFixed(1)} GB dari ${diskTotalGb.toFixed(1)} GB). Sisa kapasitas sangat menipis.`,
          recommendation: 'Jalankan pembersihan docker cache (docker system prune) atau log kontainer untuk mencegah server hang.',
        });
      }

      // Check Server CPU / Load Average
      const cpuPct = sys?.cpu?.usagePercent ?? srv.cpuUsagePercent ?? 0;
      const load1 = sys?.loadAverage?.load1 ?? 0;
      const cores = sys?.cpu?.cores ?? 2;
      if (cpuPct >= 85 || load1 >= cores * 2) {
        list.push({
          id: `cpu-${srv.id}`,
          type: 'server_cpu',
          severity: 'WARNING',
          title: 'Lonjakan Beban CPU / Load Average',
          targetName: srv.displayName || srv.name,
          targetId: srv.id,
          linkTo: `/servers/${srv.id}`,
          metricBadge: `CPU ${cpuPct.toFixed(1)}% | Load ${load1.toFixed(2)}`,
          description: `Utilisasi CPU pada server ${srv.host} berada di atas batas normal (${cpuPct.toFixed(1)}%).`,
          recommendation: 'Periksa container atau proses aktif yang mengonsumsi thread CPU berlebih.',
        });
      }
    }

    // 2. Check Offline / Unhealthy Microservices
    for (const svc of services) {
      if (svc.status !== 'healthy') {
        const hostName = svc.serverName || svc.host || 'Unknown Host';
        list.push({
          id: `svc-${svc.id}`,
          type: 'service_down',
          severity: 'CRITICAL',
          title: 'Microservice Tidak Merespon / Offline',
          targetName: svc.name,
          targetId: svc.id,
          linkTo: `/services/${svc.id}`,
          metricBadge: 'Status: OFFLINE',
          description: `Endpoint ${svc.name} pada host ${hostName} gagal merespon probe ketersediaan port.`,
          recommendation: 'Periksa status container Docker, restart service, atau cek file log untuk melacak kegagalan.',
        });
      }
    }

    // 3. Check Degraded Projects
    for (const proj of projects) {
      const pServerIds = proj.serverIds || [];
      const projectServers = servers.filter((s) => pServerIds.includes(s.id));
      const hasCriticalServer = projectServers.some((s) => {
        const disk = s.system?.disk?.usedPercent ?? (s.diskTotalBytes ? Math.round(((s.diskUsedBytes ?? 0) / s.diskTotalBytes) * 100) : 0);
        return disk >= 90 || s.status === 'critical';
      });

      if (hasCriticalServer) {
        list.push({
          id: `proj-${proj.id}`,
          type: 'project_degraded',
          severity: 'WARNING',
          title: 'Infrastruktur Projek Memerlukan Perhatian',
          targetName: proj.name,
          targetId: proj.id,
          linkTo: `/projects/${proj.id}`,
          metricBadge: `${proj.env || 'PRODUCTION'} Environment`,
          description: `Projek "${proj.name}" menaungi node server yang mengalami kejenuhan resource atau insiden kritis.`,
          recommendation: 'Evaluasi alokasi server dan beban microservice dalam domain projek ini.',
        });
      }
    }

    // Sort: CRITICAL first, then WARNING
    return list.sort((a, _b) => (a.severity === 'CRITICAL' ? -1 : 1));
  }, [servers, services, projects]);

  if (issues.length === 0) {
    return (
      <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-4 flex items-center justify-between gap-4 font-mono">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400">
              Pusat Perhatian: Semua Infrastruktur Berjalan Normal
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Tidak ada peringatan kritis pada projek, server, maupun microservice. SLA cluster 100% aman.
            </p>
          </div>
        </div>
        <span className="hidden sm:inline-block px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          0 INSIDEN AKTIF
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-slate-900/90 dark:bg-[#0c1220] border border-rose-500/30 p-5 sm:p-6 shadow-xl space-y-4">
      {/* Attention Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400">
            <ShieldAlert className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white font-mono tracking-tight">
                Pusat Perhatian &amp; Tindakan Kritis
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
                {issues.length} Perlu Ditangani
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Ringkasan komponen projek, server, atau microservice yang membutuhkan tindakan penanganan segera.
            </p>
          </div>
        </div>
      </div>

      {/* Issues List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {issues.map((issue) => {
          const isCrit = issue.severity === 'CRITICAL';
          return (
            <div
              key={issue.id}
              className={`p-4 rounded-2xl border transition flex flex-col justify-between ${
                isCrit
                  ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/70'
                  : 'bg-amber-950/20 border-amber-500/40 hover:border-amber-500/70'
              }`}
            >
              <div className="space-y-2">
                {/* Badge Row */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 font-mono">
                    {issue.type === 'server_disk' ? (
                      <HardDrive className="w-4 h-4 text-rose-400" />
                    ) : issue.type === 'service_down' ? (
                      <Layers className="w-4 h-4 text-rose-400" />
                    ) : issue.type === 'project_degraded' ? (
                      <FolderKanban className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Server className="w-4 h-4 text-amber-400" />
                    )}
                    <span className="text-[11px] font-bold text-slate-200">
                      {issue.title}
                    </span>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
                      isCrit
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    {issue.metricBadge}
                  </span>
                </div>

                {/* Target & Description */}
                <div>
                  <div className="text-sm font-bold text-white font-mono flex items-center gap-1.5">
                    <span className="text-slate-400 text-xs">Target:</span>
                    <span className={isCrit ? 'text-rose-400' : 'text-amber-400'}>
                      {issue.targetName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {issue.description}
                  </p>
                </div>

                {/* Recommendation */}
                <div className="text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
                  <strong className="text-slate-300">Rekomendasi:</strong> {issue.recommendation}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedIssueForAi(issue)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition shadow-sm bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 border border-indigo-500/40 text-indigo-300 hover:text-white"
                  title="Dapatkan tips penanganan masalah berbasis AI"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Tips AI</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate(issue.linkTo)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition shadow-sm ${
                    isCrit
                      ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                  }`}
                >
                  <span>Tangani Masalah</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dynamic AI Incident Tips Modal */}
      <AiIncidentTipsModal
        isOpen={Boolean(selectedIssueForAi)}
        onClose={() => setSelectedIssueForAi(null)}
        incident={selectedIssueForAi}
      />
    </div>
  );
};

