import React from 'react';
import { useParams, NavLink, Outlet, Link, Navigate } from 'react-router-dom';
import { useServiceDetail, useServices } from '../../hooks/useServices';
import { ErrorState } from '../../components/common/ErrorState';
import { formatNumber, formatRps } from '../../utils/formatters';
import { AlertTriangle } from 'lucide-react';

export const ServiceDetailPage: React.FC = () => {
  const { id = 'ai-consultation' } = useParams<{ id: string }>();

  // If someone visits /services/billing-engine, redirect to ai-consultation
  if (id === 'billing-engine') {
    return <Navigate to="/services/ai-consultation" replace />;
  }

  const { data: service, isLoading, isError, refetch } = useServiceDetail(id);
  const { data: allServices = [] } = useServices();

  if (isError || (!isLoading && !service)) {
    return (
      <ErrorState
        title="Microservice Not Found"
        message={`Could not find microservice with id "${id}". Available services: ai-consultation, audit, health-profile, identity, lifestyle, live-consult, medical-record.`}
        onRetry={refetch}
      />
    );
  }

  // Use loaded service or fallback safe empty structure while loading
  const activeService = service || {
    id,
    name: id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Service',
    description: 'Loading telemetry...',
    status: 'offline' as const,
    rawStatus: 'DOWN',
    serverId: 'node-runtime-host',
    serverName: 'Local Node/Go Host',
    throughputRps: 0,
    errorCount: 0,
    errorRatePercent: 0,
    latencyP50Ms: 0,
    latencyP90Ms: 0,
    latencyP95Ms: 0,
    latencyP99Ms: 0,
    uptimePercent: 0,
    instancesCount: 1,
    category: 'core' as const,
    endpointsCount: 0,
    lastDeployment: new Date().toISOString(),
    gitCommit: 'main',
    version: 'v1.0.0',
    uptime: 'Offline',
    stack: id === 'identity' || id === 'audit' || id === 'live-consult' ? 'go' : 'nodejs',
  };

  const isUp = activeService.rawStatus === 'UP' || activeService.status === 'healthy';
  const isGo = activeService.stack === 'go';

  // Metrics directly from backend
  const requestsCount = activeService.reqTotal ?? (activeService.metrics?.throughput?.reqTotal ?? 0);
  const rps = activeService.throughputRps ?? (activeService.metrics?.throughput?.reqPerSecond ?? 0);
  const p50 = Math.round(activeService.latencyP50Ms ?? (activeService.metrics?.latency?.p50Ms ?? 0));
  const p95 = Math.round(activeService.latencyP95Ms ?? (activeService.metrics?.latency?.p95Ms ?? 0));
  const p99 = Math.round(activeService.latencyP99Ms ?? (activeService.metrics?.latency?.p99Ms ?? 0));
  const errorRate = activeService.errorRatePercent ?? (activeService.metrics?.errorRate?.percent ?? 0);
  const errorCount = activeService.errorCount ?? 0;
  const memoryRss = activeService.memoryRssMb ?? (activeService.metrics?.memory?.rssMb ?? 0);
  const cpuPercent = activeService.cpuPercent ?? (activeService.metrics?.cpu?.usagePercent ?? 0);

  const tabs: { to: string; label: string; end: boolean; badge?: string }[] = [
    { to: `/services/${id}`, label: 'Overview', end: true },
    { to: `/services/${id}/requests`, label: 'Requests', end: false },
    { to: `/services/${id}/errors`, label: 'Errors', end: false },
    { to: `/services/${id}/latency`, label: 'Latency', end: false },
    { to: `/services/${id}/logs`, label: 'Logs', end: false },
    { to: `/services/${id}/dependencies`, label: 'Dependencies', end: false },
    { to: `/services/${id}/alerts`, label: 'Alerts', end: false },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Service Switcher */}
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-slate-400">
          <Link to="/services" className="hover:text-orange-500 hover:underline transition">
            Services
          </Link>
          <span>&gt;</span>
          <span className="text-slate-800 dark:text-slate-200 font-semibold">{activeService.name}</span>
        </div>

        {/* Title, Subtitle, Status line & Quick Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                {activeService.name}
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold uppercase border ${
                  isGo
                    ? 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/25'
                    : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25'
                }`}
              >
                {isGo ? 'Go' : 'Node.js'}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                  isUp
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25'
                    : 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isUp ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-rose-500 animate-pulse'
                  }`}
                />
                <span>{isUp ? 'UP' : 'DOWN'}</span>
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-sans">
              {activeService.description}
            </p>

            <div className="flex items-center gap-3 text-xs font-mono text-slate-500 dark:text-slate-400 mt-2 flex-wrap">
              <span>Target: <strong className="text-slate-700 dark:text-slate-300">{activeService.url || 'http://localhost'}</strong></span>
              <span>&bull;</span>
              <span>Metrics: <strong className="text-cyan-600 dark:text-cyan-400">{activeService.metricsUrl || `${activeService.url}/metrics`}</strong></span>
              <span>&bull;</span>
              <span>Scrape Latency: <strong className="text-slate-700 dark:text-slate-300">{activeService.scrapeLatencyMs || 33}ms</strong></span>
            </div>
          </div>

          {/* Quick Service Switcher Dropdown & Back Button */}
          <div className="flex items-center gap-2 self-start sm:self-center">
            {allServices.length > 0 && (
              <select
                value={activeService.id}
                onChange={(e) => (window.location.href = `/services/${e.target.value}`)}
                className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 shadow-sm"
              >
                {allServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.stack?.toUpperCase()})
                  </option>
                ))}
              </select>
            )}

            <Link
              to="/services"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition shadow-sm font-sans"
            >
              <span>&larr; All Services</span>
            </Link>
          </div>
        </div>
      </div>

      {/* REAL DIAGNOSTIC BANNER IF SERVICE IS DOWN */}
      {!isUp && (
        <div className="p-4 rounded-2xl bg-rose-50/80 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-base shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <span>Scrape Status: DOWN ({activeService.error || 'Connection Refused'})</span>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Backend monitoring gagal menjangkau scrape metrics di{' '}
                <code className="text-cyan-600 dark:text-cyan-300 font-mono">
                  {activeService.metricsUrl || `${activeService.url}/metrics`}
                </code>{' '}
                karena service belum aktif di port lokalnya.
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-1">
                Jalankan service ini dengan:{' '}
                <code className="text-orange-600 dark:text-orange-400 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded">
                  {isGo ? 'go run .' : 'npm run dev'}
                </code>{' '}
                pada direktori servicenya.
              </div>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="self-start sm:self-center px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-mono font-semibold transition shrink-0 border border-slate-200 dark:border-slate-700"
          >
            Refetch Scrape &rarr;
          </button>
        </div>
      )}

      {/* 5 REAL KPI METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* THROUGHPUT */}
        <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
            THROUGHPUT
          </span>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono mt-3 tracking-tight">
            {formatRps(rps)}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-1">
            Realtime rate
          </div>
        </div>

        {/* TOTAL REQUESTS */}
        <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
            TOTAL REQUESTS
          </span>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono mt-3 tracking-tight">
            {formatNumber(requestsCount)}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-1">
            Recorded Prometheus
          </div>
        </div>

        {/* ERRORS */}
        <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
            ERRORS
          </span>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-rose-500 font-mono tracking-tight">
              {formatNumber(errorCount)}
            </div>
            <div className="text-xs text-rose-500/80 font-mono mt-0.5 font-bold">
              {errorRate}%
            </div>
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-1">
            5xx/4xx responses
          </div>
        </div>

        {/* P99 LATENCY */}
        <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
            P99 LATENCY
          </span>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono mt-3 tracking-tight">
            {p99}ms
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-1">
            p50: {p50}ms &bull; p95: {p95}ms
          </div>
        </div>

        {/* MEMORY (RSS) & CPU */}
        <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
            MEMORY (RSS)
          </span>
          <div className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 font-mono mt-3 tracking-tight">
            {memoryRss} MB
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1">
            CPU: {cpuPercent}%
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs Bar */}
      <div className="border-b border-slate-200 dark:border-slate-800/80 flex items-center gap-6 overflow-x-auto text-xs font-semibold select-none">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `pb-3 transition whitespace-nowrap flex items-center gap-1.5 border-b-2 font-medium font-mono ${
                isActive
                  ? 'border-orange-500 text-slate-900 dark:text-white font-bold'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`
            }
          >
            <span>{tab.label}</span>
            {tab.badge && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-500">
                {tab.badge}
              </span>
            )}
          </NavLink>
        ))}
      </div>

      {/* Sub-Tab Content Outlet */}
      <Outlet context={{ service: activeService }} />
    </div>
  );
};
