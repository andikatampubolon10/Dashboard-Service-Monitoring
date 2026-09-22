import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useServerDetail } from '../../hooks/useServers';
import { useServices } from '../../hooks/useServices';
import { ErrorState } from '../../components/common/ErrorState';
import { CardSkeleton, ChartSkeleton } from '../../components/common/LoadingSkeleton';
import {
  Cpu,
  HardDrive,
  Clock,
  ArrowLeft,
  ShieldCheck,
  Database,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Server as ServerIcon,
  Activity,
  Wifi,
  Pencil,
  Trash2,
  Loader2,
  Radio,
  Gauge,
  ArrowDownUp,
} from 'lucide-react';
import {
  evaluateServerCompliance,
} from '../../utils/serverRules';
import { useUpdateServer, useDeleteServer, useServerUptimeHistory, useServerMetricsHistory } from '../../hooks/useServers';
import { Modal } from '../../components/common/Modal';

export const ServerDetailPage: React.FC = () => {
  const { id = 'server-alpha' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: server, isLoading, isError, refetch } = useServerDetail(id);
  const { data: allServices = [], isLoading: isLoadingServices } = useServices();

  const [chartMetric, setChartMetric] = useState<'cpu' | 'memory' | 'load' | 'network' | 'disk'>('cpu');
  const [metricsHistoryRange, setMetricsHistoryRange] = useState<'1h' | '6h' | '24h' | '7d'>('1h');
  const { data: dbMetricsHistory = [], isLoading: isLoadingDbHistory } = useServerMetricsHistory(id, metricsHistoryRange);

  const updateServerMutation = useUpdateServer();
  const deleteServerMutation = useDeleteServer();

  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    host: '',
    port: '22',
    env: 'PRODUCTION',
    region: 'jakarta-idc',
    description: '',
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleOpenEditModal = () => {
    if (!server) return;
    setEditFormData({
      name: server.name || '',
      host: server.host || server.ip || '',
      port: String(server.port || 22),
      env: server.env || 'PRODUCTION',
      region: server.region || 'jakarta-idc',
      description: server.description || '',
    });
    setEditError(null);
    setEditSuccess(null);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!server) return;
    if (!editFormData.name.trim() || !editFormData.host.trim()) {
      setEditError('Nama Server dan Host/IP wajib diisi.');
      return;
    }

    try {
      setEditError(null);
      setEditSuccess(null);
      await updateServerMutation.mutateAsync({
        id: server.id,
        payload: {
          name: editFormData.name.trim(),
          host: editFormData.host.trim(),
          port: parseInt(editFormData.port, 10) || 22,
          env: editFormData.env,
          region: editFormData.region,
          description: editFormData.description.trim(),
        },
      });
      setEditSuccess('Server berhasil diperbarui!');
      setTimeout(() => {
        setShowEditModal(false);
        setEditSuccess(null);
      }, 600);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Gagal memperbarui server');
    }
  };

  const handleDeleteSubmit = async () => {
    if (!server) return;
    try {
      setDeleteError(null);
      await deleteServerMutation.mutateAsync(server.id);
      setShowDeleteModal(false);
      navigate('/servers');
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Gagal menghapus server');
    }
  };

  // 1. Calculate System Resources (CPU, Memory, Disk, Uptime, Extended Telemetry)
  const sys = server?.system;
  const cpuPct = sys?.cpu?.usagePercent ?? server?.cpuUsagePercent ?? 0;
  const cpuCores = sys?.cpu?.cores ?? 2;

  const memUsedMb = sys?.memory?.usedMb ?? ((server?.memoryUsedBytes ?? 0) / (1024 * 1024));
  const memTotalMb = sys?.memory?.totalMb ?? ((server?.memoryTotalBytes ?? 0) / (1024 * 1024));
  const memPct = sys?.memory?.usedPercent ?? Math.round((memUsedMb / (memTotalMb || 1)) * 100);
  const ramUsedGb = (memUsedMb / 1024).toFixed(1);
  const ramTotGb = (memTotalMb / 1024).toFixed(1);

  const diskUsedGb = sys?.disk?.usedGb ?? ((server?.diskUsedBytes ?? 0) / (1024 * 1024 * 1024));
  const diskTotalGb = sys?.disk?.totalGb ?? ((server?.diskTotalBytes ?? 0) / (1024 * 1024 * 1024));
  const diskPct = sys?.disk?.usedPercent ?? Math.round((diskUsedGb / (diskTotalGb || 1)) * 100);
  const diskFreeGb = sys?.disk?.freeGb ?? Math.max(0, parseFloat((diskTotalGb - diskUsedGb).toFixed(1)));

  // Extended Telemetry from node_exporter
  const load1 = sys?.loadAverage?.load1 ?? 0;
  const load5 = sys?.loadAverage?.load5 ?? 0;
  const load15 = sys?.loadAverage?.load15 ?? 0;
  const netRxKb = sys?.network?.rxKbSec ?? 0;
  const netTxKb = sys?.network?.txKbSec ?? 0;
  const diskReadMb = sys?.disk?.readMbSec ?? 0;
  const diskWriteMb = sys?.disk?.writeMbSec ?? 0;
  const memCachedMb = sys?.memory?.cachedMb ?? 0;
  const memBuffersMb = sys?.memory?.buffersMb ?? 0;

  const uptimeFormatted = sys?.uptime?.formatted || server?.uptime || '4h';

  // 2. Extract and format Databases (Only real detected/configured databases, no fake fallbacks)
  const databasesList = (server?.databases && Array.isArray(server.databases))
    ? server.databases
    : [];
  const upDatabasesCount = databasesList.filter((d) => d.status === 'UP').length;
  const totalDatabasesCount = databasesList.length;

  // 3. Extract Services list on this host (Both UP and DOWN)
  const fullHostedServices = useMemo(() => {
    if (!server) return [];
    if (server.servicesData && server.servicesData.length > 0) {
      return server.servicesData.map((svc) => {
        const foundInAll = allServices.find((s) => s.id === svc.id);
        return {
          id: svc.id,
          name: svc.name,
          stack: svc.stack || foundInAll?.stack || 'nodejs',
          description: svc.description || foundInAll?.description || '',
          status: svc.status as 'UP' | 'DOWN',
          reqPerSecond: svc.reqPerSecond ?? foundInAll?.throughputRps ?? 0,
          errorRatePercent: svc.errorRatePercent ?? foundInAll?.errorRatePercent ?? 0,
          p99LatencyMs: svc.p99LatencyMs ?? foundInAll?.latencyP99Ms ?? 0,
          version: foundInAll?.version || 'v1.0.0',
        };
      });
    }

    // Fallback: match from allServices or hostedServices ids
    const hostServiceIds = server.hostedServices || [];
    return hostServiceIds.map((svcId) => {
      const found = allServices.find((s) => s.id === svcId);
      const isUp = found?.rawStatus === 'UP' || found?.status === 'healthy';
      return {
        id: svcId,
        name: found?.name || svcId,
        stack: found?.stack || 'nodejs',
        description: found?.description || 'Microservice container',
        status: (isUp ? 'UP' : 'DOWN') as 'UP' | 'DOWN',
        reqPerSecond: found?.throughputRps ?? 0,
        errorRatePercent: found?.errorRatePercent ?? 0,
        p99LatencyMs: found?.latencyP99Ms ?? 0,
        version: found?.version || 'v1.0.0',
      };
    });
  }, [server, allServices]);

  const upServicesCount = fullHostedServices.filter((s) => s.status === 'UP').length;
  const totalServicesCount = fullHostedServices.length;
  const maxCap = server?.maxCapacity || Math.max(totalServicesCount, 3);

  // Hosted services list as Service[] for compliance evaluator
  const hostedServicesForCompliance = useMemo(() => {
    if (!server) return [];
    return allServices.filter(
      (s) => s.serverId === id || Boolean(server.hostedServices?.includes(s.id))
    );
  }, [allServices, server, id]);

  // Evaluate Server Compliance
  const compliance = useMemo(() => {
    if (!server) return null;
    return evaluateServerCompliance(server, hostedServicesForCompliance);
  }, [server, hostedServicesForCompliance]);

  // Real Timeline History Data from PostgreSQL
  const chartHistory = useMemo(() => {
    if (dbMetricsHistory && dbMetricsHistory.length > 0) {
      return dbMetricsHistory.map((pt) => {
        const d = new Date(pt.timestamp);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        let value = 0;
        let secondaryValue: number | undefined = undefined;

        if (chartMetric === 'cpu') {
          value = pt.cpuPercent;
        } else if (chartMetric === 'memory') {
          value = pt.memUsedPercent;
        } else if (chartMetric === 'load') {
          value = pt.load1m;
          secondaryValue = pt.load5m;
        } else if (chartMetric === 'network') {
          value = pt.netRxKbSec;
          secondaryValue = pt.netTxKbSec;
        } else if (chartMetric === 'disk') {
          value = pt.diskWriteMbSec;
          secondaryValue = pt.diskReadMbSec;
        }

        return {
          timestamp: `${hh}:${mm}`,
          value,
          secondaryValue,
        };
      });
    }

    // Default curve if history is empty
    return Array.from({ length: 12 }, (_, i) => {
      const hh = String(i * 2).padStart(2, '0');
      let baseVal = cpuPct;
      if (chartMetric === 'memory') baseVal = memPct;
      else if (chartMetric === 'load') baseVal = load1;
      else if (chartMetric === 'network') baseVal = netRxKb;
      else if (chartMetric === 'disk') baseVal = diskWriteMb;

      return {
        timestamp: `${hh}:00`,
        value: baseVal,
      };
    });
  }, [dbMetricsHistory, chartMetric, cpuPct, memPct, load1, netRxKb, diskWriteMb]);

  const currentMetricVal = useMemo(() => {
    if (chartMetric === 'cpu') return cpuPct;
    if (chartMetric === 'memory') return memPct;
    if (chartMetric === 'load') return load1;
    if (chartMetric === 'network') return netRxKb;
    if (chartMetric === 'disk') return diskWriteMb;
    return 0;
  }, [chartMetric, cpuPct, memPct, load1, netRxKb, diskWriteMb]);

  const historyValues = chartHistory.map((h) => h.value);
  const avgVal = historyValues.length ? parseFloat((historyValues.reduce((a, b) => a + b, 0) / historyValues.length).toFixed(1)) : currentMetricVal;
  const maxVal = historyValues.length ? parseFloat(Math.max(...historyValues).toFixed(1)) : currentMetricVal;

  // ─── Uptime Timeline State & Calculations ─────────────────────────────────
  const [uptimeRange, setUptimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('1h');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  const uptimeRangeConfig = useMemo(() => {
    switch (uptimeRange) {
      case '6h':
        return { rangeSec: 21600, points: 36, label: '6 Jam Terakhir' };
      case '24h':
        return { rangeSec: 86400, points: 48, label: '24 Jam Terakhir' };
      case '7d':
        return { rangeSec: 604800, points: 56, label: '7 Hari Terakhir' };
      case '1h':
      default:
        return { rangeSec: 3600, points: 30, label: '1 Jam Terakhir' };
    }
  }, [uptimeRange]);

  const { data: uptimeHistoryRemote, isLoading: isLoadingUptime } = useServerUptimeHistory(
    id,
    uptimeRangeConfig.rangeSec,
    uptimeRangeConfig.points
  );

  const uptimePoints = useMemo(() => {
    if (uptimeHistoryRemote && uptimeHistoryRemote.length > 0) {
      return uptimeHistoryRemote;
    }
    if (server?.uptimeHistory && server.uptimeHistory.length > 0) {
      return server.uptimeHistory;
    }
    const count = uptimeRangeConfig.points;
    const isUp = server?.status === 'healthy' || server?.probeResult?.open !== false;
    return Array.from({ length: count }, (_, i) => {
      const timeBack = (count - 1 - i) * (uptimeRangeConfig.rangeSec / count) * 1000;
      const d = new Date(Date.now() - timeBack);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return {
        timestamp: d.toISOString(),
        time: `${hh}:${mm}`,
        displayTime: `${hh}:${mm}`,
        status: isUp ? 'UP' : 'DOWN',
        value: isUp ? 1 : 0,
        latencyMs: isUp ? (server?.probeResult?.latencyMs || 25) : null,
        details: isUp ? 'Host reachable (Port UP)' : 'Host unreachable (Port DOWN)',
      };
    });
  }, [uptimeHistoryRemote, server, uptimeRangeConfig]);

  const uptimeKpis = useMemo(() => {
    if (!uptimePoints.length) {
      return {
        currentStatus: (server?.status === 'critical' ? 'DOWN' : 'UP') as 'UP' | 'DOWN',
        slaPercent: '100.00',
        downCount: 0,
        totalPoints: 0,
        upPoints: 0,
        avgLatency: 0,
      };
    }
    const total = uptimePoints.length;
    const upPoints = uptimePoints.filter((p) => p.value === 1 || p.status === 'UP').length;
    const sla = ((upPoints / total) * 100).toFixed(2);
    const lastPoint = uptimePoints[uptimePoints.length - 1];
    const currentStatus = (lastPoint.value === 1 || lastPoint.status === 'UP') ? 'UP' : 'DOWN';

    let downIncidents = 0;
    for (let i = 0; i < uptimePoints.length; i++) {
      if ((uptimePoints[i].value === 0 || uptimePoints[i].status === 'DOWN') &&
          (i === 0 || (uptimePoints[i - 1].value === 1 || uptimePoints[i - 1].status === 'UP'))) {
        downIncidents++;
      }
    }

    const validLatencies = uptimePoints
      .map((p) => p.latencyMs)
      .filter((l): l is number => typeof l === 'number' && l > 0);
    const avgLatency = validLatencies.length
      ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length)
      : (server?.probeResult?.latencyMs || 0);

    return {
      currentStatus,
      slaPercent: sla,
      downCount: downIncidents,
      totalPoints: total,
      upPoints,
      avgLatency,
    };
  }, [uptimePoints, server]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Loading Header Skeleton */}
        <div className="space-y-2 animate-pulse">
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-48" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
            <div className="h-9 bg-slate-200 dark:bg-slate-800 rounded w-72" />
            <div className="h-9 bg-slate-200 dark:bg-slate-800 rounded w-36" />
          </div>
        </div>

        {/* 5 Metric Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>

        {/* Telemetry Chart Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ChartSkeleton height="h-80" />
          </div>
          <div>
            <CardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !server) {
    return (
      <ErrorState
        title="Server Node Tidak Ditemukan"
        message={`Tidak dapat memuat informasi infrastruktur untuk server id "${id}"`}
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── BREADCRUMBS & HEADER ────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-slate-400">
          <Link to="/overview" className="hover:text-cyan-500 hover:underline transition">
            Overview
          </Link>
          <span>&gt;</span>
          <Link to="/servers" className="hover:text-cyan-500 hover:underline transition">
            Servers
          </Link>
          <span>&gt;</span>
          <span className="text-slate-800 dark:text-slate-200 font-semibold font-mono">
            {server.id}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
                {server.displayName || server.name}
              </h1>

              {/* Status Server Running Badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                  server.status === 'critical'
                    ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                    : server.status === 'degraded' || server.status === 'warning'
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    server.status === 'critical'
                      ? 'bg-rose-500 animate-pulse'
                      : server.status === 'degraded' || server.status === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                />
                <span className="capitalize">{server.status}</span>
              </span>

              {/* Host Engine Status Indicator */}
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Wifi className="w-3 h-3 text-emerald-500" />
                <span>HOST RUNNING</span>
              </span>

              {/* Compliance Pill */}
              {compliance && (
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                    compliance.status === 'violation'
                      ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/25'
                      : compliance.status === 'warning'
                      ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/25'
                      : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>
                    {compliance.status === 'violation'
                      ? 'Aturan: Melanggar'
                      : compliance.status === 'warning'
                      ? 'Aturan: Peringatan'
                      : 'Aturan: Lolos Sesuai SOP'}
                  </span>
                </span>
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
              {server.os || 'Ubuntu 22.04 LTS (Docker Engine Host)'} &bull; host: <strong className="font-normal text-slate-800 dark:text-cyan-400">{server.host || server.ip || 'localhost'}</strong> &bull; Region: {server.region || 'jakarta-idc'}
            </p>
          </div>

          <div className="self-start sm:self-center flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleOpenEditModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-cyan-500 hover:text-cyan-500 transition shadow-sm"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit Server</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setShowDeleteModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:border-rose-500/30 transition shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Server</span>
            </button>

            <Link
              to="/servers"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:text-white transition shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>All Servers</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ─── 8 TELEMETRY CARDS: CPU, MEMORY, DISK, LOAD AVG, NET I/O, DISK I/O, UPTIME, DATABASES ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading || !server ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            {/* 1. CPU Card */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  CPU USAGE
                </span>
                <Cpu className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
                  {cpuPct.toFixed(1)}<span className="text-lg font-normal text-slate-400">%</span>
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  {cpuCores} Cores Physical/VCPU
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      cpuPct >= 85 ? 'bg-rose-500' : cpuPct >= 65 ? 'bg-amber-500' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${Math.min(cpuPct, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 2. MEMORY Card */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  MEMORY (RAM)
                </span>
                <HardDrive className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
                  {memPct.toFixed(1)}<span className="text-lg font-normal text-slate-400">%</span>
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5 flex justify-between">
                  <span>{ramUsedGb} / {ramTotGb} GB</span>
                  {(memCachedMb > 0 || memBuffersMb > 0) && <span>Cached: {memCachedMb + memBuffersMb} MB</span>}
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      memPct >= 85 ? 'bg-rose-500' : memPct >= 70 ? 'bg-amber-500' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${Math.min(memPct, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 3. DISK Card */}
            <div className={`bg-white dark:bg-[#0e1424]/90 border ${diskPct >= 90 ? 'border-rose-500/50 shadow-rose-500/10' : 'border-slate-200 dark:border-slate-800/90'} rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between relative`}>
              {diskPct >= 90 && (
                <span className="absolute top-3 right-3 px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-rose-500/15 text-rose-500 border border-rose-500/30 animate-pulse">
                  CRITICAL
                </span>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  DISK STORAGE (ROOT /)
                </span>
                <Database className={`w-4 h-4 ${diskPct >= 90 ? 'text-rose-500' : 'text-cyan-500 dark:text-cyan-400'}`} />
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
                  {diskPct.toFixed(1)}<span className="text-lg font-normal text-slate-400">%</span>
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5 flex justify-between">
                  <span>{diskUsedGb} / {diskTotalGb} GB</span>
                  <span className="text-emerald-500">Free: {diskFreeGb} GB</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      diskPct >= 90 ? 'bg-rose-500' : diskPct >= 75 ? 'bg-amber-500' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${Math.min(diskPct, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 4. LOAD AVERAGE Card */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  LOAD AVERAGE
                </span>
                <Gauge className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
                  {load1.toFixed(2)}
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                  <span>5m: <strong className="text-slate-200">{load5.toFixed(2)}</strong></span>
                  <span>15m: <strong className="text-slate-200">{load15.toFixed(2)}</strong></span>
                </div>
                <div className="text-[11px] font-mono mt-3 text-slate-400">
                  {load1 > cpuCores ? (
                    <span className="text-amber-400 font-semibold">⚠️ Load &gt; CPU Cores</span>
                  ) : (
                    <span className="text-emerald-400 font-semibold">Normal Overhead</span>
                  )}
                </div>
              </div>
            </div>

            {/* 5. NETWORK I/O Card */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  NETWORK I/O
                </span>
                <Wifi className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
                  {(netRxKb + netTxKb).toFixed(1)}<span className="text-base font-normal text-slate-400"> KB/s</span>
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center justify-between">
                  <span>RX: <strong className="text-emerald-400">{netRxKb.toFixed(1)} KB/s</strong></span>
                  <span>TX: <strong className="text-cyan-400">{netTxKb.toFixed(1)} KB/s</strong></span>
                </div>
                <div className="text-[11px] font-mono mt-3 text-emerald-400 font-semibold flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  <span>Interface Active</span>
                </div>
              </div>
            </div>

            {/* 6. DISK I/O Card */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  DISK I/O RATE
                </span>
                <ArrowDownUp className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
                  {(diskReadMb + diskWriteMb).toFixed(2)}<span className="text-base font-normal text-slate-400"> MB/s</span>
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center justify-between">
                  <span>Write: <strong className="text-cyan-400">{diskWriteMb.toFixed(2)} MB/s</strong></span>
                  <span>Read: <strong className="text-emerald-400">{diskReadMb.toFixed(2)} MB/s</strong></span>
                </div>
                <div className="text-[11px] font-mono mt-3 text-slate-400">
                  Storage Throughput Active
                </div>
              </div>
            </div>

            {/* 7. UPTIME Card */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  HOST UPTIME
                </span>
                <Clock className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
                  {uptimeFormatted}
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  Docker Engine &amp; SSH Active
                </div>
                <div className="text-[11px] text-emerald-500 dark:text-emerald-400 font-semibold font-mono mt-3 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Daemon Healthy</span>
                </div>
              </div>
            </div>

            {/* 8. DATABASES Card */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  DATABASES ONLINE
                </span>
                <ServerIcon className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
                  {upDatabasesCount} / {totalDatabasesCount}
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  Postgres, Redis, MongoDB
                </div>
                <div className="text-[11px] text-slate-400 font-mono mt-3">
                  {upDatabasesCount === totalDatabasesCount && totalDatabasesCount > 0 ? (
                    <span className="text-emerald-400 font-semibold">Semua DB Running</span>
                  ) : totalDatabasesCount === 0 ? (
                    <span className="text-slate-400 font-semibold">No Local Databases</span>
                  ) : (
                    <span className="text-rose-400 font-semibold">{totalDatabasesCount - upDatabasesCount} DB Offline</span>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── DATABASE INSTANCES & RUNNING STATUS SECTION ─────────────────────── */}
      <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-cyan-500" />
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Database Instances &amp; Connectivity Status ({upDatabasesCount}/{totalDatabasesCount} UP)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pemeriksaan koneksi soket real-time ke database yang melayani service di host {server.displayName || server.name}
              </p>
            </div>
          </div>
          {totalDatabasesCount === 0 ? (
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold border bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/25">
              NO DATABASES DETECTED
            </span>
          ) : (
            <span
              className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                upDatabasesCount === totalDatabasesCount
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25'
              }`}
            >
              {upDatabasesCount === totalDatabasesCount ? 'ALL DATABASES RUNNING' : 'DATABASE ATTENTION NEEDED'}
            </span>
          )}
        </div>

        {/* Database Grid or Honest Empty State */}
        {totalDatabasesCount === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-slate-500 dark:text-slate-400 text-xs font-sans">
            Tidak ada instance database (PostgreSQL, Redis, MySQL, MongoDB) yang terdaftar atau aktif pada host server ini.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {databasesList.map((db) => {
            const isUp = db.status === 'UP';
            return (
              <div
                key={db.id ? `${db.id}-${db.port}` : `${db.name}-${db.port}`}
                className={`p-4 rounded-xl border transition ${
                  isUp
                    ? 'bg-slate-50 dark:bg-[#0a101d] border-emerald-500/30 shadow-sm'
                    : 'bg-rose-50/50 dark:bg-[#1a0f14] border-rose-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        isUp
                          ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                          : 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]'
                      }`}
                    />
                    <strong className="text-sm font-bold text-slate-900 dark:text-white">
                      {db.name}
                    </strong>
                    {db.containerName && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        {db.containerName}
                      </span>
                    )}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${
                      isUp
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25'
                        : 'bg-rose-500/10 text-rose-500 border-rose-500/25'
                    }`}
                  >
                    {isUp ? 'RUNNING' : 'STOPPED'}
                  </span>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400">
                  <span>
                    Host: <span className="text-slate-700 dark:text-slate-200">{db.host}:{db.port}</span>
                  </span>
                  <span>
                    Latency: {db.latencyMs != null ? (
                      <span className="text-emerald-500 font-bold">{db.latencyMs} ms</span>
                    ) : (
                      <span className="text-rose-400 font-bold">Offline</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* ─── SERVER UPTIME & DOWNTIME STATUS TIMELINE (MENYALA / MATI) ───────── */}
      <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-5">
        {/* Header with Title and Range Selectors */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20 text-emerald-500 dark:text-emerald-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Timeline Ketersediaan & Status Server (Menyala / Mati)
                </h2>
                {isLoadingUptime && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Histori status host menyala (1 = UP) vs mati (0 = DOWN) server {server.displayName || server.name} berdasarkan probe berkala
              </p>
            </div>
          </div>

          {/* Time Range Selector Buttons */}
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1 border border-slate-200 dark:border-slate-700/60 text-xs font-mono self-start sm:self-auto">
            {(['1h', '6h', '24h', '7d'] as const).map((rangeKey) => {
              const labels: Record<string, string> = {
                '1h': '1 Jam',
                '6h': '6 Jam',
                '24h': '24 Jam',
                '7d': '7 Hari',
              };
              const isActive = uptimeRange === rangeKey;
              return (
                <button
                  key={rangeKey}
                  onClick={() => setUptimeRange(rangeKey)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                    isActive
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {labels[rangeKey]}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4 KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Status Terkini */}
          <div className={`p-3.5 rounded-xl border font-mono transition ${
            uptimeKpis.currentStatus === 'UP'
              ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/50'
              : 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-800/50'
          }`}>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block font-sans font-medium">
              Status Terkini
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2.5 h-2.5 rounded-full ${
                uptimeKpis.currentStatus === 'UP' ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'
              }`} />
              <span className={`text-base font-bold ${
                uptimeKpis.currentStatus === 'UP' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}>
                {uptimeKpis.currentStatus === 'UP' ? 'MENYALA (UP)' : 'MATI (DOWN)'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {uptimeKpis.currentStatus === 'UP' ? `Latency: ~${uptimeKpis.avgLatency} ms` : 'Host tidak merespon'}
            </div>
          </div>

          {/* Card 2: Uptime SLA */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0a0f1d] border border-slate-200/80 dark:border-slate-800/60 font-mono">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block font-sans font-medium">
              Uptime SLA ({uptimeRangeConfig.label})
            </span>
            <div className="text-lg font-bold text-slate-900 dark:text-white mt-1 flex items-center gap-1.5">
              <span>{uptimeKpis.slaPercent}%</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 font-semibold">
                Online
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {uptimeKpis.upPoints} dari {uptimeKpis.totalPoints} titik aktif
            </div>
          </div>

          {/* Card 3: Insiden Mati (Downtime) */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0a0f1d] border border-slate-200/80 dark:border-slate-800/60 font-mono">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block font-sans font-medium">
              Insiden Mati (Downtime)
            </span>
            <div className={`text-lg font-bold mt-1 ${
              uptimeKpis.downCount === 0 ? 'text-slate-900 dark:text-white' : 'text-rose-500 dark:text-rose-400'
            }`}>
              {uptimeKpis.downCount} Kali
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {uptimeKpis.downCount === 0 ? 'Koneksi stabil tanpa jeda' : 'Terdeteksi downtime'}
            </div>
          </div>

          {/* Card 4: Total Durasi Menyala */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0a0f1d] border border-slate-200/80 dark:border-slate-800/60 font-mono">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block font-sans font-medium">
              Total Durasi Berjalan
            </span>
            <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
              {uptimeFormatted}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Continuous uptime server
            </div>
          </div>
        </div>

        {/* Interactive Step-Line Uptime Chart */}
        <div className="relative pt-2">
          {/* Active Hover Tooltip Popover if point hovered */}
          {hoveredPointIndex !== null && uptimePoints[hoveredPointIndex] && (
            <div
              className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-full bg-slate-900/95 dark:bg-slate-900/95 text-white backdrop-blur-md border border-slate-700/80 rounded-xl px-3 py-2 text-xs shadow-xl font-mono"
              style={{
                left: `${95 + (uptimePoints.length > 1 ? (hoveredPointIndex / (uptimePoints.length - 1)) * 650 : 325)}px`,
                top: uptimePoints[hoveredPointIndex].value === 1 ? '30px' : '115px',
              }}
            >
              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                <span className={`w-2 h-2 rounded-full ${
                  uptimePoints[hoveredPointIndex].value === 1 ? 'bg-emerald-400' : 'bg-rose-500'
                }`} />
                <span>
                  {uptimePoints[hoveredPointIndex].value === 1 ? '1 - MENYALA (UP)' : '0 - MATI (DOWN)'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Waktu: <span className="text-slate-200">{uptimePoints[hoveredPointIndex].time || uptimePoints[hoveredPointIndex].displayTime}</span>
              </div>
              {uptimePoints[hoveredPointIndex].latencyMs != null && (
                <div className="text-[11px] text-slate-400">
                  Respon: <span className="text-emerald-400 font-bold">{uptimePoints[hoveredPointIndex].latencyMs} ms</span>
                </div>
              )}
              {uptimePoints[hoveredPointIndex].details && (
                <div className="text-[10px] text-slate-400 mt-0.5 italic">
                  {uptimePoints[hoveredPointIndex].details}
                </div>
              )}
            </div>
          )}

          <div className="h-48 w-full">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 760 170" preserveAspectRatio="none">
              <defs>
                <linearGradient id="uptimeGreenGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="uptimeRedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Reference Level Lines */}
              {/* Level 1: UP / MENYALA */}
              <g>
                <line
                  x1="90"
                  y1="40"
                  x2="745"
                  y2="40"
                  stroke="#10b981"
                  strokeWidth="0.75"
                  strokeDasharray="4 4"
                  opacity="0.35"
                />
                <rect x="2" y="27" width="82" height="24" rx="6" fill="#10b981" fillOpacity="0.12" stroke="#10b981" strokeWidth="1" strokeOpacity="0.3" />
                <text x="43" y="43" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#10b981" fontFamily="monospace">
                  1 • MENYALA
                </text>
              </g>

              {/* Level 0: DOWN / MATI */}
              <g>
                <line
                  x1="90"
                  y1="125"
                  x2="745"
                  y2="125"
                  stroke="#f43f5e"
                  strokeWidth="0.75"
                  strokeDasharray="4 4"
                  opacity="0.35"
                />
                <rect x="2" y="113" width="82" height="24" rx="6" fill="#f43f5e" fillOpacity="0.12" stroke="#f43f5e" strokeWidth="1" strokeOpacity="0.3" />
                <text x="43" y="129" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#f43f5e" fontFamily="monospace">
                  0 • MATI
                </text>
              </g>

              {/* Area & Step Line */}
              {uptimePoints.length > 0 && (() => {
                const startX = 95;
                const chartW = 650;
                const yUp = 40;
                const yDown = 125;
                const n = uptimePoints.length;

                let linePath = '';
                for (let i = 0; i < n; i++) {
                  const curX = startX + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
                  const isCurUp = uptimePoints[i].value === 1 || uptimePoints[i].status === 'UP';
                  const curY = isCurUp ? yUp : yDown;

                  if (i === 0) {
                    linePath = `M ${curX},${curY}`;
                  } else {
                    const prevUp = uptimePoints[i - 1].value === 1 || uptimePoints[i - 1].status === 'UP';
                    const prevY = prevUp ? yUp : yDown;
                    // Stepped connection: horizontal to current X, then vertical to current Y
                    linePath += ` L ${curX},${prevY} L ${curX},${curY}`;
                  }
                }

                const lastX = startX + (n > 1 ? chartW : chartW / 2);
                const areaPath = `${linePath} L ${lastX},${yDown} L ${startX},${yDown} Z`;

                return (
                  <g>
                    {/* Area Fill */}
                    <path d={areaPath} fill="url(#uptimeGreenGradient)" />

                    {/* Step Line */}
                    <path
                      d={linePath}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Vertical guideline on hover */}
                    {hoveredPointIndex !== null && (
                      <line
                        x1={startX + (n > 1 ? (hoveredPointIndex / (n - 1)) * chartW : chartW / 2)}
                        y1="25"
                        x2={startX + (n > 1 ? (hoveredPointIndex / (n - 1)) * chartW : chartW / 2)}
                        y2="140"
                        stroke="#94a3b8"
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                        opacity="0.75"
                      />
                    )}

                    {/* Interactive dots */}
                    {uptimePoints.map((pt, i) => {
                      const cx = startX + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
                      const isPtUp = pt.value === 1 || pt.status === 'UP';
                      const cy = isPtUp ? yUp : yDown;
                      const isHovered = hoveredPointIndex === i;

                      return (
                        <g
                          key={i}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredPointIndex(i)}
                          onMouseLeave={() => setHoveredPointIndex(null)}
                        >
                          {/* Invisible larger hover trigger area */}
                          <circle cx={cx} cy={cy} r="10" fill="transparent" />

                          {/* Rendered Dot */}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isHovered ? 6 : 3.5}
                            className={`transition-all duration-150 ${
                              isPtUp
                                ? 'fill-emerald-400 stroke-slate-900 dark:stroke-[#0e1424] stroke-2'
                                : 'fill-rose-500 stroke-slate-900 dark:stroke-[#0e1424] stroke-2'
                            }`}
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })()}

              {/* X-Axis Ticks & Timestamps */}
              {uptimePoints.length > 0 && (() => {
                const startX = 95;
                const chartW = 650;
                const n = uptimePoints.length;
                // Pick 5-6 evenly spaced points for labels
                const labelCount = Math.min(6, n);
                const stepIdx = Math.max(1, Math.floor((n - 1) / (labelCount - 1)));
                const indices = [];
                for (let i = 0; i < n; i += stepIdx) {
                  indices.push(i);
                }
                if (indices[indices.length - 1] !== n - 1) {
                  indices.push(n - 1);
                }

                return (
                  <g>
                    {indices.map((idx) => {
                      const pt = uptimePoints[idx];
                      if (!pt) return null;
                      const x = startX + (n > 1 ? (idx / (n - 1)) * chartW : chartW / 2);
                      const timeLabel = pt.time || pt.displayTime || pt.timestamp?.slice(11, 16) || '';
                      return (
                        <g key={idx}>
                          <line x1={x} y1="130" x2={x} y2="135" stroke="#64748b" strokeWidth="1" opacity="0.6" />
                          <text
                            x={x}
                            y="150"
                            textAnchor="middle"
                            fontSize="10"
                            fill="#94a3b8"
                            fontFamily="monospace"
                          >
                            {timeLabel}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })()}
            </svg>
          </div>

          {/* Chart Subtext / Footnote */}
          <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/60 mt-1">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                Nilai 1: Host Menyala (Port Aktif / TCP Reachable)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                Nilai 0: Host Mati (Koneksi Terputus / Down)
              </span>
            </div>
            <span className="mt-1 sm:mt-0 text-slate-400 dark:text-slate-500">
              Rentang: {uptimeRangeConfig.label} ({uptimePoints.length} Titik Sampel)
            </span>
          </div>
        </div>
      </div>

      {/* ─── RESOURCE PERFORMANCE TIMELINE CHARTS (LIKE SERVICE DETAIL) ──────── */}
      <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-500" />
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Host Resource Performance Timeline
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tren utilisasi resource server {server.displayName || server.name} sepanjang waktu operasional
              </p>
            </div>
          </div>

          {/* Time Range Selector & Metric Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1 border border-slate-200 dark:border-slate-700/60 text-xs font-mono">
              {(['1h', '6h', '24h', '7d'] as const).map((r) => {
                const labels: Record<string, string> = { '1h': '1 Jam', '6h': '6 Jam', '24h': '24 Jam', '7d': '7 Hari' };
                return (
                  <button
                    key={r}
                    onClick={() => setMetricsHistoryRange(r)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                      metricsHistoryRange === r ? 'bg-cyan-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-white'
                    }`}
                  >
                    {labels[r]}
                  </button>
                );
              })}
            </div>
            {isLoadingDbHistory && <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />}
          </div>
        </div>

        {/* Metric Selector Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
          {[
            { id: 'cpu', label: 'CPU Usage (%)' },
            { id: 'memory', label: 'Memory Usage (%)' },
            { id: 'load', label: 'Load Average (1m)' },
            { id: 'network', label: 'Network I/O (KB/s)' },
            { id: 'disk', label: 'Disk I/O (MB/s)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setChartMetric(tab.id as typeof chartMetric)}
              className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition border ${
                chartMetric === tab.id
                  ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-500 dark:text-cyan-400'
                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/40 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Chart Stats Summary */}
        <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#0a0f1d] border border-slate-200/80 dark:border-slate-800/60 font-mono text-center">
          <div>
            <span className="text-[11px] text-slate-400 uppercase">Current</span>
            <div className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
              {currentMetricVal.toFixed(1)} {chartMetric === 'network' ? 'KB/s' : chartMetric === 'disk' ? 'MB/s' : chartMetric === 'load' ? '' : '%'}
            </div>
          </div>
          <div>
            <span className="text-[11px] text-slate-400 uppercase">Average</span>
            <div className="text-lg font-bold text-cyan-500 dark:text-cyan-400 mt-0.5">
              {avgVal} {chartMetric === 'network' ? 'KB/s' : chartMetric === 'disk' ? 'MB/s' : chartMetric === 'load' ? '' : '%'}
            </div>
          </div>
          <div>
            <span className="text-[11px] text-slate-400 uppercase">Peak</span>
            <div className="text-lg font-bold text-amber-500 dark:text-amber-400 mt-0.5">
              {maxVal} {chartMetric === 'network' ? 'KB/s' : chartMetric === 'disk' ? 'MB/s' : chartMetric === 'load' ? '' : '%'}
            </div>
          </div>
        </div>

        {/* SVG Area / Line Chart */}
        <div className="h-56 w-full pt-4">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 700 180" preserveAspectRatio="none">
            <defs>
              <linearGradient id="resourceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Dynamic Grid lines */}
            {(() => {
              const yMax = Math.max(1, chartMetric === 'cpu' || chartMetric === 'memory' ? 100 : Math.ceil(maxVal * 1.25) || 10);
              const steps = [0, 0.25, 0.5, 0.75, 1];
              const unit = chartMetric === 'network' ? ' KB/s' : chartMetric === 'disk' ? ' MB/s' : chartMetric === 'load' ? '' : '%';

              return steps.map((frac) => {
                const val = Math.round(frac * yMax);
                const y = 160 - frac * 140;
                return (
                  <g key={frac}>
                    <line x1="0" y1={y} x2="700" y2={y} stroke="#334155" strokeWidth="0.75" strokeDasharray="3 3" opacity="0.4" />
                    <text x="695" y={y - 3} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="monospace">
                      {val}{unit}
                    </text>
                  </g>
                );
              });
            })()}

            {/* Area Path */}
            {chartHistory.length > 1 && (() => {
              const yMax = Math.max(1, chartMetric === 'cpu' || chartMetric === 'memory' ? 100 : Math.ceil(maxVal * 1.25) || 10);
              const step = 700 / (chartHistory.length - 1);
              const points = chartHistory.map((pt, i) => {
                const x = i * step;
                const ratio = Math.min(pt.value / yMax, 1);
                const y = 160 - ratio * 140;
                return `${x},${y}`;
              });

              return (
                <>
                  <path d={`M ${points.join(' L ')} L 700,160 L 0,160 Z`} fill="url(#resourceGradient)" />
                  <path d={`M ${points.join(' L ')}`} fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" />
                  {chartHistory.map((pt, i) => {
                    const x = i * step;
                    const ratio = Math.min(pt.value / yMax, 1);
                    const y = 160 - ratio * 140;
                    return (
                      <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r="3.5"
                        className="fill-cyan-400 stroke-slate-900 dark:stroke-[#0e1424] stroke-2 hover:r-5 transition-all cursor-pointer"
                      >
                        <title>{`${pt.timestamp}: ${pt.value} ${chartMetric === 'network' ? 'KB/s' : chartMetric === 'disk' ? 'MB/s' : '%'}`}</title>
                      </circle>
                    );
                  })}
                </>
              );
            })()}
          </svg>
        </div>
      </div>

      {/* ─── SERVICES CURRENTLY ON THIS HOST (CLICKABLE TO SERVICE DETAIL) ──── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Services yang Ada di Server ini ({upServicesCount} / {totalServicesCount} UP)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Klik pada baris service untuk langsung beralih ke halaman detail monitoring service tersebut
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Kapasitas Host: {maxCap} Slots
          </span>
        </div>

        <div className="space-y-2.5">
          {isLoadingServices ? (
            <CardSkeleton />
          ) : fullHostedServices.length === 0 ? (
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-xl p-8 text-center text-slate-400 font-mono text-xs">
              Belum ada microservice yang dijadwalkan pada host server ini.
            </div>
          ) : (
            fullHostedServices.map((svc) => {
              const isUp = svc.status === 'UP';
              const isGo = (svc.stack || '').toLowerCase().includes('go');
              const rps = svc.reqPerSecond != null ? `${svc.reqPerSecond} req/s` : '0 req/s';
              const lat = svc.p99LatencyMs != null ? `p99 ${svc.p99LatencyMs}ms` : 'p99 0ms';
              const err = svc.errorRatePercent != null ? `${svc.errorRatePercent}% err` : '0% err';

              return (
                <div
                  key={svc.id}
                  onClick={() => navigate(`/services/${svc.id}`)}
                  className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 hover:border-cyan-500/50 dark:hover:border-cyan-500/50 rounded-xl p-4 shadow-sm dark:shadow-lg transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                  title={`Buka detail monitoring service ${svc.name}`}
                >
                  {/* Left: Indicator, Name & Description */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <span
                      className={`w-3 h-3 rounded-full shrink-0 transition-all ${
                        isUp
                          ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                          : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                      }`}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-cyan-400 transition truncate">
                          {svc.name}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider ${
                            isGo
                              ? 'bg-cyan-50 dark:bg-[#0e2238] text-cyan-600 dark:text-[#38bdf8] border border-cyan-200 dark:border-[#38bdf8]/30'
                              : 'bg-emerald-50 dark:bg-[#0d2a22] text-emerald-600 dark:text-[#10b981] border border-emerald-200 dark:border-[#10b981]/30'
                          }`}
                        >
                          {isGo ? 'GO' : 'NODE.JS'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                        {svc.description || 'Microservice container hosted instance'}
                      </div>
                    </div>
                  </div>

                  {/* Right: Real Telemetry, Status Badge & Arrow Navigation */}
                  <div className="flex items-center gap-4 sm:gap-6 font-mono text-right shrink-0">
                    <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{rps}</span>
                      <span>{lat}</span>
                      <span>{err}</span>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${
                        isUp
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25'
                          : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/25'
                      }`}
                    >
                      {svc.status}
                    </span>

                    <span className="text-slate-400 group-hover:text-cyan-400 group-hover:translate-x-1 transition font-bold text-base">
                      &rarr;
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── ATURAN PENEMPATAN & EVALUASI KEPATUHAN HOST ──────────────────────── */}
      {compliance && (
        <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-500" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                Status Kepatuhan Aturan Penempatan Host ({server.displayName || server.name})
              </h2>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded text-[11px] font-bold font-mono ${
                compliance.isCompliant
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
              }`}
            >
              {compliance.isCompliant ? 'SEMUA ATURAN TERPENUHI' : 'DITEMUKAN PELANGGARAN ATURAN'}
            </span>
          </div>

          {/* 5 Rules Breakdown Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {compliance.rulesEvaluated.map((rule) => {
              const isPassed = rule.passed;
              const isWarning = !isPassed && rule.severity === 'warning';
              return (
                <div
                  key={rule.ruleId}
                  className={`p-3 rounded-xl border text-xs font-mono space-y-1 ${
                    isPassed
                      ? 'bg-slate-50 dark:bg-[#0a0f1d] border-slate-200 dark:border-slate-800/80'
                      : isWarning
                      ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-500/30 text-amber-700 dark:text-amber-300'
                      : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-500/30 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold">
                      {isPassed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : isWarning ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-500" />
                      )}
                      <span className="text-slate-800 dark:text-slate-200">{rule.title}</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold opacity-75">
                      {isPassed ? 'OK' : rule.severity}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans leading-relaxed">
                    {rule.message}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── MODAL: EDIT KONFIGURASI SERVER ───────────────────────────────── */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          if (!updateServerMutation.isPending) {
            setShowEditModal(false);
            setEditError(null);
            setEditSuccess(null);
          }
        }}
        title={
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Pencil className="w-5 h-5 text-cyan-500" />
            <span>Edit Konfigurasi Server: {server?.name}</span>
          </div>
        }
        subtitle="Perbarui nama server, host IP, port inspeksi, region, atau deskripsi."
        maxWidth="xl"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4 text-xs font-mono">
          {editError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-400 flex items-center gap-2 font-sans">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          {editSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-400 flex items-center gap-2 font-sans">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{editSuccess}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
              Nama Server / Node *
            </label>
            <input
              type="text"
              required
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm font-sans"
              placeholder="e.g. AWS-Ubuntu-Server-1"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                IP Address / Host Target *
              </label>
              <input
                type="text"
                required
                value={editFormData.host}
                onChange={(e) => setEditFormData({ ...editFormData, host: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                placeholder="192.168.1.50 atau domain"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                Port Target / SSH
              </label>
              <input
                type="number"
                value={editFormData.port}
                onChange={(e) => setEditFormData({ ...editFormData, port: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                placeholder="22 / 9100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                Environment
              </label>
              <select
                value={editFormData.env}
                onChange={(e) => setEditFormData({ ...editFormData, env: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
              >
                <option value="PRODUCTION">PRODUCTION</option>
                <option value="STAGING">STAGING</option>
                <option value="DEVELOPMENT">DEVELOPMENT</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                Region / Lokasi
              </label>
              <input
                type="text"
                value={editFormData.region}
                onChange={(e) => setEditFormData({ ...editFormData, region: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                placeholder="jakarta-idc / ap-southeast-1"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
              Deskripsi Server
            </label>
            <input
              type="text"
              value={editFormData.description}
              onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
              className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm font-sans"
              placeholder="e.g. Server hosting Docker containers"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={updateServerMutation.isPending}
              onClick={() => setShowEditModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={updateServerMutation.isPending || !editFormData.name.trim() || !editFormData.host.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold font-mono transition shadow-sm shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updateServerMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <span>Simpan Perubahan</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL: HAPUS SERVER CONFIRMATION ─────────────────────────────── */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          if (!deleteServerMutation.isPending) {
            setShowDeleteModal(false);
            setDeleteError(null);
          }
        }}
        title={
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <Trash2 className="w-5 h-5 text-rose-500" />
            <span>Hapus Server dari Monitoring</span>
          </div>
        }
        subtitle="Konfirmasi pencopotan server node dari sistem pemantauan."
        maxWidth="md"
      >
        <div className="space-y-4 text-xs font-sans">
          {deleteError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-400 flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{deleteError}</span>
            </div>
          )}

          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 space-y-2">
            <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
              Apakah Anda yakin ingin menghapus server <strong>{server?.name}</strong> ({server?.host || server?.ip}) dari monitoring?
            </p>
            <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
              Semua microservice yang terikat pada server ini akan otomatis dibersihkan dari dashboard agar tidak menampilkan status Down/Unreachable palsu.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 font-mono">
            <button
              type="button"
              disabled={deleteServerMutation.isPending}
              onClick={() => setShowDeleteModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={deleteServerMutation.isPending}
              onClick={handleDeleteSubmit}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm shadow-rose-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleteServerMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menghapus Server...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Ya, Hapus Server</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
