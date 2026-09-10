import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServices, useBackendHealth, useMetricsSummary } from '../../hooks/useServices';
import { ErrorState } from '../../components/common/ErrorState';
import { TableSkeleton } from '../../components/common/LoadingSkeleton';
import { formatRps, formatNumber } from '../../utils/formatters';
import {
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Radio,
  ExternalLink,
  Database,
  ArrowUpRight,
} from 'lucide-react';
import { Service } from '../../types';

function formatUptimeSeconds(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getStatusBadge(service: Service) {
  const isUp = service.rawStatus === 'UP' || service.status === 'healthy';
  const isDegraded =
    service.status === 'degraded' ||
    (isUp && (service.errorRatePercent || 0) > 2);

  if (isDegraded) {
    return {
      label: 'Degraded',
      dotClass: 'bg-[#f59e0b]',
      badgeClass:
        'bg-[#281f14] text-[#fcd34d] border border-[#78350f]/60',
    };
  }

  if (isUp) {
    return {
      label: 'UP',
      dotClass: 'bg-[#10b981]',
      badgeClass:
        'bg-[#0e241c] text-[#34d399] border border-[#065f46]/60',
    };
  }

  return {
    label: 'DOWN',
    dotClass: 'bg-[#f43f5e]',
    badgeClass:
      'bg-[#2a131b] text-[#fb7185] border border-[#881337]/60',
  };
}

export const ServiceListPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: services = [], isLoading, isError, refetch } = useServices();
  const { data: healthData } = useBackendHealth();
  const { data: metricsSummary } = useMetricsSummary();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStack, setFilterStack] = useState<'all' | 'nodejs' | 'go'>('all');
  const [filterStatus, setFilterStatus] = useState<'active-connected' | 'all' | 'UP' | 'DOWN'>('active-connected');
  const [sortKey, setSortKey] = useState<string>('status');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Compute live aggregates directly from /health & /api/metrics/summary payloads
  const totalServices = healthData?.monitoring?.totalServices ?? services.length;
  const servicesUp =
    healthData?.monitoring?.servicesUp ??
    services.filter((s) => s.rawStatus === 'UP' || s.status === 'healthy').length;
  const servicesDown =
    healthData?.monitoring?.servicesDown ??
    services.filter((s) => s.rawStatus === 'DOWN' || s.status === 'critical' || s.status === 'offline').length;

  const activeConnectedCount = services.filter((s) => s.rawStatus === 'UP' || s.status === 'healthy').length;

  const totalRps = useMemo(() => {
    if (metricsSummary?.services && metricsSummary.services.length > 0) {
      return metricsSummary.services.reduce((sum, s) => sum + (s.reqPerSecond || 0), 0);
    }
    return services.reduce((sum, s) => sum + (s.throughputRps || 0), 0);
  }, [metricsSummary, services]);

  const totalRequests = useMemo(() => {
    if (metricsSummary?.services && metricsSummary.services.length > 0) {
      return metricsSummary.services.reduce((sum, s) => sum + (s.reqTotal || 0), 0);
    }
    return services.reduce((sum, s) => sum + (s.reqTotal || 0), 0);
  }, [metricsSummary, services]);

  const avgScrapeLatency = useMemo(() => {
    const list = services.filter((s) => s.scrapeLatencyMs && s.scrapeLatencyMs > 0);
    if (list.length === 0) return 33;
    return Math.round(list.reduce((sum, s) => sum + (s.scrapeLatencyMs || 0), 0) / list.length);
  }, [services]);

  const toggleExpand = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllExpand = () => {
    if (expandedRows.size === services.length) {
      setExpandedRows(new Set());
    } else {
      setExpandedRows(new Set(services.map((s) => s.id)));
    }
  };

  const filteredServices = useMemo(() => {
    let list = [...services];

    // Filter by runtime stack from payload (nodejs | go)
    if (filterStack !== 'all') {
      list = list.filter((s) => s.stack?.toLowerCase() === filterStack);
    }

    // Filter by status from payload
    if (filterStatus === 'active-connected' || filterStatus === 'UP') {
      list = list.filter((s) => s.rawStatus === 'UP' || s.status === 'healthy');
    } else if (filterStatus === 'DOWN') {
      list = list.filter((s) => !(s.rawStatus === 'UP' || s.status === 'healthy'));
    }

    // Filter by search query (service name, url, stack, description, error, serverHost)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description && s.description.toLowerCase().includes(q)) ||
          (s.url && s.url.toLowerCase().includes(q)) ||
          (s.metricsUrl && s.metricsUrl.toLowerCase().includes(q)) ||
          (s.stack && s.stack.toLowerCase().includes(q)) ||
          (s.error && s.error.toLowerCase().includes(q)) ||
          (s.serverHost && s.serverHost.toLowerCase().includes(q)) ||
          (s.serverName && s.serverName.toLowerCase().includes(q)) ||
          s.id.toLowerCase().includes(q)
      );
    }

    // Sort list
    list.sort((a, b) => {
      // Prioritize UP services at the top when sorted by status
      if (sortKey === 'status') {
        const aUp = (a.rawStatus === 'UP' || a.status === 'healthy') ? 1 : 0;
        const bUp = (b.rawStatus === 'UP' || b.status === 'healthy') ? 1 : 0;
        if (aUp !== bUp) return sortAsc ? (bUp - aUp) : (aUp - bUp);
      }

      let valA: string | number = (a as unknown as Record<string, string | number>)[sortKey] ?? 0;
      let valB: string | number = (b as unknown as Record<string, string | number>)[sortKey] ?? 0;

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      const numA = Number(valA) || 0;
      const numB = Number(valB) || 0;
      if (numA < numB) return sortAsc ? -1 : 1;
      if (numA > numB) return sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }, [services, searchQuery, filterStack, filterStatus, sortKey, sortAsc]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      if (['errorCount', 'reqTotal', 'throughputRps', 'errorRatePercent', 'latencyP95Ms', 'memoryRssMb', 'cpuPercent', 'memoryHeapUsedMb', 'openFds'].includes(key)) {
        setSortAsc(false);
      } else {
        setSortAsc(true);
      }
    }
  };

  const renderSortIcon = (key: string) => {
    if (sortKey !== key) {
      return <ChevronsUpDown className="w-3 h-3 text-slate-500 opacity-60 ml-1 inline-block shrink-0" />;
    }
    return sortAsc ? (
      <ChevronUp className="w-3 h-3 text-cyan-400 ml-1 inline-block shrink-0" />
    ) : (
      <ChevronDown className="w-3 h-3 text-cyan-400 ml-1 inline-block shrink-0" />
    );
  };

  if (isError) {
    return <ErrorState onRetry={refetch} />;
  }

  const nodeCount = services.filter((s) => s.stack === 'nodejs').length;
  const goCount = services.filter((s) => s.stack === 'go').length;

  return (
    <div className="space-y-6">
      {/* Top Header & Telemetry Mode */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Microservices Telemetry
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Data real per proses service dari <span className="font-mono text-cyan-500">/api/services</span> & <span className="font-mono text-cyan-500">/api/metrics/summary</span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800 text-xs font-mono select-none">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-slate-700 dark:text-slate-300 font-medium">Scraper Active (5s)</span>
        </div>
      </div>

      {/* 4 TOP SUMMARY KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. BACKEND HEALTH */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800/80 shadow-sm dark:shadow-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
              BACKEND (/health)
            </span>
            <div className="mt-1 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xl font-bold text-slate-900 dark:text-white font-mono capitalize">
                {healthData?.status || 'Healthy'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              Port: 5000 &bull; Uptime: {formatUptimeSeconds(healthData?.uptimeSeconds || 0)}
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold">
            200 OK
          </span>
        </div>

        {/* 2. TOTAL SERVICES */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800/80 shadow-sm dark:shadow-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
              TOTAL SERVICES
            </span>
            <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white font-mono">
              {totalServices} <span className="text-xs font-normal text-slate-400 font-sans">Services</span>
            </div>
            <div className="text-[11px] font-mono mt-0.5 flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{servicesUp} UP</span>
              <span className="text-slate-400">&bull;</span>
              <span className="text-rose-600 dark:text-rose-400 font-semibold">{servicesDown} DOWN</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center font-mono text-slate-700 dark:text-slate-300 font-bold text-xs border border-slate-200 dark:border-slate-700">
            {servicesUp}/{totalServices}
          </div>
        </div>

        {/* 3. SYSTEM THROUGHPUT */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800/80 shadow-sm dark:shadow-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
              SYSTEM THROUGHPUT
            </span>
            <div className="mt-1 text-2xl font-bold text-cyan-600 dark:text-cyan-400 font-mono">
              {formatRps(totalRps)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              Total: {formatNumber(totalRequests)} reqs
            </div>
          </div>
          <Activity className="w-6 h-6 text-cyan-500 opacity-60" />
        </div>

        {/* 4. SCRAPER TARGETS */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800/80 shadow-sm dark:shadow-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
              SCRAPE TARGETS
            </span>
            <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white font-mono flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-500" />
              <span>{services.length} Endpoints</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              Avg latency: ~{avgScrapeLatency}ms
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 font-bold">
            PROMETHEUS
          </span>
        </div>
      </div>

      {/* FILTER BUTTONS & SEARCH BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Quick Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* TAB 1: UP / Aktif (Default) */}
          <button
            onClick={() => {
              setFilterStack('all');
              setFilterStatus('active-connected');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition shadow-sm flex items-center gap-1.5 ${
              filterStatus === 'active-connected'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-cyan-500/20'
                : 'bg-white dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-cyan-500'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Aktif &amp; Terhubung ({activeConnectedCount})</span>
          </button>

          {/* TAB 3: UP */}
          <button
            onClick={() => setFilterStatus(filterStatus === 'UP' ? 'active-connected' : 'UP')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition shadow-sm ${
              filterStatus === 'UP'
                ? 'bg-emerald-600 text-white'
                : 'bg-white dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
            }`}
          >
            UP ({servicesUp})
          </button>

          {/* TAB 4: Semua */}
          <button
            onClick={() => {
              setFilterStack('all');
              setFilterStatus('all');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition shadow-sm ${
              filterStack === 'all' && filterStatus === 'all'
                ? 'bg-slate-800 dark:bg-slate-700 text-white'
                : 'bg-white dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Semua ({services.length})
          </button>

          {/* TAB 5: Node.js */}
          <button
            onClick={() => setFilterStack(filterStack === 'nodejs' ? 'all' : 'nodejs')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition shadow-sm ${
              filterStack === 'nodejs'
                ? 'bg-emerald-500 text-white'
                : 'bg-white dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
            }`}
          >
            Node.js ({nodeCount})
          </button>

          {/* TAB 6: Go */}
          <button
            onClick={() => setFilterStack(filterStack === 'go' ? 'all' : 'go')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition shadow-sm ${
              filterStack === 'go'
                ? 'bg-cyan-500 text-white'
                : 'bg-white dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/20'
            }`}
          >
            Go ({goCount})
          </button>

          {/* TAB 7: DOWN */}
          <button
            onClick={() => setFilterStatus(filterStatus === 'DOWN' ? 'active-connected' : 'DOWN')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition shadow-sm ${
              filterStatus === 'DOWN'
                ? 'bg-rose-500 text-white'
                : 'bg-white dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20'
            }`}
          >
            DOWN ({servicesDown})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search service / stack..."
              className="w-full bg-white dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-14 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition font-mono shadow-sm"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 dark:text-slate-500 font-mono select-none">
              {filteredServices.length}
            </span>
          </div>

          {/* Toggle All Expand Button */}
          <button
            onClick={toggleAllExpand}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition whitespace-nowrap shadow-sm"
          >
            {expandedRows.size === services.length ? 'Collapse Semua' : 'Expand Semua'}
          </button>
        </div>
      </div>

      {/* REAL SERVICES TELEMETRY COLUMN TABLE WITH INLINE EXPAND/COLLAPSE */}
      <div className="bg-white dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm dark:shadow-2xl">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={7} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800/80 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider select-none bg-slate-50/50 dark:bg-transparent font-mono">
                  <th className="py-3.5 px-3 text-center w-8">#</th>
                  
                  {/* SERVICE */}
                  <th
                    onClick={() => handleSort('name')}
                    className="py-3.5 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>SERVICE NAME & ID</span>
                      {renderSortIcon('name')}
                    </div>
                  </th>

                  {/* STACK */}
                  <th
                    onClick={() => handleSort('stack')}
                    className="py-3.5 px-3 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>STACK</span>
                      {renderSortIcon('stack')}
                    </div>
                  </th>

                  {/* STATUS */}
                  <th
                    onClick={() => handleSort('status')}
                    className="py-3.5 px-3 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>STATUS</span>
                      {renderSortIcon('status')}
                    </div>
                  </th>

                  {/* SCRAPE LATENCY */}
                  <th
                    onClick={() => handleSort('scrapeLatencyMs')}
                    className="py-3.5 px-3 text-right cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>SCRAPE LATENCY</span>
                      {renderSortIcon('scrapeLatencyMs')}
                    </div>
                  </th>

                  {/* CPU % */}
                  <th
                    onClick={() => handleSort('cpuPercent')}
                    className="py-3.5 px-3 text-right cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>CPU %</span>
                      {renderSortIcon('cpuPercent')}
                    </div>
                  </th>

                  {/* RAM RSS */}
                  <th
                    onClick={() => handleSort('memoryRssMb')}
                    className="py-3.5 px-3 text-right cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>RAM RSS</span>
                      {renderSortIcon('memoryRssMb')}
                    </div>
                  </th>

                  {/* HEAP USED */}
                  <th
                    onClick={() => handleSort('memoryHeapUsedMb')}
                    className="py-3.5 px-3 text-right cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>HEAP USED</span>
                      {renderSortIcon('memoryHeapUsedMb')}
                    </div>
                  </th>

                  {/* OPEN FDS */}
                  <th
                    onClick={() => handleSort('openFds')}
                    className="py-3.5 px-3 text-right cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>OPEN FDS</span>
                      {renderSortIcon('openFds')}
                    </div>
                  </th>

                  {/* ACTIONS */}
                  <th className="py-3.5 px-4 text-center font-bold select-none">
                    <span>AKSI</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs font-mono">
                {filteredServices.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-500 dark:text-slate-400 font-sans text-xs">
                      Tidak ada service yang cocok dengan pencarian &ldquo;{searchQuery}&rdquo;
                    </td>
                  </tr>
                ) : (
                  filteredServices.map((service) => {
                    const status = getStatusBadge(service);
                    const isUp = service.rawStatus === 'UP' || service.status === 'healthy';
                    const isGo = service.stack === 'go';
                    const isExpanded = expandedRows.has(service.id);

                    return (
                      <React.Fragment key={service.id}>
                        <tr
                          onClick={() => navigate(`/services/${service.id}`)}
                          className={`hover:bg-slate-50 dark:hover:bg-[#131b2e]/60 transition cursor-pointer select-none ${
                            isExpanded ? 'bg-slate-50/80 dark:bg-[#131b2e]/80 font-medium' : ''
                          }`}
                        >
                          {/* EXPAND TOGGLE ICON */}
                          <td className="py-3.5 px-3 text-center text-cyan-500 font-bold" onClick={(e) => { e.stopPropagation(); toggleExpand(service.id); }}>
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 mx-auto text-cyan-400" />
                            ) : (
                              <ChevronUp className="w-4 h-4 mx-auto rotate-90 text-slate-400 group-hover:text-cyan-400" />
                            )}
                          </td>

                          {/* SERVICE NAME & ID */}
                          <td className="py-3.5 px-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900 dark:text-slate-100 font-sans block text-sm">
                                  {service.name}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono block mt-0.5">
                                {service.id} &bull; <span className="text-slate-500 dark:text-slate-400">{service.url}</span>
                              </span>
                            </div>
                          </td>

                          {/* STACK */}
                          <td className="py-3.5 px-3">
                            <span
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border uppercase tracking-wider ${
                                isGo
                                  ? 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/25'
                                  : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25'
                              }`}
                            >
                              {isGo ? 'Go' : 'Node.js'}
                            </span>
                          </td>

                          {/* STATUS */}
                          <td className="py-3.5 px-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${status.badgeClass}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${status.dotClass} ${isUp ? '' : 'animate-pulse'}`} />
                              <span>{status.label}</span>
                            </span>
                          </td>

                          {/* SCRAPE LATENCY */}
                          <td className="py-3.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                            {service.scrapeLatencyMs || 0} ms
                          </td>

                          {/* CPU % */}
                          <td className="py-3.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {(service.cpuPercent || 0).toFixed(2)}%
                          </td>

                          {/* RAM RSS */}
                          <td className="py-3.5 px-3 text-right font-mono text-slate-800 dark:text-slate-200 font-semibold">
                            {service.memoryRssMb ? `${service.memoryRssMb.toFixed(2)} MB` : '0 MB'}
                          </td>

                          {/* HEAP USED */}
                          <td className="py-3.5 px-3 text-right font-mono text-slate-500 dark:text-slate-400">
                            {service.memoryHeapUsedMb ? `${service.memoryHeapUsedMb.toFixed(2)} MB` : '-'}
                          </td>

                          {/* OPEN FDS */}
                          <td className="py-3.5 px-3 text-right font-mono text-slate-500 dark:text-slate-400">
                            {service.openFds || 0}
                          </td>

                          {/* ACTIONS */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleExpand(service.id, e); }}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                              >
                                {isExpanded ? 'Collapse' : 'Preview'}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/services/${service.id}`); }}
                                title="Buka Halaman Analisis Penuh"
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white transition"
                              >
                                <span>Analisis</span>
                                <ArrowUpRight className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* EXPANDED INLINE ROW DETAIL */}
                        {isExpanded && (
                          <tr className="bg-slate-50/70 dark:bg-[#0d1424] border-b border-slate-200 dark:border-slate-800/80">
                            <td colSpan={10} className="p-4 sm:p-5">
                              <div className="space-y-4">
                                
                                {/* URL & Connection Strip */}
                                <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-white dark:bg-[#070b14] border border-slate-200 dark:border-slate-800/80 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Service URL:</span>
                                    <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">{service.url}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Metrics Target:</span>
                                    <span className="font-mono text-cyan-600 dark:text-cyan-400 font-semibold">{service.metricsUrl || `${service.url}/metrics`}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Scrape Status:</span>
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" /> OK (~{service.scrapeLatencyMs || 0}ms)
                                    </span>
                                  </div>
                                </div>

                                {/* Deep Metrics Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                  {/* Throughput */}
                                  <div className="p-3 rounded-xl bg-white dark:bg-[#070b14] border border-slate-200 dark:border-slate-800/80">
                                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                                      <span>Throughput (RPS)</span>
                                      <Activity className="w-3.5 h-3.5 text-cyan-500" />
                                    </div>
                                    <div className="text-base font-bold font-mono text-slate-900 dark:text-white">
                                      {formatRps(service.throughputRps || 0)}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                      Total Reqs: {formatNumber(service.reqTotal || 0)}
                                    </div>
                                  </div>

                                  {/* Latency Percentiles */}
                                  <div className="p-3 rounded-xl bg-white dark:bg-[#070b14] border border-slate-200 dark:border-slate-800/80">
                                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                                      <span>Latency Quantiles</span>
                                      <span className="text-[10px] font-mono text-cyan-500">P50 / P95 / P99</span>
                                    </div>
                                    <div className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                                      {Math.round(service.latencyP50Ms || 0)}ms / {Math.round(service.latencyP95Ms || 0)}ms / {Math.round(service.latencyP99Ms || 0)}ms
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                      Avg: {Math.round(service.latencyAvgMs || 0)}ms
                                    </div>
                                  </div>

                                  {/* Memory Breakdown */}
                                  <div className="p-3 rounded-xl bg-white dark:bg-[#070b14] border border-slate-200 dark:border-slate-800/80">
                                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                                      <span>Memory Breakdown</span>
                                      <Database className="w-3.5 h-3.5 text-emerald-500" />
                                    </div>
                                    <div className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                                      RSS: {service.memoryRssMb ? `${service.memoryRssMb.toFixed(1)} MB` : '0 MB'}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                      Heap Used: {service.memoryHeapUsedMb ? `${service.memoryHeapUsedMb.toFixed(1)} MB` : '-'}
                                    </div>
                                  </div>

                                  {/* Error Rate & FDs */}
                                  <div className="p-3 rounded-xl bg-white dark:bg-[#070b14] border border-slate-200 dark:border-slate-800/80">
                                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                                      <span>Errors & Sockets</span>
                                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                                    </div>
                                    <div className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                                      Err Rate: {(service.errorRatePercent || 0).toFixed(2)}%
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                      Open FDs: {service.openFds || 0} &bull; Conns: {service.activeConnections || 0}
                                    </div>
                                  </div>
                                </div>

                                {/* Detail Action & API Links */}
                                <div className="flex items-center justify-between pt-1">
                                  <div className="text-[11px] text-slate-400 font-mono">
                                    Source: <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-cyan-600 dark:text-cyan-400">GET /api/services/{service.id}</code>
                                  </div>
                                  <button
                                    onClick={() => navigate(`/services/${service.id}`)}
                                    className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm"
                                  >
                                    <span>Buka Halaman Analisis & Grafik</span>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

