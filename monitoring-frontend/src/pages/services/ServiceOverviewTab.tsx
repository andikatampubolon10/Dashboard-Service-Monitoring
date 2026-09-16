import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useServiceDetail } from '../../hooks/useServices';
import { useServiceDailyRequests } from '../../hooks/useServiceDailyRequests';
import { useServiceCharts } from '../../hooks/useServiceCharts';
import { useServiceEndpoints } from '../../hooks/useServiceEndpoints';
import { useServiceRequests } from '../../hooks/useServiceRequests';
import { LineChart, LineSeriesConfig } from '../../components/charts/LineChart';
import { ChartSkeleton } from '../../components/common/LoadingSkeleton';
import { Modal } from '../../components/common/Modal';
import { monitoringApi } from '../../services/monitoringApi';
import { formatNumber, formatRps } from '../../utils/formatters';
import {
  Activity,
  Radio,
  Network,
  Clock,
  AlertTriangle,
  Search,
  ArrowUpRight,
  Database,
  Copy,
  Check,
  Zap,
  TrendingUp,
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
} from 'lucide-react';

export const ServiceOverviewTab: React.FC = () => {
  const { id = 'ai-consultation' } = useParams<{ id: string }>();
  
  // 1. Service Detail (snapshot metrics)
  const { data: service, refetch: refetchService, isFetching: isFetchingService } = useServiceDetail(id);
  
  // 2. Daily Requests (14-day history or hourly timeline)
  const [granularity, setGranularity] = useState<'hourly' | 'daily'>('daily');
  const { data: dailyRequestsQuery = [], isLoading: isLoadingDaily } = useServiceDailyRequests(id, granularity);
  
  // 3. Pre-formatted Charts (Throughput, Latency Percentiles, Errors over time)
  const { data: chartsData, isLoading: isLoadingCharts } = useServiceCharts(id, 3600, 60);
  
  // 4. Discovered Endpoints / Accessed Paths
  const { data: endpoints = [], isLoading: isLoadingEndpoints } = useServiceEndpoints(id);
  
  // 5. Recent Requests Stream
  const { data: recentRequests = [], isLoading: isLoadingRequests } = useServiceRequests(id);

  // Search & Filter state for Endpoints & Requests tables
  const [endpointSearch, setEndpointSearch] = useState('');
  const [requestSearch, setRequestSearch] = useState('');
  const [requestMethodFilter, setRequestMethodFilter] = useState('ALL');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Database Instances & Connectivity state
  const databasesList = service?.databases || [];
  const upDatabasesCount = databasesList.filter((d) => d.status === 'UP').length;
  const totalDatabasesCount = databasesList.length;

  // Modal state for managing service databases
  const [showManageDbModal, setShowManageDbModal] = useState<boolean>(false);
  const [isSavingDbs, setIsSavingDbs] = useState<boolean>(false);
  const [dbListForm, setDbListForm] = useState<Array<{ id: string; name: string; host: string; port: number }>>([]);
  const [newDbName, setNewDbName] = useState('');
  const [newDbHost, setNewDbHost] = useState('');
  const [newDbPort, setNewDbPort] = useState('5432');
  const [dbFormError, setDbFormError] = useState<string | null>(null);

  const handleOpenManageDbModal = () => {
    setDbListForm(
      databasesList.map((d) => ({
        id: d.id,
        name: d.name,
        host: d.host,
        port: d.port,
      }))
    );
    setNewDbName('');
    setNewDbHost(service?.serverHost || '34.101.122.171');
    setNewDbPort('5432');
    setDbFormError(null);
    setShowManageDbModal(true);
  };

  const handleAddDbToForm = () => {
    if (!newDbName.trim() || !newDbHost.trim()) {
      setDbFormError('Nama database dan Host/IP wajib diisi');
      return;
    }
    const portNum = parseInt(newDbPort, 10);
    if (isNaN(portNum) || portNum <= 0) {
      setDbFormError('Port harus berupa angka valid');
      return;
    }
    const idSlug = newDbName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    setDbListForm((prev) => [
      ...prev,
      { id: idSlug || `db-${Date.now()}`, name: newDbName.trim(), host: newDbHost.trim(), port: portNum },
    ]);
    setNewDbName('');
    setNewDbPort('5432');
    setDbFormError(null);
  };

  const handleRemoveDbFromForm = (index: number) => {
    setDbListForm((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveDatabases = async () => {
    setIsSavingDbs(true);
    setDbFormError(null);
    try {
      await monitoringApi.updateServiceDatabases(id, dbListForm);
      await refetchService();
      setShowManageDbModal(false);
    } catch (err: unknown) {
      setDbFormError(err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi database');
    } finally {
      setIsSavingDbs(false);
    }
  };

  const isDown = service?.rawStatus === 'DOWN' || service?.status === 'critical' || service?.status === 'offline';
  const dailyRequests = dailyRequestsQuery;

  // Handle path copy
  const handleCopy = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  // Calculations for daily request summaries
  const totalWeekRequests = useMemo(() => {
    return dailyRequests.reduce((sum, item) => sum + (item.totalRequests || 0), 0);
  }, [dailyRequests]);

  const avgDailyRequests = useMemo(() => {
    return dailyRequests.length ? Math.round(totalWeekRequests / dailyRequests.length) : 0;
  }, [dailyRequests, totalWeekRequests]);

  const peakDay = useMemo(() => {
    if (!dailyRequests.length) return null;
    return dailyRequests.reduce(
      (max, item) => ((item.totalRequests || 0) > (max.totalRequests || 0) ? item : max),
      dailyRequests[0]
    );
  }, [dailyRequests]);

  const totalWeekErrors = useMemo(() => {
    return dailyRequests.reduce(
      (sum, item) => sum + (item.clientErrors || item.client4xx || 0) + (item.serverErrors || item.server5xx || 0),
      0
    );
  }, [dailyRequests]);

  const successRate = useMemo(() => {
    if (totalWeekRequests === 0) return '100.00';
    const success = dailyRequests.reduce(
      (sum, item) => sum + (item.successfulRequests || item.success2xx || 0),
      0
    );
    return ((success / totalWeekRequests) * 100).toFixed(2);
  }, [dailyRequests, totalWeekRequests]);

  // Series config for daily request line chart (matching Request tab)
  const requestTimelineSeries: LineSeriesConfig[] = [
    { key: 'successfulRequests', name: '2xx/3xx Success', color: '#10b981', strokeWidth: 2.5 },
    { key: 'clientErrors', name: '4xx Warn', color: '#f59e0b', strokeWidth: 2 },
    { key: 'serverErrors', name: '5xx Error', color: '#f43f5e', strokeWidth: 2 },
  ];

  const dailyChartData = useMemo(() => {
    return dailyRequests.map((d) => ({
      ...d,
      timestamp: d.displayDate || d.timestamp?.split(',')[0] || d.date,
      shortLabel: d.displayDate || d.timestamp?.split(',')[0] || d.date,
      successfulRequests: d.successfulRequests ?? d.success2xx ?? 0,
      clientErrors: d.clientErrors ?? d.client4xx ?? 0,
      serverErrors: d.serverErrors ?? d.server5xx ?? 0,
    }));
  }, [dailyRequests]);

  // Timeline data for Throughput, Latency, and Errors from chartsData
  const timelineData = useMemo(() => {
    if (chartsData?.timeline && chartsData.timeline.length > 0) {
      return chartsData.timeline.map((item) => ({
        ...item,
        timestamp: item.time || (item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''),
      }));
    }
    return [];
  }, [chartsData]);

  // Throughput Series Config
  const throughputSeries: LineSeriesConfig[] = [
    { key: 'reqPerSecond', name: 'Throughput (req/s)', color: '#06b6d4', strokeWidth: 2.5 },
  ];

  // Latency Series Config (p50, p90, p95, p99)
  const latencySeries: LineSeriesConfig[] = [
    { key: 'p50', name: 'p50 (Median)', color: '#06b6d4', strokeWidth: 2 },
    { key: 'p90', name: 'p90', color: '#10b981', strokeWidth: 2 },
    { key: 'p95', name: 'p95', color: '#f59e0b', strokeWidth: 2 },
    { key: 'p99', name: 'p99 (Spike)', color: '#f43f5e', strokeWidth: 2 },
  ];

  // Errors Over Time Series Config
  const errorTimelineSeries: LineSeriesConfig[] = [
    { key: 'errorRatePercent', name: 'Error Rate (%)', color: '#f43f5e', strokeWidth: 2 },
    { key: 'errors4xx', name: '4xx Delta', color: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '3 3' },
    { key: 'errors5xx', name: '5xx Delta', color: '#e11d48', strokeWidth: 2 },
  ];

  // Filtered Endpoints
  const filteredEndpoints = useMemo(() => {
    if (!endpointSearch.trim()) return endpoints;
    const q = endpointSearch.toLowerCase();
    return endpoints.filter(
      (ep) =>
        ep.path.toLowerCase().includes(q) ||
        String(ep.method).toLowerCase().includes(q) ||
        String(ep.status).includes(q)
    );
  }, [endpoints, endpointSearch]);

  // Max endpoint count for visual progress bars
  const maxEndpointCount = useMemo(() => {
    return Math.max(1, ...endpoints.map((e) => e.count || 0));
  }, [endpoints]);

  // Filtered Recent Requests
  const filteredRecentRequests = useMemo(() => {
    let list = recentRequests;
    if (requestMethodFilter !== 'ALL') {
      list = list.filter((r) => (r.method || '').toUpperCase() === requestMethodFilter);
    }
    if (requestSearch.trim()) {
      const q = requestSearch.toLowerCase();
      list = list.filter(
        (r) =>
          r.path.toLowerCase().includes(q) ||
          (r.client || r.clientIp || '').toLowerCase().includes(q) ||
          String(r.status || r.statusCode || '').includes(q)
      );
    }
    return list.slice(0, 15);
  }, [recentRequests, requestMethodFilter, requestSearch]);

  return (
    <div className="space-y-6">
      {/* ─── 1. TOP TELEMETRY KPI BANNER ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* RPS Throughput */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono">
            <span>Throughput</span>
            <Activity className="w-3.5 h-3.5 text-cyan-500" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
            {formatRps(service?.throughputRps ?? (service?.metrics?.throughput?.reqPerSecond ?? 0))}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
            Total: {formatNumber(service?.reqTotal ?? (service?.metrics?.throughput?.reqTotal ?? 0))} req
          </div>
        </div>

        {/* Latency P50 */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono">
            <span>Latency (p50)</span>
            <Clock className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {Math.round(service?.latencyP50Ms ?? (service?.metrics?.latency?.p50Ms ?? 0))} ms
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
            Median Response
          </div>
        </div>

        {/* Latency P99 */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono">
            <span>Latency (p99)</span>
            <Zap className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
            {Math.round(service?.latencyP99Ms ?? (service?.metrics?.latency?.p99Ms ?? 0))} ms
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
            p95: {Math.round(service?.latencyP95Ms ?? (service?.metrics?.latency?.p95Ms ?? 0))} ms
          </div>
        </div>

        {/* Error Rate */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono">
            <span>Error Rate</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className={`text-xl font-bold font-mono mt-1 ${
            (service?.errorRatePercent || 0) > 1 ? 'text-rose-500' : 'text-slate-900 dark:text-white'
          }`}>
            {(service?.errorRatePercent ?? (service?.metrics?.errorRate?.percent ?? 0)).toFixed(2)}%
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
            5xx: {service?.total5xx ?? 0} &bull; 4xx: {service?.total4xx ?? 0}
          </div>
        </div>

        {/* Memory RSS */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono">
            <span>Memory RSS</span>
            <Database className="w-3.5 h-3.5 text-purple-500" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
            {service?.memoryRssMb ? `${service.memoryRssMb.toFixed(1)} MB` : '0 MB'}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
            CPU: {(service?.cpuPercent || 0).toFixed(1)}%
          </div>
        </div>

        {/* Connections & Sockets */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono">
            <span>Open Sockets</span>
            <Network className="w-3.5 h-3.5 text-cyan-500" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
            {service?.openFds ?? (service?.metrics?.connections?.openFds ?? 0)}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
            Sessions: {service?.activeConnections ?? 0}
          </div>
        </div>
      </div>

      {/* ─── DATABASE INSTANCES & CONNECTIVITY STATUS SECTION (OPTIONAL PER SERVICE) ─── */}
      <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-cyan-500 shrink-0" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Database Instances &amp; Connectivity Status ({upDatabasesCount}/{totalDatabasesCount} UP)
                </h2>
                {totalDatabasesCount > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 font-bold">
                    TCP Socket Probe
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pemeriksaan koneksi soket real-time ke database yang melayani service{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-200">{service?.name || id}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {totalDatabasesCount === 0 ? (
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold border bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/25">
                NO DATABASES CONFIGURED
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

            <button
              type="button"
              onClick={() => refetchService()}
              disabled={isFetchingService}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition shadow-sm"
              title="Refresh status koneksi database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingService ? 'animate-spin text-cyan-500' : ''}`} />
            </button>

            <button
              type="button"
              onClick={handleOpenManageDbModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/15 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-indigo-600 dark:text-indigo-400 text-xs font-mono font-bold transition shadow-sm"
              title="Kelola referensi database untuk service ini"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Kelola DB (+/-)</span>
            </button>
          </div>
        </div>

        {/* Database Grid or Honest Empty State */}
        {totalDatabasesCount === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2 bg-slate-50/40 dark:bg-slate-900/30 font-sans">
            <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 mx-auto flex items-center justify-center text-slate-400">
              <Database className="w-4 h-4 text-slate-400 opacity-60" />
            </div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Microservice ini beroperasi tanpa dependensi database (Stateless Microservice / Belum Dikonfigurasi)
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Bagian ini bersifat opsional untuk masing-masing service. Jika service ini membutuhkan pemantauan koneksi instance PostgreSQL, Redis, MongoDB, dll., Anda dapat menambahkannya melalui tombol di bawah.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleOpenManageDbModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-xs font-mono font-bold transition shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Tambah Referensi Database</span>
              </button>
            </div>
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
                      <strong className="text-sm font-bold text-slate-900 dark:text-white font-mono">
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
                      Latency: <strong className={isUp ? 'text-emerald-500 font-bold' : 'text-slate-400'}>{isUp ? `${db.latencyMs ?? 0} ms` : '-'}</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── 2. GRAFIK REQUEST HARIAN (DAILY REQUESTS VOLUME TIMELINE) ──────────── */}
      <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-500" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Request Rate &amp; Volume Timeline ({id})
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                Line Chart
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tren volume request dari scraper backend (<span className="text-emerald-500 font-medium">2xx/3xx Success</span>, <span className="text-amber-500 font-medium">4xx Warn</span>, dan <span className="text-rose-500 font-medium">5xx Error</span>)
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Granularity Toggle matching Request tab */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setGranularity('hourly')}
                className={`px-2.5 py-1 rounded-md transition ${
                  granularity === 'hourly'
                    ? 'bg-cyan-500 text-white shadow-sm font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Per Jam (24h)
              </button>
              <button
                type="button"
                onClick={() => setGranularity('daily')}
                className={`px-2.5 py-1 rounded-md transition ${
                  granularity === 'daily'
                    ? 'bg-cyan-500 text-white shadow-sm font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Per Hari (14d)
              </button>
            </div>
          </div>
        </div>

        {/* Time-series Line Chart matching Request tab */}
        {isLoadingDaily ? (
          <ChartSkeleton height="h-64" />
        ) : dailyChartData.length > 0 ? (
          <LineChart
            data={dailyChartData as unknown as Record<string, unknown>[]}
            series={requestTimelineSeries}
            xAxisKey="timestamp"
            height={250}
            unit="req"
          />
        ) : (
          <div className="py-12 px-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 border border-dashed border-slate-200 dark:border-slate-800 text-center font-mono">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800/80 mx-auto flex items-center justify-center text-slate-400 mb-2">
              <Radio className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isDown ? 'Service Sedang Offline — Belum Ada Request Tercatat' : 'Belum Ada Data Request'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Data request akan otomatis bertambah ketika ada request HTTP yang diarahkan ke microservice ini.
            </p>
          </div>
        )}

        {/* Summary Footer for Daily Requests */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-500 dark:text-slate-400">
          <div>
            Rata-rata: <strong className="text-slate-900 dark:text-white">{formatNumber(avgDailyRequests)} req/hari</strong>
          </div>
          <div>
            Puncak Tertinggi:{' '}
            <strong className="text-slate-900 dark:text-white">
              {peakDay ? `${peakDay.timestamp || peakDay.date} (${formatNumber(peakDay.totalRequests)})` : '-'}
            </strong>
          </div>
          <div>
            Total Error:{' '}
            <strong className={totalWeekErrors > 0 ? 'text-rose-500 font-bold' : 'text-slate-900 dark:text-white'}>
              {formatNumber(totalWeekErrors)} errs
            </strong>
          </div>
          <div>
            Success Rate: <strong className="text-emerald-500 font-bold">{successRate}%</strong>
          </div>
        </div>
      </div>

      {/* ─── 3. REAL-TIME CHARTS: THROUGHPUT & LATENCY PERCENTILES (2-COL) ────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Throughput (req/s) Timeline */}
        <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Throughput (req/s)
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                  Rate Timeline
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Kecepatan request masuk per detik ke service {service?.name}
              </p>
            </div>
            <div className="text-right font-mono">
              <span className="text-xs text-slate-400 block">Current</span>
              <span className="text-sm font-bold text-cyan-600 dark:text-cyan-400">
                {formatRps(service?.throughputRps ?? (service?.metrics?.throughput?.reqPerSecond ?? 0))}
              </span>
            </div>
          </div>

          {isLoadingCharts ? (
            <ChartSkeleton height="h-60" />
          ) : timelineData.length > 0 ? (
            <LineChart
              data={timelineData}
              series={throughputSeries}
              height={240}
              unit="req/s"
            />
          ) : (
            <div className="py-12 text-center text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              Belum ada data timeline throughput.
            </div>
          )}
        </div>

        {/* Right: Latency Percentiles (p50, p90, p95, p99) */}
        <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Latency Percentiles
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  p50 / p90 / p95 / p99
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Distribusi waktu respon HTTP berdasarkan quantile persentil (ms)
              </p>
            </div>
            <div className="text-right font-mono">
              <span className="text-xs text-slate-400 block">p95</span>
              <span className="text-sm font-bold text-amber-500">
                {Math.round(service?.latencyP95Ms ?? (service?.metrics?.latency?.p95Ms ?? 0))} ms
              </span>
            </div>
          </div>

          {isLoadingCharts ? (
            <ChartSkeleton height="h-60" />
          ) : timelineData.length > 0 ? (
            <LineChart
              data={timelineData}
              series={latencySeries}
              height={240}
              unit="ms"
            />
          ) : (
            <div className="py-12 text-center text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              Belum ada data latency percentiles.
            </div>
          )}
        </div>
      </div>

      {/* ─── 4. ERRORS OVER TIME & SPECS (2-COL) ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Errors Over Time */}
        <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Errors Over Time
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  Timeline
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Fluktuasi persentase error rate (%) & delta kegagalan HTTP
              </p>
            </div>
            <div className="text-right font-mono">
              <span className="text-xs text-slate-400 block">Total 5xx</span>
              <span className="text-sm font-bold text-rose-500">
                {service?.total5xx ?? 0}
              </span>
            </div>
          </div>

          {isLoadingCharts ? (
            <ChartSkeleton height="h-60" />
          ) : timelineData.length > 0 ? (
            <LineChart
              data={timelineData}
              series={errorTimelineSeries}
              height={240}
              unit="%"
            />
          ) : (
            <div className="py-12 text-center text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              Belum ada data error timeline.
            </div>
          )}
        </div>

        {/* Right: Runtime & Connection Specs */}
        <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Network className="w-4 h-4 text-cyan-500" />
              <span>Runtime & System Metrics</span>
            </h3>
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 uppercase">
              {service?.stack || 'NODEJS'}
            </span>
          </div>

          <div className="space-y-2.5 text-slate-600 dark:text-slate-300 divide-y divide-slate-100 dark:divide-slate-800/60">
            <div className="flex justify-between pt-1.5">
              <span className="text-slate-500 dark:text-slate-400">Target Endpoint URL:</span>
              <strong className="text-slate-900 dark:text-white">{service?.url || 'http://localhost'}</strong>
            </div>
            <div className="flex justify-between pt-1.5">
              <span className="text-slate-500 dark:text-slate-400">Prometheus Metrics Path:</span>
              <strong className="text-cyan-600 dark:text-cyan-400 truncate max-w-[240px]">
                {service?.metricsUrl || `${service?.url}/metrics`}
              </strong>
            </div>
            <div className="flex justify-between pt-1.5">
              <span className="text-slate-500 dark:text-slate-400">Loopback Scrape Latency:</span>
              <strong className="text-emerald-600 dark:text-emerald-400">{service?.scrapeLatencyMs ?? 0} ms</strong>
            </div>
            <div className="flex justify-between pt-1.5">
              <span className="text-slate-500 dark:text-slate-400">Resident Set Memory (RSS):</span>
              <strong className="text-slate-900 dark:text-white">
                {service?.memoryRssMb ? `${service.memoryRssMb.toFixed(2)} MB` : '0 MB'}
              </strong>
            </div>
            <div className="flex justify-between pt-1.5">
              <span className="text-slate-500 dark:text-slate-400">Heap / Alloc Memory:</span>
              <strong className="text-slate-900 dark:text-white">
                {service?.memoryHeapUsedMb ? `${service.memoryHeapUsedMb.toFixed(2)} MB` : '-'}
              </strong>
            </div>
            <div className="flex justify-between pt-1.5">
              <span className="text-slate-500 dark:text-slate-400">CPU Usage Percent:</span>
              <strong className="text-slate-900 dark:text-white">{(service?.cpuPercent || 0).toFixed(2)}%</strong>
            </div>
            <div className="flex justify-between pt-1.5">
              <span className="text-slate-500 dark:text-slate-400">Open File Descriptors:</span>
              <strong className="text-slate-900 dark:text-white">{service?.openFds ?? 0}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 5. DAFTAR PATH / ENDPOINT YANG PERNAH DIAKSES ─────────────────────── */}
      <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Daftar Path / Endpoint yang Pernah Diakses
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                {endpoints.length} Endpoints Discovered
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Daftar route URL endpoint yang telah dicatat oleh scraper dari backend <code className="text-cyan-600 dark:text-cyan-400 font-mono">/api/services/{id}/endpoints</code>
            </p>
          </div>

          {/* Search Box */}
          <div className="relative max-w-xs w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari path atau method..."
              value={endpointSearch}
              onChange={(e) => setEndpointSearch(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#070b14] border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Endpoints Table */}
        {isLoadingEndpoints ? (
          <div className="py-8 text-center text-xs font-mono text-slate-400">Loading endpoints...</div>
        ) : filteredEndpoints.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800/80">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-[#070b14] border-b border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3.5 w-24">Method</th>
                  <th className="py-3 px-3.5">Path Route</th>
                  <th className="py-3 px-3.5 w-24 text-center">Status</th>
                  <th className="py-3 px-3.5 w-36 text-right">Request Count</th>
                  <th className="py-3 px-3.5 w-32 text-right">Avg Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {filteredEndpoints.map((ep, idx) => {
                  const methodUpper = String(ep.method || 'GET').toUpperCase();
                  const isGet = methodUpper === 'GET';
                  const isPost = methodUpper === 'POST';
                  const isPut = methodUpper === 'PUT';
                  const isDelete = methodUpper === 'DELETE';
                  const statusCode = Number(ep.status || 200);

                  const countPct = Math.round(((ep.count || 0) / maxEndpointCount) * 100);

                  return (
                    <tr
                      key={`${ep.method}-${ep.path}-${idx}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Method Badge */}
                      <td className="py-3 px-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                            isGet
                              ? 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/25'
                              : isPost
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25'
                              : isPut
                              ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/25'
                              : isDelete
                              ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/25'
                              : 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/25'
                          }`}
                        >
                          {ep.method}
                        </span>
                      </td>

                      {/* Path */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-2 group">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 select-all">
                            {ep.path}
                          </span>
                          <button
                            onClick={() => handleCopy(ep.path)}
                            title="Salin path"
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 transition"
                          >
                            {copiedPath === ep.path ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            statusCode >= 500
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                              : statusCode >= 400
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          }`}
                        >
                          {statusCode}
                        </span>
                      </td>

                      {/* Request Count with Bar */}
                      <td className="py-3 px-3.5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {formatNumber(ep.count || 0)}
                          </span>
                          <div className="w-20 bg-slate-100 dark:bg-slate-800 rounded-full h-1 overflow-hidden">
                            <div
                              className="bg-cyan-500 h-full rounded-full transition-all"
                              style={{ width: `${Math.max(4, countPct)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Avg Latency */}
                      <td className="py-3 px-3.5 text-right">
                        <span
                          className={`font-bold ${
                            (ep.avgLatencyMs || 0) > 300
                              ? 'text-rose-500'
                              : (ep.avgLatencyMs || 0) > 100
                              ? 'text-amber-500'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {Math.round(ep.avgLatencyMs || 0)} ms
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
            {endpointSearch ? 'Tidak ada endpoint yang cocok dengan filter.' : 'Belum ada endpoint yang tercatat.'}
          </div>
        )}
      </div>

      {/* ─── 6. LIVE REQUESTS LOG STREAM ───────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Live Requests Log Stream
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Recent Traffic
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Log request HTTP terakhir yang masuk ke microservice ini dari <code className="text-cyan-600 dark:text-cyan-400 font-mono">/api/services/{id}/requests</code>
            </p>
          </div>

          {/* Filter & Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Method Select */}
            <select
              value={requestMethodFilter}
              onChange={(e) => setRequestMethodFilter(e.target.value)}
              className="bg-slate-50 dark:bg-[#070b14] border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">ALL Methods</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari path / client IP..."
                value={requestSearch}
                onChange={(e) => setRequestSearch(e.target.value)}
                className="bg-slate-50 dark:bg-[#070b14] border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Link to Full Tab */}
            <Link
              to={`/services/${id}/requests`}
              className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
            >
              <span>Full Table</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Requests Table */}
        {isLoadingRequests ? (
          <div className="py-8 text-center text-xs font-mono text-slate-400">Loading requests...</div>
        ) : filteredRecentRequests.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800/80">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-[#070b14] border-b border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3.5 w-24">Method</th>
                  <th className="py-3 px-3.5">Request Path</th>
                  <th className="py-3 px-3.5 w-24 text-center">Status</th>
                  <th className="py-3 px-3.5 w-28 text-right">Latency</th>
                  <th className="py-3 px-3.5 w-36 text-right">Client IP</th>
                  <th className="py-3 px-3.5 w-28 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {filteredRecentRequests.map((req) => {
                  const methodUpper = String(req.method || 'GET').toUpperCase();
                  const isGet = methodUpper === 'GET';
                  const isPost = methodUpper === 'POST';
                  const isPut = methodUpper === 'PUT';
                  const isDelete = methodUpper === 'DELETE';
                  const statusNum = Number(req.status || req.statusCode || 200);
                  const latency = Number(req.latencyMs || req.durationMs || 0);

                  return (
                    <tr
                      key={req.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Method */}
                      <td className="py-2.5 px-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                            isGet
                              ? 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/25'
                              : isPost
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25'
                              : isPut
                              ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/25'
                              : isDelete
                              ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/25'
                              : 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/25'
                          }`}
                        >
                          {req.method}
                        </span>
                      </td>

                      {/* Path */}
                      <td className="py-2.5 px-3.5">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {req.path}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            statusNum >= 500
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                              : statusNum >= 400
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          }`}
                        >
                          {statusNum}
                        </span>
                      </td>

                      {/* Latency */}
                      <td className="py-2.5 px-3.5 text-right">
                        <span
                          className={`font-semibold ${
                            latency > 200
                              ? 'text-rose-500 font-bold'
                              : latency > 50
                              ? 'text-amber-500'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {latency.toFixed(1)} ms
                        </span>
                      </td>

                      {/* Client IP */}
                      <td className="py-2.5 px-3.5 text-right text-slate-500 dark:text-slate-400">
                        {req.client || req.clientIp || '127.0.0.1'}
                      </td>

                      {/* Time */}
                      <td className="py-2.5 px-3.5 text-right text-slate-400">
                        {req.time || (req.timestamp ? new Date(req.timestamp).toLocaleTimeString() : '-')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
            {requestSearch ? 'Tidak ada request yang sesuai dengan filter.' : 'Belum ada request yang tercatat.'}
          </div>
        )}
      </div>

      {/* ─── MODAL: KELOLA REFERENSI DATABASE SERVICE (+/-) ───────────────── */}
      <Modal
        isOpen={showManageDbModal}
        onClose={() => !isSavingDbs && setShowManageDbModal(false)}
        title={`Kelola Referensi Database — ${service?.name || id}`}
      >
        <div className="space-y-5 font-sans">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Daftarkan instance database (PostgreSQL, Redis, MongoDB, MySQL) yang melayani microservice ini. Sistem akan secara otomatis menguji soket TCP secara real-time untuk mengecek status running/stopped dan latensi koneksi.
          </p>

          {/* Current List Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider font-mono">
              Database Terdaftar ({dbListForm.length})
            </h4>

            {dbListForm.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400 font-mono">
                Belum ada database yang didaftarkan untuk service ini (Stateless).
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs">
                {dbListForm.map((db, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-white dark:bg-slate-900/60">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-500" />
                      <div>
                        <strong className="text-slate-900 dark:text-white font-bold">{db.name}</strong>
                        <span className="text-slate-500 dark:text-slate-400 ml-2">
                          ({db.host}:{db.port})
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDbFromForm(idx)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                      title="Hapus database dari daftar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form to Add New Database */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 space-y-3 font-mono text-xs">
            <h5 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 font-sans">
              <Plus className="w-4 h-4 text-cyan-500" />
              <span>Tambah Referensi Database Baru</span>
            </h5>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Nama DB
                </label>
                <input
                  type="text"
                  placeholder="cth: PostgreSQL"
                  value={newDbName}
                  onChange={(e) => setNewDbName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Host / IP
                </label>
                <input
                  type="text"
                  placeholder="cth: 34.101.122.171"
                  value={newDbHost}
                  onChange={(e) => setNewDbHost(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Port
                </label>
                <input
                  type="number"
                  placeholder="5432"
                  value={newDbPort}
                  onChange={(e) => setNewDbPort(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAddDbToForm}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition shadow-sm text-xs font-mono"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Tambahkan ke Daftar</span>
              </button>
            </div>
          </div>

          {dbFormError && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-600 dark:text-rose-400 text-xs font-mono">
              {dbFormError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowManageDbModal(false)}
              disabled={isSavingDbs}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold transition"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveDatabases}
              disabled={isSavingDbs}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition shadow-sm disabled:opacity-50"
            >
              {isSavingDbs && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Simpan Perubahan Database</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
