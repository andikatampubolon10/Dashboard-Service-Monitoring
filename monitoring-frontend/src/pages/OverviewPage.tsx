import React, { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Server,
  Database,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ExternalLink,
  Search,
  FolderKanban,
  ArrowRight,
  RefreshCw,
  Loader2,
  Plus,
} from 'lucide-react';
import { useServers } from '../hooks/useServers';
import { useServices } from '../hooks/useServices';
import { ProjectService } from '../services/projectService';
import { Project, Server as ServerType } from '../types';
import { CardSkeleton } from '../components/common/LoadingSkeleton';
import { QuickAddServerModal } from '../components/common/QuickAddServerModal';
import { QuickAddServiceModal } from '../components/common/QuickAddServiceModal';
import { QuickCreateProjectModal } from '../components/common/QuickCreateProjectModal';
import { AttentionCenter } from '../components/dashboard/AttentionCenter';

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Telemetry Queries
  const { data: servers = [], isLoading: isLoadingServers, refetch: refetchServers } = useServers();
  const { data: services = [], refetch: refetchServices } = useServices();

  // Projects State
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    return searchParams.get('project') || localStorage.getItem('dashboard_selected_project_id') || 'all';
  });

  // Services Filter
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceStatusFilter, setServiceStatusFilter] = useState<'all' | 'UP' | 'DOWN'>('all');

  // Quick Action Modal States
  const [isAddServerOpen, setIsAddServerOpen] = useState(false);
  const [selectedProjectForServer, setSelectedProjectForServer] = useState<string | undefined>(undefined);

  const [isAddServiceOpen, setIsAddServiceOpen] = useState(false);
  const [selectedServerForService, setSelectedServerForService] = useState<string | undefined>(undefined);

  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);

  // Load Projects
  const fetchProjects = () => {
    setIsLoadingProjects(true);
    ProjectService.getProjects()
      .then((projs) => setProjects(projs))
      .catch(() => setProjects([]))
      .finally(() => setIsLoadingProjects(false));
  };

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    localStorage.setItem('dashboard_selected_project_id', projectId);
    if (projectId === 'all') {
      searchParams.delete('project');
      setSearchParams(searchParams, { replace: true });
    } else {
      setSearchParams({ project: projectId }, { replace: true });
    }
  };

  const handleManualRefresh = () => {
    refetchServers();
    refetchServices();
    fetchProjects();
  };

  // Filter servers based on selected project
  const filteredServers = useMemo(() => {
    if (selectedProjectId === 'all') return servers;
    const currentProj = projects.find((p) => p.id === selectedProjectId);
    if (!currentProj) return servers;
    const assignedIds = currentProj.serverIds || [];
    return servers.filter((s) => assignedIds.includes(s.id));
  }, [servers, projects, selectedProjectId]);

  // Filter services based on selected project and search/status
  const filteredServices = useMemo(() => {
    let result = services;

    // Filter by project
    if (selectedProjectId !== 'all') {
      const currentProj = projects.find((p) => p.id === selectedProjectId);
      if (currentProj) {
        const assignedServerIds = currentProj.serverIds || [];
        const matchingServerHosts = servers
          .filter((s) => assignedServerIds.includes(s.id))
          .map((s) => s.host);

        result = result.filter((svc) => {
          if (svc.serverId && assignedServerIds.includes(svc.serverId)) return true;
          if (svc.host && matchingServerHosts.includes(svc.host)) return true;
          return false;
        });
      }
    }

    // Filter by search
    if (serviceSearch.trim()) {
      const q = serviceSearch.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          (s.host && s.host.toLowerCase().includes(q)) ||
          (s.stack || '').toLowerCase().includes(q)
      );
    }

    // Filter by status
    if (serviceStatusFilter !== 'all') {
      result = result.filter((s) => (serviceStatusFilter === 'UP' ? s.status === 'healthy' : s.status !== 'healthy'));
    }

    return result;
  }, [services, selectedProjectId, projects, servers, serviceSearch, serviceStatusFilter]);

  // Aggregate Fleet Metrics
  const fleetKpis = useMemo(() => {
    const totalProjects = projects.length;
    const totalNodes = filteredServers.length;
    const onlineNodes = filteredServers.filter((s) => s.status === 'healthy').length;

    const totalSvcs = filteredServices.length;
    const upSvcs = filteredServices.filter((s) => s.status === 'healthy').length;

    let totalDbs = 0;
    let upDbs = 0;
    let totalCpuSum = 0;
    let criticalDiskCount = 0;

    for (const s of filteredServers) {
      const dbs = s.databases || [];
      totalDbs += dbs.length;
      upDbs += dbs.filter((d) => d.status === 'UP').length;

      const sys = s.system;
      const cpu = sys?.cpu?.usagePercent ?? s.cpuUsagePercent ?? 0;
      totalCpuSum += cpu;

      const diskPct = sys?.disk?.usedPercent ?? 0;
      if (diskPct >= 85) criticalDiskCount++;
    }

    const avgCpu = totalNodes > 0 ? parseFloat((totalCpuSum / totalNodes).toFixed(1)) : 0;

    return {
      totalProjects,
      totalNodes,
      onlineNodes,
      totalSvcs,
      upSvcs,
      totalDbs,
      upDbs,
      avgCpu,
      criticalDiskCount,
    };
  }, [filteredServers, filteredServices, projects]);

  return (
    <div className="space-y-6 pb-12">
      {/* ─── 1. HEADER & QUICK ACTION HUB ─────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-[#0B132B] to-[#0d1b2a] border border-cyan-500/20 p-6 sm:p-7 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 -mb-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>LIVE TELEMETRY STREAM</span>
              <span className="text-slate-500">•</span>
              <span>REMOTE HOSTING MYSQL</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-mono">
              ObservePulse <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">Control Center</span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
              Pusat pemantauan ringkas multi-node, pengelolaan projek &amp; service, serta peringatan masalah yang perlu ditangani.
            </p>
          </div>

          {/* Quick Action Buttons & Project Switcher */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-wrap">
            {/* Project Filter Select */}
            <div className="relative">
              <select
                value={selectedProjectId}
                onChange={(e) => handleSelectProject(e.target.value)}
                className="w-full sm:w-auto appearance-none bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 rounded-2xl px-4 py-2.5 pr-9 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 shadow-sm transition cursor-pointer font-mono"
              >
                <option value="all">🌐 Seluruh Fleet (Semua Projek)</option>
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    📁 {proj.name} ({proj.env || 'PROD'})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                {isLoadingProjects ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderKanban className="w-3.5 h-3.5" />}
              </div>
            </div>

            {/* Quick Button: + Server ke Projek */}
            <button
              type="button"
              onClick={() => {
                setSelectedProjectForServer(selectedProjectId !== 'all' ? selectedProjectId : undefined);
                setIsAddServerOpen(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-bold font-mono transition shadow-sm"
              title="Hubungkan server ke projek"
            >
              <Plus className="w-4 h-4 text-cyan-400" />
              <span>Server ke Projek</span>
            </button>

            {/* Quick Button: + Service ke Server */}
            <button
              type="button"
              onClick={() => {
                setSelectedServerForService(filteredServers[0]?.id);
                setIsAddServiceOpen(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-bold font-mono transition shadow-sm"
              title="Daftarkan microservice baru ke server"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Service ke Server</span>
            </button>

            {/* Quick Button: + Projek Baru */}
            <button
              type="button"
              onClick={() => setIsCreateProjectOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/40 text-indigo-300 text-xs font-bold font-mono transition shadow-sm"
              title="Buat projek monitoring baru"
            >
              <Plus className="w-4 h-4 text-indigo-400" />
              <span>Projek Baru</span>
            </button>

            {/* Manual Refresh */}
            <button
              type="button"
              onClick={handleManualRefresh}
              className="inline-flex items-center justify-center p-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition"
              title="Refresh Metrik"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── 2. PUSAT PERHATIAN & TINDAKAN KRITIS (ATTENTION CENTER) ────────── */}
      <AttentionCenter
        servers={filteredServers}
        services={filteredServices}
        projects={projects}
      />

      {/* ─── 3. 4 FLEET KPI CARDS (RINGKAS & GLANCEABLE) ────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {isLoadingServers ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            {/* Card 1: Projek */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-4 shadow-sm dark:shadow-xl font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  TOTAL PROJEK
                </span>
                <FolderKanban className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {fleetKpis.totalProjects} <span className="text-xs font-normal text-slate-400">Domain</span>
                </div>
                <div className="mt-2 text-[11px] text-emerald-500 flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Projek Aktif Terpantau</span>
                </div>
              </div>
            </div>

            {/* Card 2: Host Nodes */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-4 shadow-sm dark:shadow-xl font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  HOST SERVERS
                </span>
                <Server className="w-4 h-4 text-cyan-500" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {fleetKpis.onlineNodes} <span className="text-sm font-normal text-slate-400">/ {fleetKpis.totalNodes} UP</span>
                </div>
                <div className="mt-2 text-[11px] text-emerald-500 flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Koneksi Host Reachable</span>
                </div>
              </div>
            </div>

            {/* Card 3: Microservices */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-4 shadow-sm dark:shadow-xl font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  MICROSERVICES
                </span>
                <Layers className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {fleetKpis.upSvcs} <span className="text-sm font-normal text-slate-400">/ {fleetKpis.totalSvcs} UP</span>
                </div>
                <div className="mt-2 text-[11px] font-semibold">
                  {fleetKpis.upSvcs === fleetKpis.totalSvcs ? (
                    <span className="text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Semua Service Online
                    </span>
                  ) : (
                    <span className="text-rose-500 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {fleetKpis.totalSvcs - fleetKpis.upSvcs} Service Offline
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Card 4: Databases */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-4 shadow-sm dark:shadow-xl font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  DATABASE ENGINES
                </span>
                <Database className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {fleetKpis.upDbs} <span className="text-sm font-normal text-slate-400">/ {fleetKpis.totalDbs} Socket</span>
                </div>
                <div className="mt-2 text-[11px] text-emerald-500 flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Port Sockets Listening</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── 4. PROJEK YANG TERDAFTAR (DENGAN AKSI CEPAT TAMBAH SERVER) ─────── */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-indigo-500" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white font-mono tracking-tight">
              Daftar Projek Monitoring ({projects.length} Projek)
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateProjectOpen(true)}
            className="text-xs font-semibold font-mono text-indigo-500 hover:text-indigo-400 hover:underline flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Buat Projek Baru</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((proj) => {
            const pServerIds = proj.serverIds || [];
            const pServers = servers.filter((s) => pServerIds.includes(s.id));
            const pServicesCount = pServers.reduce((acc, s) => acc + (s.services?.length || 0), 0);
            const isSelected = selectedProjectId === proj.id;

            return (
              <div
                key={proj.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-indigo-500/10 border-indigo-500/50 shadow-md'
                    : 'bg-white dark:bg-[#0e1424]/90 border-slate-200 dark:border-slate-800/90 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                        {proj.name}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                        {proj.description || 'Tidak ada deskripsi projek.'}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                      {proj.env || 'PRODUCTION'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 my-3 text-xs font-mono">
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Server Nodes</span>
                      <strong className="text-slate-900 dark:text-white text-sm">{pServers.length}</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Microservices</span>
                      <strong className="text-slate-900 dark:text-white text-sm">{pServicesCount}</strong>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProjectForServer(proj.id);
                      setIsAddServerOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300 transition"
                  >
                    <Plus className="w-3.5 h-3.5 text-cyan-500" />
                    <span>+ Server</span>
                  </button>

                  <Link
                    to={`/projects/${proj.id}`}
                    className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-indigo-500 hover:text-indigo-400 hover:underline"
                  >
                    <span>Detail Projek</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── 5. HOST SERVER MATRIX (DENGAN AKSI CEPAT TAMBAH SERVICE) ───────── */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-cyan-500" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white font-mono tracking-tight">
              Host Server Infrastructure Matrix ({filteredServers.length} Nodes)
            </h2>
          </div>
          <Link
            to="/servers"
            className="text-xs font-semibold text-cyan-500 hover:text-cyan-400 hover:underline flex items-center gap-1 font-mono"
          >
            <span>Semua Server</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredServers.map((srv: ServerType) => {
            const sys = srv.system;
            const cpuPct = sys?.cpu?.usagePercent ?? srv.cpuUsagePercent ?? 0;
            const memUsedMb = sys?.memory?.usedMb ?? ((srv.memoryUsedBytes ?? 0) / (1024 * 1024));
            const memTotalMb = sys?.memory?.totalMb ?? ((srv.memoryTotalBytes ?? 0) / (1024 * 1024));
            const memPct = sys?.memory?.usedPercent ?? Math.round((memUsedMb / (memTotalMb || 1)) * 100);

            const diskUsedGb = sys?.disk?.usedGb ?? ((srv.diskUsedBytes ?? 0) / (1024 * 1024 * 1024));
            const diskTotalGb = sys?.disk?.totalGb ?? ((srv.diskTotalBytes ?? 0) / (1024 * 1024 * 1024));
            const diskPct = sys?.disk?.usedPercent ?? Math.round((diskUsedGb / (diskTotalGb || 1)) * 100);

            const isDiskCritical = diskPct >= 90;

            return (
              <div
                key={srv.id}
                className={`bg-white dark:bg-[#0e1424]/90 border ${
                  isDiskCritical ? 'border-rose-500/40' : 'border-slate-200 dark:border-slate-800/90'
                } rounded-3xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between`}
              >
                <div>
                  {/* Server Header */}
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono">
                          {srv.displayName || srv.name}
                        </h3>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          {srv.env || 'PRODUCTION'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        IP: <strong className="text-slate-700 dark:text-slate-300">{srv.host}</strong> • Region: {srv.region || 'jakarta-idc'}
                      </p>
                    </div>

                    {isDiskCritical ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 text-rose-500 border border-rose-500/30 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>DISK 98%</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>ONLINE</span>
                      </span>
                    )}
                  </div>

                  {/* Resource Gauges */}
                  <div className="grid grid-cols-3 gap-3 my-4">
                    {/* CPU */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono mb-1">
                        <span className="text-slate-400 text-[11px]">CPU</span>
                        <strong className="text-slate-900 dark:text-white">{cpuPct.toFixed(1)}%</strong>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${cpuPct >= 85 ? 'bg-rose-500' : 'bg-emerald-400'}`}
                          style={{ width: `${Math.min(cpuPct, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* RAM */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono mb-1">
                        <span className="text-slate-400 text-[11px]">RAM</span>
                        <strong className="text-slate-900 dark:text-white">{memPct.toFixed(1)}%</strong>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-cyan-400"
                          style={{ width: `${Math.min(memPct, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* DISK */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono mb-1">
                        <span className="text-slate-400 text-[11px]">DISK</span>
                        <strong className={isDiskCritical ? 'text-rose-500' : 'text-slate-900 dark:text-white'}>
                          {diskPct.toFixed(1)}%
                        </strong>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isDiskCritical ? 'bg-rose-500' : 'bg-emerald-400'}`}
                          style={{ width: `${Math.min(diskPct, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Contextual Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedServerForService(srv.id);
                      setIsAddServiceOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 text-xs font-bold font-mono transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Service</span>
                  </button>

                  <Link
                    to={`/servers/${srv.id}`}
                    className="inline-flex items-center gap-1 text-xs font-bold font-mono text-cyan-500 hover:text-cyan-400 hover:underline"
                  >
                    <span>Inspect Node</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── 6. LIVE MICROSERVICES TELEMETRY TABLE ──────────────────────────── */}
      <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-3xl p-5 sm:p-6 shadow-sm dark:shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-500" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-mono tracking-tight">
                Live Microservices Telemetry ({filteredServices.length} Services)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pemeriksaan latency, stack runtime, dan ketersediaan HTTP microservices di seluruh cluster.
              </p>
            </div>
          </div>

          {/* Search & Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <input
                type="text"
                placeholder="Cari service..."
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>

            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-mono">
              {(['all', 'UP', 'DOWN'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setServiceStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    serviceStatusFilter === st ? 'bg-cyan-500 text-white shadow-sm' : 'text-slate-500 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Services Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Service Name</th>
                <th className="py-2.5 px-3">Host Node</th>
                <th className="py-2.5 px-3">Stack</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Throughput</th>
                <th className="py-2.5 px-3">P99 Latency</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredServices.map((svc) => {
                const isUp = svc.status === 'healthy';
                return (
                  <tr
                    key={svc.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition group cursor-pointer"
                    onClick={() => navigate(`/services/${svc.id}`)}
                  >
                    <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isUp ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                      <span className="group-hover:text-cyan-400 transition">{svc.name}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">
                      {svc.serverName || svc.host || 'Default Host'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        {svc.stack || 'nodejs'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isUp
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25'
                            : 'bg-rose-500/10 text-rose-500 border-rose-500/25'
                        }`}
                      >
                        {isUp ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                      {(svc.throughputRps ?? 0).toFixed(1)} req/s
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                      {svc.latencyP99Ms != null ? `${svc.latencyP99Ms} ms` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <Link
                        to={`/services/${svc.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 rounded hover:bg-cyan-500/10 text-cyan-500 inline-block transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── 7. QUICK ACTION MODALS ────────────────────────────────────────── */}
      <QuickAddServerModal
        isOpen={isAddServerOpen}
        onClose={() => setIsAddServerOpen(false)}
        onSuccess={handleManualRefresh}
        projects={projects}
        servers={servers}
        defaultProjectId={selectedProjectForServer}
      />

      <QuickAddServiceModal
        isOpen={isAddServiceOpen}
        onClose={() => setIsAddServiceOpen(false)}
        onSuccess={handleManualRefresh}
        servers={servers}
        defaultServerId={selectedServerForService}
      />

      <QuickCreateProjectModal
        isOpen={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
        onSuccess={handleManualRefresh}
        servers={servers}
      />
    </div>
  );
};
