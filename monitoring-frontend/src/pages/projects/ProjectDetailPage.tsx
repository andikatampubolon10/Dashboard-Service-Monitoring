import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  FolderKanban,
  Server,
  Network,
  Activity,
  ArrowLeft,
  Edit3,
  Trash2,
  Plus,
  RefreshCw,
  ExternalLink,
  Cpu,
  HardDrive,
  Database,
  Layers,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Check,
  X,
} from 'lucide-react';
import { Project, ProjectPayload, Server as ServerType } from '../../types';
import { ProjectService } from '../../services/projectService';
import { monitoringApi } from '../../services/monitoringApi';

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [allServers, setAllServers] = useState<ServerType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit form
  const [formData, setFormData] = useState<ProjectPayload>({
    name: '',
    description: '',
    env: 'PRODUCTION',
    serverIds: [],
  });

  // Collapsed servers in hierarchy
  const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>({});

  const fetchProjectDetail = async () => {
    if (!id) return;
    try {
      const [projData, serverList] = await Promise.all([
        ProjectService.getProjectById(id),
        monitoringApi.getServers({ environment: 'all', serverId: 'all', serviceId: 'all', timeRange: '1h', refreshInterval: 0 }),
      ]);

      if (!projData) {
        navigate('/projects');
        return;
      }

      setProject(projData);
      setAllServers(serverList);

      // Auto-expand all servers initially
      const expandMap: Record<string, boolean> = {};
      (projData.servers || []).forEach((s: ServerType) => {
        expandMap[s.id] = true;
      });
      setExpandedServers(expandMap);

      setFormData({
        name: projData.name,
        description: projData.description || '',
        env: projData.env || 'PRODUCTION',
        serverIds: projData.serverIds || [],
      });
    } catch (err) {
      console.error('Failed to fetch project detail:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProjectDetail();
    const interval = setInterval(() => {
      fetchProjectDetail();
    }, 10000);
    return () => clearInterval(interval);
  }, [id]);

  const toggleServerExpand = (serverId: string) => {
    setExpandedServers((prev) => ({
      ...prev,
      [serverId]: !prev[serverId],
    }));
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !formData.name.trim()) return;

    setIsSubmitting(true);
    try {
      const updated = await ProjectService.updateProject(project.id, formData);
      setProject(updated);
      setIsEditModalOpen(false);
      await fetchProjectDetail();
    } catch (err: any) {
      alert(`Gagal memperbarui projek: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleServerInProject = async (serverId: string) => {
    if (!project) return;
    const isCurrentlyIn = (project.serverIds || []).includes(serverId);
    setIsSubmitting(true);
    try {
      if (isCurrentlyIn) {
        await ProjectService.removeServerFromProject(project.id, serverId);
      } else {
        await ProjectService.addServerToProject(project.id, serverId);
      }
      await fetchProjectDetail();
    } catch (err: any) {
      alert(`Gagal mengubah alokasi server: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    setIsSubmitting(true);
    try {
      await ProjectService.deleteProject(project.id);
      navigate('/projects');
    } catch (err: any) {
      alert(`Gagal menghapus projek: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  if (isLoading || !project) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
        <p className="text-xs text-slate-500">Memuat detail projek & hierarki...</p>
      </div>
    );
  }

  const isHealthy = project.status === 'HEALTHY';
  const isDegraded = project.status === 'DEGRADED';
  const upPercent = project.servicesCount > 0 ? Math.round((project.upServicesCount / project.servicesCount) * 100) : 100;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Link
            to="/projects"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] hover:bg-slate-50 dark:hover:bg-slate-800 transition text-slate-600 dark:text-slate-300 shadow-sm"
            title="Kembali ke Daftar Projek"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {project.name}
              </h1>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  isHealthy
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : isDegraded
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isHealthy ? 'bg-emerald-500 animate-pulse' : isDegraded ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                />
                {project.status}
              </span>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {project.env || 'PRODUCTION'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {project.description || 'Hierarki Ekosistem: Projek &rarr; Server &rarr; Service'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsRefreshing(true);
              fetchProjectDetail();
            }}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-600 dark:text-slate-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-indigo-200 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 transition"
          >
            <Server className="w-3.5 h-3.5" />
            <span>Kelola Server (+/-)</span>
          </button>

          <button
            onClick={() => setIsEditModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-700 dark:text-slate-200"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>

          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-rose-200 dark:border-rose-500/30 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Aggregate Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800/80 shadow-sm">
          <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-indigo-500" />
            <span>Total Server</span>
          </div>
          <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
            {project.serversCount || 0} Host
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Dikelola dalam projek ini</div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800/80 shadow-sm">
          <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
            <Network className="w-3.5 h-3.5 text-amber-500" />
            <span>Service Status</span>
          </div>
          <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
            {project.upServicesCount} / {project.servicesCount} UP
          </div>
          <div className="text-[10px] text-emerald-500 font-semibold mt-0.5">
            {upPercent}% Availability
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800/80 shadow-sm">
          <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-blue-500" />
            <span>Rata-Rata CPU</span>
          </div>
          <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
            {project.aggregateMetrics?.avgCpuPercent || 0}%
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Beban semua host</div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800/80 shadow-sm">
          <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-purple-500" />
            <span>Alokasi RAM</span>
          </div>
          <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
            {project.aggregateMetrics?.memoryUsedPercent || 0}%
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {project.aggregateMetrics ? Math.round(project.aggregateMetrics.usedMemoryMb / 1024) : 0} GB /{' '}
            {project.aggregateMetrics ? Math.round(project.aggregateMetrics.totalMemoryMb / 1024) : 0} GB
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800/80 shadow-sm col-span-2 lg:col-span-1">
          <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-rose-500" />
            <span>Alokasi Disk</span>
          </div>
          <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
            {project.aggregateMetrics?.diskUsedPercent || 0}%
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {project.aggregateMetrics?.usedDiskGb || 0} GB / {project.aggregateMetrics?.totalDiskGb || 0} GB
          </div>
        </div>
      </div>

      {/* Main Hierarchy Section: Project -> Server -> Service */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Layers className="w-4 h-4 text-orange-500" />
              <span>Hierarki Ekosistem: Projek &rarr; Server &rarr; Service</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Klik pada server untuk menciutkan / membuka daftar microservice dan database yang aktif di host tersebut.
            </p>
          </div>

          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Server ke Projek</span>
          </button>
        </div>

        {/* Tree Container */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800/80 shadow-sm space-y-6">
          {/* Level 1: Root Project Node */}
          <div className="p-4 rounded-xl border border-orange-500/40 bg-orange-50/40 dark:bg-orange-500/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-600 text-white flex items-center justify-center font-bold shadow-md shadow-orange-600/30">
                <FolderKanban className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-orange-500 text-white">
                    LEVEL 1: PROJEK
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{project.name}</span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Menaungi {project.serversCount || 0} Host Server fisik &middot; {project.servicesCount || 0} Microservices Aktif
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {project.upServicesCount} UP / {project.servicesCount} Total Service
              </span>
            </div>
          </div>

          {/* Level 2 & 3: Servers and their Hosted Services */}
          {!project.servers || project.servers.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <Server className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Belum ada server yang dialokasikan ke projek ini
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Tambahkan server host (misal Server 1 atau Server 2) agar microservice di dalamnya otomatis terkelola.
              </p>
              <button
                onClick={() => setIsAssignModalOpen(true)}
                className="mt-3 inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition"
              >
                <Plus className="w-4 h-4" />
                <span>Pilih Server Sekarang</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4 pl-4 sm:pl-6 border-l-2 border-orange-500/30 dark:border-orange-500/20 ml-5">
              {project.servers.map((server: ServerType, serverIdx: number) => {
                const isExpanded = expandedServers[server.id] ?? true;
                const serverServices = (server.services || server.servicesData || []) as any[];
                const serverDbs = (server.databases || []) as any[];
                const upSrvCount = server.upServices ?? serverServices.filter((x: any) => x.status === 'UP').length;

                return (
                  <div
                    key={server.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-slate-50/60 dark:bg-slate-900/40 overflow-hidden transition-all shadow-sm"
                  >
                    {/* Level 2: Server Header Bar */}
                    <div className="p-4 bg-white dark:bg-[#131926] border-b border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleServerExpand(server.id)}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>

                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold shrink-0">
                          <Server className="w-4 h-4" />
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                              LEVEL 2: SERVER {serverIdx + 1}
                            </span>
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              {server.name}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">
                              ({server.host || server.ip})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {server.os || 'Linux'} &middot; Uptime: {server.system?.uptime?.formatted || 'Online'}
                          </div>
                        </div>
                      </div>

                      {/* Server Hardware & Actions */}
                      <div className="flex items-center gap-3 pl-8 sm:pl-0">
                        {server.system && (
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1">
                              <Cpu className="w-3 h-3 text-blue-500" />
                              <span>{server.system.cpu?.usagePercent}%</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Activity className="w-3 h-3 text-purple-500" />
                              <span>{server.system.memory?.usedPercent}%</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3 text-rose-500" />
                              <span>{server.system.disk?.usedPercent}%</span>
                            </span>
                          </div>
                        )}

                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          {upSrvCount} / {serverServices.length} Svc UP
                        </span>

                        <Link
                          to={`/servers/${server.id}`}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                          title="Buka detail server"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>

                    {/* Level 3: Hosted Services and Databases inside this Server */}
                    {isExpanded && (
                      <div className="p-4 space-y-4">
                        {/* Databases in Server */}
                        {serverDbs.length > 0 && (
                          <div>
                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <Database className="w-3.5 h-3.5 text-blue-500" />
                              <span>Database Instances ({serverDbs.length})</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {serverDbs.map((db) => (
                                <div
                                  key={db.id}
                                  className="p-2.5 rounded-lg bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                                >
                                  <div>
                                    <div className="font-semibold text-slate-800 dark:text-slate-200">{db.name}</div>
                                    <div className="text-[10px] text-slate-400 font-mono">Port {db.port}</div>
                                  </div>
                                  <span
                                    className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                                      db.status === 'UP'
                                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                        : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                    }`}
                                  >
                                    {db.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Services in Server */}
                        <div>
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Network className="w-3.5 h-3.5 text-amber-500" />
                            <span>Microservices ({serverServices.length})</span>
                          </div>

                          {serverServices.length === 0 ? (
                            <div className="text-xs text-slate-400 italic p-3 text-center border rounded-lg">
                              Tidak ada microservice yang terdeteksi di server ini.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                              {serverServices.map((svc: any) => {
                                const isSvcUp = svc.status === 'UP';
                                return (
                                  <Link
                                    key={svc.id}
                                    to={`/services/${svc.id}`}
                                    className="p-3 rounded-lg bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 hover:border-orange-500/40 transition flex flex-col justify-between group/svc shadow-xs"
                                  >
                                    <div>
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                          <span
                                            className={`w-2 h-2 rounded-full shrink-0 ${
                                              isSvcUp ? 'bg-emerald-500' : 'bg-rose-500'
                                            }`}
                                          />
                                          <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate group-hover/svc:text-orange-500">
                                            {svc.name}
                                          </span>
                                        </div>

                                        <span
                                          className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${
                                            isSvcUp
                                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                          }`}
                                        >
                                          {svc.status}
                                        </span>
                                      </div>

                                      <div className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                                        {svc.description || 'Microservice container'}
                                      </div>
                                    </div>

                                    <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                                      <span className="uppercase font-mono font-semibold px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                        {svc.stack || 'app'}
                                      </span>
                                      <span>{svc.reqPerSecond != null ? `${svc.reqPerSecond} req/s` : '0 req/s'}</span>
                                      <span>{svc.p99LatencyMs != null ? `p99 ${Math.round(svc.p99LatencyMs)}ms` : '0ms'}</span>
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Edit Projek */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111622] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Edit Informasi Projek</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateProject} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Projek
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Deskripsi Projek
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Environment
                </label>
                <select
                  value={formData.env}
                  onChange={(e) => setFormData({ ...formData, env: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="PRODUCTION">PRODUCTION</option>
                  <option value="STAGING">STAGING</option>
                  <option value="DEVELOPMENT">DEVELOPMENT</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-sm transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Kelola Alokasi Server (+/-) */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111622] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-lg w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Kelola Alokasi Server Projek</h3>
                <p className="text-xs text-slate-500">Centang atau hilangkan centang untuk menambah / mengeluarkan server</p>
              </div>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {allServers.map((srv) => {
                const isInProject = (project.serverIds || []).includes(srv.id);
                return (
                  <div
                    key={srv.id}
                    onClick={() => handleToggleServerInProject(srv.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition flex items-center justify-between text-xs ${
                      isInProject
                        ? 'bg-orange-50 dark:bg-orange-500/15 border-orange-500/40 text-orange-900 dark:text-orange-200 font-medium'
                        : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center ${
                          isInProject
                            ? 'bg-orange-600 border-orange-600 text-white'
                            : 'border-slate-400 bg-white dark:bg-slate-800'
                        }`}
                      >
                        {isInProject && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div>
                        <div className="font-semibold">{srv.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{srv.ip || srv.host}</div>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 text-[10px] rounded font-semibold ${
                        isInProject ? 'bg-orange-200 dark:bg-orange-950 text-orange-800 dark:text-orange-300' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {isInProject ? 'Terdaftar di Projek' : 'Belum Terdaftar'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-sm transition"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Hapus Projek */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111622] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Hapus Projek</h3>
                <p className="text-xs text-slate-500">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Apakah Anda yakin ingin menghapus projek <span className="font-semibold text-slate-900 dark:text-white">"{project.name}"</span>?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              >
                Batal
              </button>
              <button
                onClick={handleDeleteProject}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition disabled:opacity-50"
              >
                {isSubmitting ? 'Menghapus...' : 'Ya, Hapus Projek'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
