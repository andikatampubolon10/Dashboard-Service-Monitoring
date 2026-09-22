import React, { useState, useMemo } from "react";
import {
  FolderKanban,
  RefreshCw,
  Server,
  Network,
  Activity,
  Cpu,
  HardDrive,
  Search,
  Zap,
  ChevronRight,
  Layers,
} from "lucide-react";
import { Project, Server as ServerType } from "../../types";

interface StressTestProjectListPageProps {
  projects: Project[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelectProject: (projectId: string) => void;
  serversList?: ServerType[];
}

export const StressTestProjectListPage: React.FC<StressTestProjectListPageProps> = ({
  projects,
  isLoading,
  onRefresh,
  onSelectProject,
  serversList = [],
}) => {
  const [projectSearch, setProjectSearch] = useState<string>("");
  const [projectEnvFilter, setProjectEnvFilter] = useState<string>("ALL");

  // Filtered Projects for Selection Gateway
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(projectSearch.toLowerCase()));
      const matchesEnv =
        projectEnvFilter === "ALL" || (p.env && p.env.toUpperCase() === projectEnvFilter.toUpperCase());
      return matchesSearch && matchesEnv;
    });
  }, [projects, projectSearch, projectEnvFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
              <FolderKanban className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                Menu Pengujian Beban &amp; Stress Test
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pilih projek untuk menguji keandalan server dan microservices menggunakan{" "}
                <span className="font-semibold text-orange-600 dark:text-orange-400">Grafana k6 Engine</span>.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-600 dark:text-slate-300 cursor-pointer"
            title="Muat ulang data projek"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-[#111622] p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama projek atau deskripsi..."
            value={projectSearch}
            onChange={(e) => setProjectSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          {["ALL", "PRODUCTION", "STAGING", "DEVELOPMENT"].map((env) => (
            <button
              key={env}
              onClick={() => setProjectEnvFilter(env)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition whitespace-nowrap cursor-pointer ${
                projectEnvFilter === env
                  ? "bg-orange-50 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30 font-semibold"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60"
              }`}
            >
              {env === "ALL" ? "Semua Environment" : env}
            </button>
          ))}
        </div>
      </div>

      {/* Project Cards Grid (2 Kolom - Persis seperti di Menu Projek) */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[1, 2].map((i) => (
            <div key={i} className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] p-6 animate-pulse space-y-4" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#111622] rounded-xl border border-slate-200 dark:border-slate-800/80 p-6">
          <FolderKanban className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Tidak ada projek ditemukan</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Coba sesuaikan kata kunci pencarian atau filter environment Anda.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredProjects.map((project) => {
            const upPct = project.servicesCount > 0 ? Math.round((project.upServicesCount / project.servicesCount) * 100) : 100;
            const isHealthy = project.status === "HEALTHY";
            const isDegraded = project.status === "DEGRADED";

            return (
              <div
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className="bg-white dark:bg-[#111622] rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm hover:border-orange-500/40 hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group cursor-pointer"
              >
                <div>
                  {/* Card Header */}
                  <div className="p-5 border-b border-slate-100 dark:border-slate-800/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/10 dark:bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0 mt-0.5 group-hover:scale-105 transition">
                          <Layers className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-base font-bold text-slate-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition flex items-center gap-2">
                            <span>{project.name}</span>
                            <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                            {project.description || "Tidak ada deskripsi projek."}
                          </p>
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isHealthy
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              : isDegraded
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isHealthy ? "bg-emerald-500 animate-pulse" : isDegraded ? "bg-amber-500" : "bg-rose-500"
                            }`}
                          />
                          {project.status || "HEALTHY"}
                        </span>

                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {project.env || "PRODUCTION"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Body: Hierarchy Preview */}
                  <div className="p-5 space-y-4">
                    {/* Servers inside this project */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        <span className="flex items-center gap-1.5">
                          <Server className="w-3.5 h-3.5 text-indigo-500" />
                          <span>
                            Servers dalam Projek (
                            {project.serversCount ||
                              project.serverIds?.length ||
                              serversList.filter((s) => project.serverIds?.includes(s.id)).length}
                            )
                          </span>
                        </span>
                        <span className="text-[11px] text-slate-400">Node Cloud GCP</span>
                      </div>

                      {(project.servers && project.servers.length > 0
                        ? project.servers
                        : serversList.filter((s) => project.serverIds?.includes(s.id))
                      ).length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(project.servers && project.servers.length > 0
                            ? project.servers
                            : serversList.filter((s) => project.serverIds?.includes(s.id))
                          ).map((srv) => (
                            <div
                              key={srv.id}
                              className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between text-xs"
                            >
                              <div className="overflow-hidden pr-2">
                                <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                  {srv.name}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {srv.host || (srv as any).ip || "34.101.x.x"}
                                </div>
                              </div>
                              <span className="shrink-0 px-2 py-0.5 text-[10px] font-medium rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {srv.upServices ?? (srv as any).servicesData?.length ?? 1} Svc
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 italic p-2.5 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center">
                          Server otomatis terdeteksi via jaringan monitoring
                        </div>
                      )}
                    </div>

                    {/* Services UP / DOWN bar */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <Network className="w-3.5 h-3.5 text-amber-500" />
                          <span>Ketersediaan Service:</span>
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {project.upServicesCount || 0} / {project.servicesCount || 0} UP ({upPct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                        <div
                          className="bg-emerald-500 h-full transition-all duration-500"
                          style={{ width: `${upPct}%` }}
                        />
                        <div
                          className="bg-rose-500 h-full transition-all duration-500"
                          style={{ width: `${100 - upPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Hardware Aggregate Stats */}
                    {project.aggregateMetrics && (
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 text-center text-xs">
                        <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/30">
                          <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                            <Cpu className="w-3 h-3" /> CPU Avg
                          </div>
                          <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                            {project.aggregateMetrics.avgCpuPercent}%
                          </div>
                        </div>
                        <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/30">
                          <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                            <Activity className="w-3 h-3" /> RAM Used
                          </div>
                          <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                            {project.aggregateMetrics.memoryUsedPercent}%
                          </div>
                        </div>
                        <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/30">
                          <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                            <HardDrive className="w-3 h-3" /> Disk Used
                          </div>
                          <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                            {project.aggregateMetrics.diskUsedPercent}%
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions - Direct to Stress Test Studio */}
                <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400 font-mono">
                    ID: {project.id.slice(0, 18)}...
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectProject(project.id);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-sm transition transform hover:-translate-y-0.5 cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Pilih &amp; Masuk Stress Test</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
