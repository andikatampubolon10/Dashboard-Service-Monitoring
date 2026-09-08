import React from 'react';
import { useParams } from 'react-router-dom';
import { useServiceDetail } from '../../hooks/useServices';
import { useServiceDailyRequests } from '../../hooks/useServiceDailyRequests';
import { LineChart, LineSeriesConfig } from '../../components/charts/LineChart';
import { BarChart, BarSeriesConfig } from '../../components/charts/BarChart';
import { ChartSkeleton } from '../../components/common/LoadingSkeleton';
import { formatNumber } from '../../utils/formatters';
import { Cpu, Radio, Network } from 'lucide-react';

export const ServiceOverviewTab: React.FC = () => {
  const { id = 'ai-consultation' } = useParams<{ id: string }>();
  const { data: service, isLoading: isLoadingService } = useServiceDetail(id);
  const { data: dailyRequestsQuery = [], isLoading: isLoadingDaily } = useServiceDailyRequests(id, 'daily');

  const isDown = service?.rawStatus === 'DOWN' || service?.status === 'critical' || service?.status === 'offline';
  const dailyRequests = dailyRequestsQuery;

  // Calculations for daily request summaries
  const totalWeekRequests = React.useMemo(() => {
    return dailyRequests.reduce((sum, item) => sum + item.totalRequests, 0);
  }, [dailyRequests]);

  const avgDailyRequests = React.useMemo(() => {
    return dailyRequests.length ? Math.round(totalWeekRequests / dailyRequests.length) : 0;
  }, [dailyRequests, totalWeekRequests]);

  const peakDay = React.useMemo(() => {
    if (!dailyRequests.length) return null;
    return dailyRequests.reduce((max, item) => (item.totalRequests > max.totalRequests ? item : max), dailyRequests[0]);
  }, [dailyRequests]);

  const totalWeekErrors = React.useMemo(() => {
    return dailyRequests.reduce((sum, item) => sum + item.clientErrors + item.serverErrors, 0);
  }, [dailyRequests]);

  const successRate = React.useMemo(() => {
    if (totalWeekRequests === 0) return '100.00';
    const success = dailyRequests.reduce((sum, item) => sum + item.successfulRequests, 0);
    return ((success / totalWeekRequests) * 100).toFixed(2);
  }, [dailyRequests, totalWeekRequests]);

  // Series for daily request stacked bar chart
  const dailyRequestSeries: BarSeriesConfig[] = [
    { key: 'successfulRequests', name: 'Sukses (2xx/3xx)', color: '#10b981', stackId: 'req' },
    { key: 'clientErrors', name: 'Client Error (4xx)', color: '#f59e0b', stackId: 'req' },
    { key: 'serverErrors', name: 'Server Error (5xx)', color: '#f43f5e', stackId: 'req' },
  ];

  const dailyChartData = React.useMemo(() => {
    return dailyRequests.map((d) => ({
      ...d,
      shortLabel: d.timestamp?.split(',')[0] || d.date,
    }));
  }, [dailyRequests]);

  const latencySeries: LineSeriesConfig[] = [
    { key: 'p50', name: 'p50', color: '#06b6d4', strokeWidth: 2 },
    { key: 'p90', name: 'p90', color: '#10b981', strokeWidth: 2 },
    { key: 'p95', name: 'p95', color: '#f59e0b', strokeWidth: 2 },
    { key: 'p99', name: 'p99', color: '#f43f5e', strokeWidth: 2 },
  ];

  // Latency historical datapoints
  const latencyHistoryData = React.useMemo(() => {
    if (dailyRequests.length > 0) {
      return dailyRequests.map((d) => ({
        timestamp: d.date,
        p50: service?.latencyP50Ms || 0,
        p90: service?.latencyP90Ms || 0,
        p95: service?.latencyP95Ms || 0,
        p99: service?.latencyP99Ms || 0,
      }));
    }
    return [];
  }, [dailyRequests, service]);

  // Real errors breakdown from backend
  const errorsByTypeData = [
    { name: '5xx Server Error', count: service?.total5xx || (service?.metrics?.errorRate?.total5xx ?? 0) },
    { name: '4xx Client Error', count: service?.total4xx || (service?.metrics?.errorRate?.total4xx ?? 0) },
  ];

  const errorBarSeries: BarSeriesConfig[] = [
    { key: 'count', name: 'Errors', color: '#f43f5e' },
  ];

  return (
    <div className="space-y-6">
      {/* 1. RUNTIME TELEMETRY & SPECS CARD */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Connection & File Descriptors */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 shadow-sm dark:shadow-xl space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Network className="w-4 h-4 text-cyan-500" />
              <span>Runtime & Network Connections</span>
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {service?.stack?.toUpperCase() || 'NODEJS'}
            </span>
          </div>
          <div className="space-y-2 text-slate-600 dark:text-slate-300 divide-y divide-slate-100 dark:divide-slate-800/60">
            <div className="flex justify-between pt-2">
              <span className="text-slate-500 dark:text-slate-400">Open File Descriptors:</span>
              <strong className="text-slate-900 dark:text-white">{service?.openFds ?? (service?.metrics?.connections?.openFds ?? 0)}</strong>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-slate-500 dark:text-slate-400">Active WS / SSE Sessions:</span>
              <strong className="text-slate-900 dark:text-white">{service?.activeConnections ?? 0}</strong>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-slate-500 dark:text-slate-400">Loopback Scrape Latency:</span>
              <strong className="text-cyan-600 dark:text-cyan-400">{service?.scrapeLatencyMs ?? 33} ms</strong>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-slate-500 dark:text-slate-400">Prometheus Scrape Endpoint:</span>
              <strong className="text-cyan-600 dark:text-cyan-400 truncate max-w-[220px]">
                {service?.metricsUrl || `${service?.url}/metrics`}
              </strong>
            </div>
          </div>
        </div>

        {/* Process Memory Breakdown */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 shadow-sm dark:shadow-xl space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-500" />
              <span>Process Memory & Compute</span>
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              TELEMETRY
            </span>
          </div>
          <div className="space-y-2 text-slate-600 dark:text-slate-300 divide-y divide-slate-100 dark:divide-slate-800/60">
            <div className="flex justify-between pt-2">
              <span className="text-slate-500 dark:text-slate-400">Memory RSS (Resident Set):</span>
              <strong className="text-slate-900 dark:text-white">{service?.memoryRssMb ?? (service?.metrics?.memory?.rssMb ?? 0)} MB</strong>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-slate-500 dark:text-slate-400">Heap / Alloc Memory:</span>
              <strong className="text-slate-900 dark:text-white">
                {service?.memoryHeapUsedMb ?? (service?.metrics?.memory?.heapUsedMb ?? 0)} MB
              </strong>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-slate-500 dark:text-slate-400">CPU Usage Percent:</span>
              <strong className="text-slate-900 dark:text-white">{service?.cpuPercent ?? (service?.metrics?.cpu?.usagePercent ?? 0)}%</strong>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-slate-500 dark:text-slate-400">Route Endpoints Count:</span>
              <strong className="text-slate-900 dark:text-white">{service?.endpointsCount ?? 0} routes</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 2. GRAFIK REQUEST HARIAN (DAILY REQUESTS TREND) */}
      <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Grafik Request Harian (Daily Requests Volume)
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                Live Data
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Volume request per hari dari scraper backend (Sukses 2xx/3xx, 4xx, dan 5xx)
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-slate-500 dark:text-slate-400 shrink-0">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span> Sukses
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-amber-500"></span> 4xx Client
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-rose-500"></span> 5xx Server
            </span>
          </div>
        </div>

        {/* Stacked Bar Chart or Clean Empty State */}
        {isLoadingDaily ? (
          <ChartSkeleton height="h-64" />
        ) : dailyChartData.length > 0 ? (
          <BarChart
            data={dailyChartData}
            series={dailyRequestSeries}
            xAxisKey="shortLabel"
            height={250}
            unit="reqs"
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
              {isDown
                ? `Jalankan service ${service?.name || id} di portnya untuk mulai mengumpulkan request HTTP traffic.`
                : 'Data grafik harian akan otomatis teragregasi setelah request HTTP tercatat oleh Prometheus.'}
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
              {peakDay ? `${peakDay.timestamp} (${formatNumber(peakDay.totalRequests)})` : '-'}
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

      {/* 3. 2 Side-by-Side Cards: Latency & Errors by type */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Latency Chart */}
        <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Latency Percentiles
            </h2>
            <span className="text-xs font-mono text-slate-400">
              p50 / p90 / p95 / p99
            </span>
          </div>

          {isLoadingDaily || isLoadingService ? (
            <ChartSkeleton height="h-64" />
          ) : latencyHistoryData.length > 0 ? (
            <LineChart
              data={latencyHistoryData}
              series={latencySeries}
              height={260}
              unit="ms"
            />
          ) : (
            <div className="py-12 px-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 border border-dashed border-slate-200 dark:border-slate-800 text-center font-mono">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                P99 Latency: {service?.latencyP99Ms || 0} ms
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                P50: {service?.latencyP50Ms || 0}ms &bull; P90: {service?.latencyP90Ms || 0}ms &bull; P95: {service?.latencyP95Ms || 0}ms
              </p>
            </div>
          )}
        </div>

        {/* Right: Errors by type Chart */}
        <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Errors Breakdown
            </h2>
            <span className="text-xs font-mono font-bold text-rose-500">
              {formatNumber(service?.errorCount || 0)} total
            </span>
          </div>

          {isLoadingService ? (
            <ChartSkeleton height="h-64" />
          ) : (
            <BarChart
              data={errorsByTypeData}
              series={errorBarSeries}
              xAxisKey="name"
              height={260}
              unit="errs"
            />
          )}
        </div>
      </div>
    </div>
  );
};
