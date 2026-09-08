import React from 'react';
import { useParams } from 'react-router-dom';
import { useServiceLatency } from '../../hooks/useServiceLatency';
import { useServiceDetail } from '../../hooks/useServices';
import { LineChart, LineSeriesConfig } from '../../components/charts/LineChart';
import { BarChart, BarSeriesConfig } from '../../components/charts/BarChart';
import { ChartSkeleton } from '../../components/common/LoadingSkeleton';
import { formatLatency } from '../../utils/formatters';
import { Clock } from 'lucide-react';

export const ServiceLatencyTab: React.FC = () => {
  const { id = 'live-consult-service' } = useParams<{ id: string }>();
  const { data: service } = useServiceDetail(id);
  const { data: latencyHistory = [], isLoading } = useServiceLatency(id);

  const latencySeries: LineSeriesConfig[] = [
    { key: 'p50', name: 'p50 Median', color: '#06b6d4', strokeWidth: 2 },
    { key: 'p90', name: 'p90 Latency', color: '#10b981', strokeWidth: 2 },
    { key: 'p95', name: 'p95 Latency', color: '#f59e0b', strokeWidth: 2 },
    { key: 'p99', name: 'p99 Tail', color: '#f43f5e', strokeWidth: 2 },
  ];

  const histogramData = [
    { bucket: '< 10ms', count: 18500 },
    { bucket: '10 - 25ms', count: 12400 },
    { bucket: '25 - 50ms', count: 6200 },
    { bucket: '50 - 100ms', count: 3100 },
    { bucket: '100 - 250ms', count: 1420 },
    { bucket: '> 250ms', count: 580 },
  ];

  const barSeries: BarSeriesConfig[] = [
    { key: 'count', name: 'Request Count', color: '#06b6d4' },
  ];

  return (
    <div className="space-y-6">
      {/* Percentile Summary Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl shadow-sm dark:shadow-xl flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
            <Clock className="w-3.5 h-3.5 text-cyan-500" />
            <span>p50 Median</span>
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-600 dark:text-cyan-400 mt-2">
            {formatLatency(service?.latencyP50Ms || 18)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 font-mono">50% of requests faster than this</span>
        </div>

        <div className="p-5 bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl shadow-sm dark:shadow-xl flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
            <Clock className="w-3.5 h-3.5 text-emerald-500" />
            <span>p90 Latency</span>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-2">
            {formatLatency(service?.latencyP90Ms || 28)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 font-mono">90% of requests faster than this</span>
        </div>

        <div className="p-5 bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl shadow-sm dark:shadow-xl flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            <span>p95 Latency</span>
          </div>
          <div className={`text-2xl font-bold font-mono mt-2 ${
            (service?.latencyP95Ms || 0) > 50 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'
          }`}>
            {formatLatency(service?.latencyP95Ms || 42)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 font-mono">SLA Threshold: 50.0 ms</span>
        </div>

        <div className="p-5 bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl shadow-sm dark:shadow-xl flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
            <Clock className="w-3.5 h-3.5 text-rose-500" />
            <span>p99 Tail</span>
          </div>
          <div className={`text-2xl font-bold font-mono mt-2 ${
            (service?.latencyP99Ms || 0) > 100 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
          }`}>
            {formatLatency(service?.latencyP99Ms || 112)}
          </div>
          <span className="text-[10px] text-rose-500/80 mt-1 font-mono">Outlier tail latency ceiling</span>
        </div>
      </div>

      {/* Latency Timeline Line Chart */}
      <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
          Latency Percentiles Over Time (p50 / p90 / p95 / p99)
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Time-series response duration in milliseconds across the selected window
        </p>

        {isLoading ? (
          <ChartSkeleton />
        ) : (
          <LineChart
            data={latencyHistory as unknown as Record<string, unknown>[]}
            series={latencySeries}
            height={280}
            unit="ms"
          />
        )}
      </div>

      {/* Duration Histogram Bar Chart */}
      <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
          Response Duration Distribution Histogram
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Volume of requests bucketed by response latency
        </p>

        <BarChart
          data={histogramData}
          series={barSeries}
          xAxisKey="bucket"
          height={240}
          unit="reqs"
        />
      </div>
    </div>
  );
};
