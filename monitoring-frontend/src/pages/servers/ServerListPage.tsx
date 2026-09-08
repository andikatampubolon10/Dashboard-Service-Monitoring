import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServers } from '../../hooks/useServers';
import { ErrorState } from '../../components/common/ErrorState';
import { TableSkeleton } from '../../components/common/LoadingSkeleton';
import { Server as ServerIcon, Search, MapPin, ArrowUpDown } from 'lucide-react';

export const ServerListPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: servers = [], isLoading, isError, refetch } = useServers();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const filteredServers = useMemo(() => {
    let list = [...servers];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.env && s.env.toLowerCase().includes(q)) ||
          s.region.toLowerCase().includes(q) ||
          s.status.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let valA: string | number = (a as unknown as Record<string, string | number>)[sortKey] ?? '';
      let valB: string | number = (b as unknown as Record<string, string | number>)[sortKey] ?? '';

      if (sortKey === 'memory') {
        valA = a.memoryTotalBytes > 0 ? (a.memoryUsedBytes / a.memoryTotalBytes) * 100 : 0;
        valB = b.memoryTotalBytes > 0 ? (b.memoryUsedBytes / b.memoryTotalBytes) * 100 : 0;
      } else if (sortKey === 'services') {
        valA = a.hostedServices.length;
        valB = b.hostedServices.length;
      } else if (sortKey === 'status') {
        valA = a.status || '';
        valB = b.status || '';
      } else if (sortKey === 'uptime') {
        valA = a.uptime || '';
        valB = b.uptime || '';
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }, [servers, searchQuery, sortKey, sortAsc]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const renderSortIcon = (key: string) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-50" />;
    }
    return sortAsc ? (
      <span className="text-orange-500 font-bold">&uarr;</span>
    ) : (
      <span className="text-orange-500 font-bold">&darr;</span>
    );
  };

  if (isError) {
    return <ErrorState onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      {/* Title & Subtitle */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Servers
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Infrastructure hosts and resource utilization
        </p>
      </div>

      {/* Search Bar with Rows Count */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search servers..."
          className="w-full bg-white dark:bg-[#111827]/80 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-20 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500 dark:focus:border-slate-700 shadow-sm transition"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 dark:text-slate-400 font-mono select-none">
          {filteredServers.length} rows
        </span>
      </div>

      {/* Servers Telemetry Table matching screenshot */}
      <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl overflow-hidden shadow-sm dark:shadow-xl">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={4} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-transparent text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider select-none">
                  <th
                    onClick={() => handleSort('name')}
                    className="py-3.5 px-5 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>SERVER</span>
                      {renderSortIcon('name')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('env')}
                    className="py-3.5 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>ENV</span>
                      {renderSortIcon('env')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="py-3.5 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>STATUS</span>
                      {renderSortIcon('status')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('cpuUsagePercent')}
                    className="py-3.5 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>CPU</span>
                      {renderSortIcon('cpuUsagePercent')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('memory')}
                    className="py-3.5 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>MEMORY</span>
                      {renderSortIcon('memory')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('region')}
                    className="py-3.5 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>REGION</span>
                      {renderSortIcon('region')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('services')}
                    className="py-3.5 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>SERVICES</span>
                      {renderSortIcon('services')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('uptime')}
                    className="py-3.5 px-5 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>UPTIME</span>
                      {renderSortIcon('uptime')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs font-mono">
                {filteredServers.map((server) => {
                  const memPercent = Math.round(
                    (server.memoryUsedBytes / server.memoryTotalBytes) * 100
                  );
                  const isDegraded = server.status === 'degraded' || server.status === 'warning';

                  return (
                    <tr
                      key={server.id}
                      onClick={() => navigate(`/servers/${server.id}`)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer group"
                    >
                      {/* Server Name */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <ServerIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-cyan-600 dark:group-hover:text-white transition shrink-0" />
                          <span className="font-bold text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition">
                            {server.name}
                          </span>
                        </div>
                      </td>

                      {/* ENV */}
                      <td className="py-4 px-4 font-semibold">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] uppercase">
                          {server.env || 'PRODUCTION'}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                            isDegraded
                              ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/25'
                              : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isDegraded ? 'bg-amber-500 dark:bg-amber-400' : 'bg-emerald-500 dark:bg-emerald-400'
                            }`}
                          />
                          <span className="capitalize">{server.status}</span>
                        </span>
                      </td>

                      {/* CPU Bar + Value */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-16 sm:w-20 bg-slate-100 dark:bg-slate-800/80 h-1.5 rounded-full overflow-hidden shrink-0">
                            <div
                              className={`h-full rounded-full ${
                                server.cpuUsagePercent >= 80
                                  ? 'bg-rose-500'
                                  : server.cpuUsagePercent >= 60
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500 dark:bg-emerald-400'
                              }`}
                              style={{ width: `${server.cpuUsagePercent}%` }}
                            />
                          </div>
                          <span className="text-slate-800 dark:text-slate-200 font-bold w-8">
                            {server.cpuUsagePercent}%
                          </span>
                        </div>
                      </td>

                      {/* Memory Bar + Value */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-16 sm:w-20 bg-slate-100 dark:bg-slate-800/80 h-1.5 rounded-full overflow-hidden shrink-0">
                            <div
                              className={`h-full rounded-full ${
                                memPercent >= 80
                                  ? 'bg-rose-500'
                                  : memPercent >= 60
                                  ? 'bg-orange-500 dark:bg-orange-400'
                                  : 'bg-emerald-500 dark:bg-emerald-400'
                              }`}
                              style={{ width: `${memPercent}%` }}
                            />
                          </div>
                          <span className="text-slate-800 dark:text-slate-200 font-bold w-8">
                            {memPercent}%
                          </span>
                        </div>
                      </td>

                      {/* Region */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                          <span>{server.region}</span>
                        </div>
                      </td>

                      {/* Services count */}
                      <td className="py-4 px-4 text-slate-800 dark:text-slate-200 font-bold">
                        {server.hostedServices.length}
                      </td>

                      {/* Uptime */}
                      <td className="py-4 px-5 text-slate-600 dark:text-slate-400">
                        {server.uptime}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
