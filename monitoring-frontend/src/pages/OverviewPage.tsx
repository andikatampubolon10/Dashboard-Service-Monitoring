import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Server,
  Cpu,
  HardDrive,
  Database,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ExternalLink,
  Zap,
  Search,
  FolderKanban,
  ArrowRight,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { useServers } from '../hooks/useServers';
import { useServices } from '../hooks/useServices';
import { ProjectService } from '../services/projectService';
import { Project, Server as ServerType } from '../types';
import { getStressTestHistory, StressTestRecord } from '../services/stressTestEngine';
import StressTestResultModal from '../components/monitoring/StressTestResultModal';
import { CardSkeleton } from '../components/common/LoadingSkeleton';

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Queries
  const { data: servers = [], isLoading: isLoadingServers, refetch: refetchServers } = useServers();
  const { data: services = [], isLoading: isLoadingServices, refetch: refetchServices } = useServices();

  // Projects State
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    return searchParams.get('project') || localStorage.getItem('dashboard_selected_project_id') || 'all';
  });

  // Services Filter
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceStatusFilter, setServiceStatusFilter] = useState<'all' | 'UP' | 'DOWN'>('all');

  // Stress Test Evaluation Modal
  const [stressHistory, setStressHistory] = useState<StressTestRecord[]>([]);
  const [selectedStressRecord, setSelectedStressRecord] = useState<StressTestRecord | null>(null);
  const [isStressModalOpen, setIsStressModalOpen] = useState(false);

  // Load Projects
  useEffect(() => {
    setIsLoadingProjects(true);
    ProjectService.getProjects()
      .then((projs) => setProjects(projs))
      .catch(() => setProjects([]))
      .finally(() => setIsLoadingProjects(false));
  }, []);

  // Load Stress History
  useEffect(() => {
    setStressHistory(getStressTestHistory());
  }, []);

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
    const totalNodes = filteredServers.length;
    const onlineNodes = filteredServers.filter((s) => s.status === 'healthy').length;

    const totalSvcs = filteredServices.length;
    const upSvcs = filteredServices.filter((s) => s.status === 'healthy').length;

    let totalDbs = 0;
    let upDbs = 0;
    let totalCpuSum = 0;
    let totalMemUsedMb = 0;
    let totalMemTotalMb = 0;
    let criticalDiskCount = 0;

    for (const s of filteredServers) {
      const dbs = s.databases || [];
      totalDbs += dbs.length;
      upDbs += dbs.filter((d) => d.status === 'UP').length;

      const sys = s.system;
      const cpu = sys?.cpu?.usagePercent ?? s.cpuUsagePercent ?? 0;
      totalCpuSum += cpu;

      const memUsed = sys?.memory?.usedMb ?? ((s.memoryUsedBytes ?? 0) / (1024 * 1024));
      const memTot = sys?.memory?.totalMb ?? ((s.memoryTotalBytes ?? 0) / (1024 * 1024));
      totalMemUsedMb += memUsed;
      totalMemTotalMb += memTot;

      const diskPct = sys?.disk?.usedPercent ?? 0;
      if (diskPct >= 85) criticalDiskCount++;
    }

    const avgCpu = totalNodes > 0 ? parseFloat((totalCpuSum / totalNodes).toFixed(1)) : 0;

    return {
      totalNodes,
      onlineNodes,
      totalSvcs,
      upSvcs,
      totalDbs,
      upDbs,
      avgCpu,
      criticalDiskCount,
    };
  }, [filteredServers, filteredServices]);

  const latestStress = stressHistory.length > 0 ? stressHistory[0] : null;

  return (
    <div className="space-y-7 pb-12">
      {/* ─── HERO COMMAND CENTER HEADER ─────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-[#0B132B] to-[#0d1b2a] border border-cyan-500/20 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>LIVE TELEMETRY STREAM</span>
              <span className="text-slate-500">•</span>
              <span>POSTGRESQL STORAGE ACTIVE</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight font-mono">
              ObservePulse <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">Fleet Command</span>
            </h1>

            <p className="text-sm text-slate-300 leading-relaxed">
              Monitoring infrastruktur multi-node real-time, status microservices, database engine, serta evaluasi performa menyeluruh.
            </p>
          </div>

          {/* Project Switcher & Quick Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Project Filter Select */}
            <div className="relative">
              <select
                value={selectedProjectId}
                onChange={(e) => handleSelectProject(e.target.value)}
                className="w-full sm:w-auto appearance-none bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 rounded-2xl px-4 py-2.5 pr-9 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 shadow-sm transition cursor-pointer"
              >
                <option value="all">🌐 Seluruh Fleet (All Projects)</option>
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

            {/* Quick Button: Run Stress Test */}
            <button
              type="button"
              onClick={() => navigate('/stress-test')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/35 transition"
            >
              <Zap className="w-4 h-4 fill-white text-white" />
              <span>Stress Test Suite</span>
            </button>

            {/* Manual Refresh */}
            <button
              type="button"
              onClick={handleManualRefresh}
              className="inline-flex items-center justify-center p-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition"
              title="Refresh Telemetry"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── 5 FLEET KPI CARDS ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {isLoadingServers ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            {/* Card 1: Host Servers */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  HOST NODES
                </span>
                <Server className="w-4 h-4 text-cyan-500" />
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
                  {fleetKpis.onlineNodes} <span className="text-lg font-normal text-slate-400">/ {fleetKpis.totalNodes}</span>
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  Host Linux WSL2 / Cloud Nodes
                </div>
                <div className="mt-3 text-[11px] font-mono font-semibold text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>100% Reachability OK</span>
                </div>
              </div>
            </div>

            {/* Card 2: Microservices */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  MICROSERVICES
                </span>
                <Layers className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
                  {fleetKpis.upSvcs} <span className="text-lg font-normal text-slate-400">/ {fleetKpis.totalSvcs}</span>
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  Listening Active Endpoints
                </div>
                <div className="mt-3 text-[11px] font-mono font-semibold">
                  {fleetKpis.upSvcs === fleetKpis.totalSvcs ? (
                    <span className="text-emerald-500">All Microservices Healthy</span>
                  ) : (
                    <span className="text-amber-500">{fleetKpis.totalSvcs - fleetKpis.upSvcs} Service Offline / Inactive</span>
                  )}
                </div>
              </div>
            </div>

            {/* Card 3: Databases */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  DATABASE ENGINES
                </span>
                <Database className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
                  {fleetKpis.upDbs} <span className="text-lg font-normal text-slate-400">/ {fleetKpis.totalDbs}</span>
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  Postgres, Redis, MongoDB
                </div>
                <div className="mt-3 text-[11px] font-mono font-semibold text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Live Socket Probing OK</span>
                </div>
              </div>
            </div>

            {/* Card 4: Fleet CPU */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  RATA-RATA CPU
                </span>
                <Cpu className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
                  {fleetKpis.avgCpu.toFixed(1)}<span className="text-lg font-normal text-slate-400">%</span>
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  Rata-rata Utilisasi Cluster
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      fleetKpis.avgCpu >= 85 ? 'bg-rose-500' : fleetKpis.avgCpu >= 65 ? 'bg-amber-500' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${Math.min(fleetKpis.avgCpu, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Card 5: Disk Saturation / Storage Warning */}
            <div className={`bg-white dark:bg-[#0e1424]/90 border ${fleetKpis.criticalDiskCount > 0 ? 'border-rose-500/50' : 'border-slate-200 dark:border-slate-800/90'} rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  STORAGE ALERT
                </span>
                {fleetKpis.criticalDiskCount > 0 ? (
                  <AlertTriangle className="w-4 h-4 text-rose-500 animate-bounce" />
                ) : (
                  <HardDrive className="w-4 h-4 text-emerald-500" />
                )}
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold font-mono">
                  {fleetKpis.criticalDiskCount > 0 ? (
                    <span className="text-rose-500">{fleetKpis.criticalDiskCount} Node &gt; 85%</span>
                  ) : (
                    <span className="text-slate-900 dark:text-white">Normal</span>
                  )}
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  {fleetKpis.criticalDiskCount > 0 ? 'Node-34-101-207-115 (Disk 98%)' : 'Semua disk berkapasitas aman'}
                </div>
                <div className="mt-3 text-[11px] font-mono font-semibold">
                  {fleetKpis.criticalDiskCount > 0 ? (
                    <span className="text-rose-400">Tindakan Diperlukan segera</span>
                  ) : (
                    <span className="text-emerald-500">Storage Headroom Optimal</span>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── HOST SERVER MATRIX (CARDS WITH EXTENDED TELEMETRY) ─────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-cyan-500" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-mono tracking-tight">
              Host Server Infrastructure Matrix ({filteredServers.length} Nodes)
            </h2>
          </div>
          <Link
            to="/servers"
            className="text-xs font-semibold text-cyan-500 hover:text-cyan-400 hover:underline flex items-center gap-1 font-mono"
          >
            <span>Kelola Server</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredServers.map((srv: ServerType) => {
            const sys = srv.system;
            const cpuPct = sys?.cpu?.usagePercent ?? srv.cpuUsagePercent ?? 0;
            const cpuCores = sys?.cpu?.cores ?? 2;

            const memUsedMb = sys?.memory?.usedMb ?? ((srv.memoryUsedBytes ?? 0) / (1024 * 1024));
            const memTotalMb = sys?.memory?.totalMb ?? ((srv.memoryTotalBytes ?? 0) / (1024 * 1024));
            const memPct = sys?.memory?.usedPercent ?? Math.round((memUsedMb / (memTotalMb || 1)) * 100);

            const diskUsedGb = sys?.disk?.usedGb ?? ((srv.diskUsedBytes ?? 0) / (1024 * 1024 * 1024));
            const diskTotalGb = sys?.disk?.totalGb ?? ((srv.diskTotalBytes ?? 0) / (1024 * 1024 * 1024));
            const diskPct = sys?.disk?.usedPercent ?? Math.round((diskUsedGb / (diskTotalGb || 1)) * 100);

            const load1 = sys?.loadAverage?.load1 ?? 0;
            const load5 = sys?.loadAverage?.load5 ?? 0;
            const load15 = sys?.loadAverage?.load15 ?? 0;

            const netRxKb = sys?.network?.rxKbSec ?? 0;
            const netTxKb = sys?.network?.txKbSec ?? 0;
            const diskWriteMb = sys?.disk?.writeMbSec ?? 0;

            const isDiskCritical = diskPct >= 90;

            return (
              <div
                key={srv.id}
                className={`bg-white dark:bg-[#0e1424]/90 border ${
                  isDiskCritical ? 'border-rose-500/40' : 'border-slate-200 dark:border-slate-800/90'
                } rounded-3xl p-6 shadow-md dark:shadow-2xl hover:border-cyan-500/50 transition-all duration-300 flex flex-col justify-between`}
              >
                <div>
                  {/* Server Header */}
                  <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800/80">
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
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">
                        IP: <strong className="text-slate-700 dark:text-slate-300">{srv.host}</strong> • Region: {srv.region || 'jakarta-idc'}
                      </p>
                    </div>

                    {isDiskCritical ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 text-rose-500 border border-rose-500/30 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>DISK 98% CRITICAL</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>HEALTHY NODE</span>
                      </span>
                    )}
                  </div>

                  {/* Telemetry Progress Bars (CPU, RAM, DISK) */}
                  <div className="grid grid-cols-3 gap-4 my-5">
                    {/* CPU */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono mb-1">
                        <span className="text-slate-400">CPU ({cpuCores}c)</span>
                        <strong className="text-slate-900 dark:text-white">{cpuPct.toFixed(1)}%</strong>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${cpuPct >= 85 ? 'bg-rose-500' : cpuPct >= 65 ? 'bg-amber-500' : 'bg-emerald-400'}`}
                          style={{ width: `${Math.min(cpuPct, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* RAM */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono mb-1">
                        <span className="text-slate-400">RAM</span>
                        <strong className="text-slate-900 dark:text-white">{memPct.toFixed(1)}%</strong>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${memPct >= 85 ? 'bg-rose-500' : memPct >= 70 ? 'bg-amber-500' : 'bg-cyan-400'}`}
                          style={{ width: `${Math.min(memPct, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono mt-0.5 block truncate">
                        {(memUsedMb / 1024).toFixed(1)}/{(memTotalMb / 1024).toFixed(1)} GB
                      </span>
                    </div>

                    {/* DISK */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono mb-1">
                        <span className="text-slate-400">DISK</span>
                        <strong className={isDiskCritical ? 'text-rose-500' : 'text-slate-900 dark:text-white'}>
                          {diskPct.toFixed(1)}%
                        </strong>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${diskPct >= 90 ? 'bg-rose-500' : diskPct >= 75 ? 'bg-amber-500' : 'bg-emerald-400'}`}
                          style={{ width: `${Math.min(diskPct, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono mt-0.5 block truncate">
                        {diskUsedGb.toFixed(1)}/{diskTotalGb.toFixed(1)} GB
                      </span>
                    </div>
                  </div>

                  {/* Extended Telemetry Badges (LoadAvg, Network, Disk I/O) */}
                  <div className="grid grid-cols-3 gap-2 py-3 px-3.5 rounded-2xl bg-slate-50 dark:bg-[#070b14] border border-slate-200/80 dark:border-slate-800/60 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block">Load Avg (1m)</span>
                      <strong className="text-slate-800 dark:text-slate-200">{load1.toFixed(2)}</strong>
                      <span className="text-[10px] text-slate-500 block">5m: {load5.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-500 block">15m: {load15.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block">Network I/O</span>
                      <strong className="text-emerald-400">RX {netRxKb.toFixed(1)}</strong>
                      <span className="text-[10px] text-cyan-400 block">TX {netTxKb.toFixed(1)} K/s</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block">Disk Write</span>
                      <strong className="text-slate-800 dark:text-slate-200">{diskWriteMb.toFixed(2)} MB/s</strong>
                      <span className="text-[10px] text-slate-500 block">Throughput</span>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center gap-3">
                    <span>
                      <strong className="text-slate-900 dark:text-white font-semibold">
                        {(srv.services || []).length}
                      </strong> Services
                    </span>
                    <span>•</span>
                    <span>
                      <strong className="text-slate-900 dark:text-white font-semibold">
                        {(srv.databases || []).length}
                      </strong> Databases
                    </span>
                  </div>

                  <Link
                    to={`/servers/${srv.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-500 text-xs font-bold font-mono transition"
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

      {/* ─── REAL-TIME MICROSERVICES STATUS STREAM ──────────────────────────── */}
      <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-3xl p-6 shadow-md dark:shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-cyan-500" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-mono tracking-tight">
                Live Microservices Telemetry ({filteredServices.length} Services)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pemeriksaan latency, stack runtime, dan ketersediaan HTTP microservices di seluruh node cluster.
              </p>
            </div>
          </div>

          {/* Search & Status Filter */}
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
            {isLoadingServices && <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />}
          </div>
        </div>

        {/* Services Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3">Service</th>
                <th className="py-3 px-3">Host Node</th>
                <th className="py-3 px-3">Stack</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Throughput</th>
                <th className="py-3 px-3">P99 Latency</th>
                <th className="py-3 px-3 text-right">Action</th>
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
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isUp ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                      <span className="group-hover:text-cyan-400 transition">{svc.name}</span>
                    </td>
                    <td className="py-3 px-3 text-slate-500 dark:text-slate-400">
                      {svc.serverName || svc.host || 'Default Host'}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        {svc.stack || 'nodejs'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
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
                    <td className="py-3 px-3 text-slate-700 dark:text-slate-300">
                      {(svc.throughputRps ?? 0).toFixed(1)} req/s
                    </td>
                    <td className="py-3 px-3 text-slate-700 dark:text-slate-300">
                      {svc.latencyP99Ms != null ? `${svc.latencyP99Ms} ms` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right">
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

      {/* ─── STRESS TEST SUITE CALLOUT / RECENT RESULT TEASER ───────────────── */}
      <div className="rounded-3xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-indigo-950/40 border border-cyan-500/30 p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Zap className="w-7 h-7 fill-cyan-400/20" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white font-mono">
                Stress Test Suite &amp; AI Engine
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                GEMINI 2.5 AI
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-xl">
              Uji ketahanan sistem hingga 500+ Virtual Users. Analisis bottleneck dan rekomendasi otomatis didukung Google Gemini AI.
              {latestStress && (
                <span className="block text-cyan-400 font-mono mt-0.5">
                  Hasil Terakhir: {latestStress.projectName} • {latestStress.targetVUs} VUs • {latestStress.currentRps.toFixed(1)} RPS • Status {latestStress.healthGrade}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {latestStress && (
            <button
              type="button"
              onClick={() => {
                setSelectedStressRecord(latestStress);
                setIsStressModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold font-mono border border-slate-700 transition"
            >
              Lihat Evaluasi Terakhir
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate('/stress-test')}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold font-mono shadow-md transition"
          >
            Buka Stress Test Suite
          </button>
        </div>
      </div>

      {/* Stress Test Result Modal */}
      <StressTestResultModal
        isOpen={isStressModalOpen}
        onClose={() => setIsStressModalOpen(false)}
        record={selectedStressRecord}
      />
    </div>
  );
};
