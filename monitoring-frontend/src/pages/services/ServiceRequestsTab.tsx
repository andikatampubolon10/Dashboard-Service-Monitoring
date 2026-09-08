import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useServiceRequests } from '../../hooks/useServiceRequests';
import { useServiceDailyRequests } from '../../hooks/useServiceDailyRequests';
import { DataTable, ColumnDef } from '../../components/tables/DataTable';
import { RequestDetail } from '../../components/monitoring/RequestDetail';
import { LineChart, LineSeriesConfig } from '../../components/charts/LineChart';
import { ChartSkeleton } from '../../components/common/LoadingSkeleton';
import { ServiceRequest } from '../../types';
import { formatTime } from '../../utils/dateUtils';
import { ArrowRight, Activity, TrendingUp } from 'lucide-react';

export const ServiceRequestsTab: React.FC = () => {
  const { id = 'live-consult-service' } = useParams<{ id: string }>();
  const [granularity, setGranularity] = useState<'hourly' | 'daily'>('daily');
  const { data: requests = [], isLoading } = useServiceRequests(id);
  const { data: dailyRequests = [], isLoading: isLoadingDaily } = useServiceDailyRequests(id, granularity);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);

  const requestTimelineSeries: LineSeriesConfig[] = [
    { key: 'successfulRequests', name: '2xx/3xx Success', color: '#10b981', strokeWidth: 2 },
    { key: 'clientErrors', name: '4xx Warn', color: '#f59e0b', strokeWidth: 2 },
    { key: 'serverErrors', name: '5xx Error', color: '#f43f5e', strokeWidth: 2 },
  ];

  const columns: ColumnDef<ServiceRequest>[] = [
    {
      key: 'method',
      header: 'METHOD & PATH',
      sortable: true,
      render: (row) => (
        <div className="font-mono text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] ${
              row.method === 'GET'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : row.method === 'POST'
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
            }`}
          >
            {row.method}
          </span>
          <span>{row.path}</span>
        </div>
      ),
    },
    {
      key: 'statusCode',
      header: 'STATUS',
      sortable: true,
      render: (row) => (
        <span
          className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${
            row.statusCode >= 500
              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
              : row.statusCode >= 400
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
          }`}
        >
          {row.statusCode}
        </span>
      ),
    },
    {
      key: 'durationMs',
      header: 'DURATION',
      sortable: true,
      render: (row) => (
        <span
          className={`font-mono font-semibold ${
            row.durationMs > 1000
              ? 'text-rose-600 dark:text-rose-400 font-bold'
              : row.durationMs > 100
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {row.durationMs.toFixed(1)} ms
        </span>
      ),
    },
    {
      key: 'traceId',
      header: 'TRACE ID',
      render: (row) => (
        <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px]">
          {row.traceId}
        </span>
      ),
    },
    {
      key: 'timestamp',
      header: 'TIME',
      sortable: true,
      render: (row) => (
        <span className="text-slate-500 dark:text-slate-400 text-[11px] font-mono">
          {formatTime(row.timestamp)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'ACTION',
      align: 'right',
      render: (row) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedRequest(row);
          }}
          className="inline-flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400 font-semibold hover:underline"
        >
          <span>Inspect Trace</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header & Time-series Line Chart */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-500" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Request Rate &amp; Volume Timeline ({id})
            </h2>
          </div>
          
          {/* Granularity Toggle */}
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
              Per Hari (7d)
            </button>
          </div>
        </div>

        {isLoadingDaily ? (
          <ChartSkeleton height="h-48" />
        ) : (
          <LineChart
            data={dailyRequests as unknown as Record<string, unknown>[]}
            series={requestTimelineSeries}
            height={200}
            unit="reqs"
          />
        )}
      </div>

      {/* Raw Trace Stream Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-500" />
              <span>Trace Ingress Log ({requests.length} events sampled)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click any request row to inspect HTTP headers, payloads, and APM waterfall timeline
            </p>
          </div>
        </div>

        <DataTable
          data={requests as unknown as Record<string, unknown>[]}
          columns={columns as unknown as ColumnDef<Record<string, unknown>>[]}
          isLoading={isLoading}
          onRowClick={(row) => setSelectedRequest(row as unknown as ServiceRequest)}
          searchPlaceholder="Filter requests by path, trace ID..."
          pageSize={10}
        />
      </div>

      <RequestDetail
        request={selectedRequest}
        isOpen={Boolean(selectedRequest)}
        onClose={() => setSelectedRequest(null)}
      />
    </div>
  );
};
