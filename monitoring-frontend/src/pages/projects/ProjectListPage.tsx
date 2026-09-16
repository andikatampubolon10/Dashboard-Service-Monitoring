import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderKanban,
  Plus,
  Search,
  Server,
  Network,
  Activity,
  Trash2,
  Edit3,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  HardDrive,
  Cpu,
  Layers,
  X,
} from 'lucide-react';
import { Project, ProjectPayload, Server as ServerType } from '../../types';
import { ProjectService } from '../../services/projectService';
import { monitoringApi } from '../../services/monitoringApi';

export const ProjectListPage: React.FC = () => {

  const [projects, setProjects] = useState<Project[]>([]);
  const [allServers, setAllServers] = useState<ServerType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEnv, setSelectedEnv] = useState<'all' | 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT'>('all');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [formData, setFormData] = useState<ProjectPayload>({
    name: '',
    description: '',
    env: 'PRODUCTION',
    serverIds: [],
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [projList, serverList] = await Promise.all([
        ProjectService.getProjects(),
        monitoringApi.getServers({ environment: 'all', serverId: 'all', serviceId: 'all', timeRange: '1h', refreshInterval: 0 }),
      ]);
      setProjects(projList);
      setAllServers(serverList);
    } catch (err) {
      console.error('Failed to load projects/servers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 10000);
    return () => clearInterval(timer);
  }, []);

  const openCreateModal = () => {
    setEditingProject(null);
    setFormData({
      name: '',
      description: '',
      env: 'PRODUCTION',
      serverIds: [],
    });
    setIsModalOpen(true);
  };

  const openEditModal = (proj: Project) => {
    setEditingProject(proj);
    setFormData({
      name: proj.name,
      description: proj.description || '',
      env: proj.env || 'PRODUCTION',
      serverIds: [...(proj.serverIds || [])],
    });
    setIsModalOpen(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingProject) {
        await ProjectService.updateProject(editingProject.id, formData);
      } else {
        await ProjectService.createProject(formData);
      }
      setIsModalOpen(false);
      await fetchData();
    } catch (err: any) {
      alert(`Gagal menyimpan projek: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    try {
      await ProjectService.deleteProject(deleteTarget.id);
      setDeleteTarget(null);
      await fetchData();
    } catch (err: any) {
      alert(`Gagal menghapus projek: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchEnv = selectedEnv === 'all' || p.env?.toUpperCase() === selectedEnv;
      return matchSearch && matchEnv;
    });
  }, [projects, searchTerm, selectedEnv]);

  // KPIs
  const totalServersManaged = useMemo(() => {
    const ids = new Set<string>();
    projects.forEach((p) => (p.serverIds || []).forEach((id) => ids.add(id)));
    return ids.size;
  }, [projects]);

  const totalServices = useMemo(() => {
    return projects.reduce((acc, p) => acc + (p.servicesCount || 0), 0);
  }, [projects]);

  const totalUpServices = useMemo(() => {
    return projects.reduce((acc, p) => acc + (p.upServicesCount || 0), 0);
  }, [projects]);

  const overallHealthRate = totalServices > 0 ? Math.round((totalUpServices / totalServices) * 100) : 100;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
              <FolderKanban className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                Menu Projek & Ekosistem
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Kelola projek, kelompokkan server, dan pantau hierarki <span className="font-semibold text-orange-600 dark:text-orange-400">Projek &rarr; Server &rarr; Service</span>.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-600 dark:text-slate-300"
            title="Muat ulang data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-sm shadow-orange-600/30 transition transform hover:-translate-y-0.5"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Projek Baru</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#111622] rounded-xl border border-slate-200 dark:border-slate-800/80 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Projek</span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <FolderKanban className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{projects.length}</span>
            <span className="text-[11px] text-slate-500">Ekosistem Aktif</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111622] rounded-xl border border-slate-200 dark:border-slate-800/80 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Server Terkelola</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{totalServersManaged}</span>
            <span className="text-[11px] text-slate-500">dari {allServers.length} Host</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111622] rounded-xl border border-slate-200 dark:border-slate-800/80 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Service Terkelola</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Network className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{totalServices}</span>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">({totalUpServices} UP)</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111622] rounded-xl border border-slate-200 dark:border-slate-800/80 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tingkat Kesehatan</span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${overallHealthRate >= 90 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{overallHealthRate}%</span>
            <span className="text-[11px] text-slate-500">Reliability Rate</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-[#111622] p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama projek atau deskripsi..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          {(['all', 'PRODUCTION', 'STAGING', 'DEVELOPMENT'] as const).map((env) => (
            <button
              key={env}
              onClick={() => setSelectedEnv(env)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition whitespace-nowrap ${
                selectedEnv === env
                  ? 'bg-orange-50 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30 font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              {env === 'all' ? 'Semua Environment' : env}
            </button>
          ))}
        </div>
      </div>

      {/* Project Cards Grid */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#111622] rounded-xl border border-slate-200 dark:border-slate-800/80 p-6">
          <FolderKanban className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Tidak ada projek ditemukan</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {searchTerm || selectedEnv !== 'all'
              ? 'Coba sesuaikan kata kunci pencarian atau filter environment Anda.'
              : 'Belum ada projek yang dibuat. Buat projek pertama Anda untuk mulai mengelompokkan server.'}
          </p>
          <button
            onClick={openCreateModal}
            className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Projek</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredProjects.map((project) => {
            const upPct = project.servicesCount > 0 ? Math.round((project.upServicesCount / project.servicesCount) * 100) : 100;
            const isHealthy = project.status === 'HEALTHY';
            const isDegraded = project.status === 'DEGRADED';

            return (
              <div
                key={project.id}
                className="bg-white dark:bg-[#111622] rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm hover:border-orange-500/40 transition-all flex flex-col justify-between overflow-hidden group"
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
                          <Link
                            to={`/projects/${project.id}`}
                            className="text-base font-bold text-slate-900 dark:text-white hover:text-orange-600 dark:hover:text-orange-400 transition flex items-center gap-2"
                          >
                            <span>{project.name}</span>
                            <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                            {project.description || 'Tidak ada deskripsi projek.'}
                          </p>
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
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
                    </div>
                  </div>

                  {/* Card Body: Hierarchy Preview */}
                  <div className="p-5 space-y-4">
                    {/* Servers inside this project */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        <span className="flex items-center gap-1.5">
                          <Server className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Servers dalam Projek ({project.serversCount || 0})</span>
                        </span>
                        <span className="text-[11px] text-slate-400">Klik server untuk detail</span>
                      </div>

                      {project.servers && project.servers.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {project.servers.map((srv) => (
                            <Link
                              key={srv.id}
                              to={`/servers/${srv.id}`}
                              className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 hover:border-orange-500/40 transition flex items-center justify-between text-xs group/srv"
                            >
                              <div className="overflow-hidden pr-2">
                                <div className="font-semibold text-slate-800 dark:text-slate-200 truncate group-hover/srv:text-orange-500">
                                  {srv.name}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {srv.host || srv.ip}
                                </div>
                              </div>
                              <span className="shrink-0 px-2 py-0.5 text-[10px] font-medium rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {srv.upServices ?? srv.servicesData?.length ?? 0} Svc
                              </span>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 italic p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center">
                          Belum ada server yang dialokasikan ke projek ini.
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
                          {project.upServicesCount} / {project.servicesCount} UP ({upPct}%)
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

                {/* Card Footer Actions */}
                <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400 font-mono">
                    ID: {project.id.slice(0, 20)}...
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditModal(project)}
                      className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                      title="Edit Projek"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => setDeleteTarget(project)}
                      className="p-1.5 text-rose-500 hover:text-rose-700 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                      title="Hapus Projek"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <Link
                      to={`/projects/${project.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold shadow-sm transition"
                    >
                      <Server className="w-3.5 h-3.5" />
                      <span>Lihat Server Projek</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Tambah / Edit Projek */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111622] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-600 flex items-center justify-center">
                  <FolderKanban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {editingProject ? 'Edit Projek' : 'Tambah Projek Baru'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {editingProject ? 'Perbarui informasi dan daftar server yang tergabung' : 'Buat projek baru untuk mengelompokkan server dan service'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProject} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Projek <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: InaAI Healthcare Ecosystem"
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
                  rows={2}
                  placeholder="Deskripsi singkat mengenai layanan atau ekosistem yang dinaungi projek ini..."
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
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-sm transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : editingProject ? 'Simpan Perubahan' : 'Buat Projek'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Hapus Projek */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111622] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Konfirmasi Hapus Projek</h3>
                <p className="text-xs text-slate-500">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Apakah Anda yakin ingin menghapus projek <span className="font-semibold text-slate-900 dark:text-white">"{deleteTarget.name}"</span>?
            </p>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Catatan Keamanan:</span> Menghapus projek hanya menghapus relasi pengelompokan. Server fisik dan service container yang ada di dalamnya <strong>tidak akan terhapus</strong> dan tetap berjalan normal.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
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
