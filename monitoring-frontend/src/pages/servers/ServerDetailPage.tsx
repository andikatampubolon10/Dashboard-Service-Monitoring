import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useServerDetail } from '../../hooks/useServers';
import { useServices } from '../../hooks/useServices';
import { ErrorState } from '../../components/common/ErrorState';
import { CardSkeleton } from '../../components/common/LoadingSkeleton';
import { formatNumber } from '../../utils/formatters';
import {
  Cpu,
  HardDrive,
  Clock,
  Layers,
  ArrowLeft,
} from 'lucide-react';

export const ServerDetailPage: React.FC = () => {
  const { id = 'prod-web-01' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: server, isLoading, isError, refetch } = useServerDetail(id);
  const { data: allServices = [], isLoading: isLoadingServices } = useServices();

  if (isError || (!isLoading && !server)) {
    return (
      <ErrorState
        title="Server Not Found"
        message={`Could not find server node with id "${id}"`}
        onRetry={refetch}
      />
    );
  }

  // Filter hosted services
  const hostedServicesList = allServices.filter(
    (s) => s.serverId === id || (server && server.hostedServices.includes(s.id))
  );

  const memPercent = server
    ? Math.round((server.memoryUsedBytes / server.memoryTotalBytes) * 100)
    : 0;

  const isHealthy = server?.status === 'healthy';

  return (
    <div className="space-y-6">
      {/* Breadcrumbs & Header */}
      <div className="space-y-2">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-slate-400">
          <Link to="/servers" className="hover:text-orange-500 hover:underline transition">
            Servers
          </Link>
          <span>&gt;</span>
          <span className="text-slate-800 dark:text-slate-200 font-semibold">{server?.name || id}</span>
        </div>

        {/* Server Title, Meta & Back Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
              {server?.name || id}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
              {server?.os || 'Ubuntu 22.04.3 LTS'} &bull; {server?.ip || '10.10.1.21'}
            </p>

            {/* Status line & tags */}
            <div className="flex items-center gap-2.5 mt-3 text-xs font-mono">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                  isHealthy
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isHealthy ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span className="capitalize">{server?.status || 'healthy'}</span>
              </span>

              <span className="text-slate-500 dark:text-slate-400">
                {(server?.env || 'production').toLowerCase()} &bull; {server?.region || 'jakarta-idc'}
              </span>
            </div>
          </div>

          {/* Back Button */}
          <Link
            to="/servers"
            className="self-start sm:self-center inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </Link>
        </div>
      </div>

      {/* 4 Metric Cards Grid matching exact screenshot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading || !server ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            {/* CPU Card */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  CPU
                </span>
                <Cpu className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              </div>
              <div className="mt-4">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
                  {server.cpuUsagePercent.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* MEMORY Card */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  MEMORY
                </span>
                <HardDrive className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              </div>
              <div className="mt-4">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
                  {memPercent.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* UPTIME Card */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  UPTIME
                </span>
                <Clock className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
              </div>
              <div className="mt-4">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
                  {server.uptime}
                </div>
              </div>
            </div>

            {/* SERVICES Card */}
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  SERVICES
                </span>
                <Layers className="w-4 h-4 text-orange-500 dark:text-orange-400" />
              </div>
              <div className="mt-4">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
                  {server.hostedServices.length}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Services on this host Section matching exact screenshot */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
          Services on this host
        </h2>

        <div className="space-y-2.5">
          {isLoadingServices ? (
            <CardSkeleton />
          ) : hostedServicesList.length === 0 ? (
            <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-xl p-8 text-center text-slate-400 font-mono text-xs">
              No microservices currently scheduled on this host node.
            </div>
          ) : (
            hostedServicesList.map((svc) => {
              const svcDegraded = svc.status === 'degraded' || svc.status === 'warning';
              // Calculate representative requests count
              const requestsCount = svc.throughputRps ? Math.round(svc.throughputRps * 1140) : 128450;

              return (
                <div
                  key={svc.id}
                  onClick={() => navigate(`/services/${svc.id}`)}
                  className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl p-4 shadow-sm dark:shadow-lg transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                >
                  {/* Left: Status & Service Name & Version/Team */}
                  <div className="flex items-center gap-3.5">
                    {/* Status Dot + Text */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          svcDegraded ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                      />
                      <span
                        className={`text-xs font-semibold font-mono ${
                          svcDegraded ? 'text-amber-500' : 'text-emerald-500'
                        }`}
                      >
                        {svcDegraded ? 'Degraded' : 'Healthy'}
                      </span>
                    </div>

                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-orange-500 transition">
                        {svc.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                        {svc.version || 'v2.14.3'} &bull; {svc.category === 'identity' ? 'Security Team' : svc.category === 'messaging' ? 'Platform Team' : 'Core Team'}
                      </div>
                    </div>
                  </div>

                  {/* Right: Requests, Errors, p95 */}
                  <div className="flex items-center gap-6 sm:gap-8 font-mono text-right shrink-0">
                    {/* Requests */}
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {formatNumber(requestsCount)}
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                        requests
                      </div>
                    </div>

                    {/* Errors */}
                    <div>
                      <div
                        className={`text-xs font-bold ${
                          svc.errorCount > 100
                            ? 'text-rose-500 dark:text-rose-400'
                            : svc.errorCount > 0
                            ? 'text-amber-500 dark:text-amber-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {formatNumber(svc.errorCount)}
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                        errors
                      </div>
                    </div>

                    {/* P95 Latency */}
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {Math.round(svc.latencyP95Ms)}ms
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                        p95
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
