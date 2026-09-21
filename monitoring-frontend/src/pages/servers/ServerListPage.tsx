import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ErrorState } from '../../components/common/ErrorState';
import { TableSkeleton } from '../../components/common/LoadingSkeleton';
import { Modal } from '../../components/common/Modal';
import {
  Search,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  Plus,
  Server as ServerIcon,
  Loader2,
  Terminal,
  Cpu,
  HardDrive,
  Sparkles,
  Radio,
  Layers,
  Pencil,
  Trash2,
  ArrowLeft,
  FolderKanban,
  Check,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Database,
} from 'lucide-react';
import { useServers, useRegisterServer, useDiscoverServer, useUpdateServer, useDeleteServer } from '../../hooks/useServers';
import { useServices } from '../../hooks/useServices';
import { Server, DiscoveredService, DiscoverServerResponse, Project } from '../../types';
import { ProjectService } from '../../services/projectService';
import { ProjectAiInsightCard } from '../../components/monitoring/ProjectAiInsightCard';

export const ServerListPage: React.FC = () => {
  const { id: projectId } = useParams<{ id?: string }>();
  const { data: servers = [], isLoading, isError, refetch } = useServers();
  const { data: allServices = [] } = useServices();

  const [expandedServerIds, setExpandedServerIds] = useState<Set<string>>(new Set());

  const toggleExpandServer = (serverId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedServerIds((prev) => {
      const next = new Set(prev);
      if (next.has(serverId)) {
        next.delete(serverId);
      } else {
        next.add(serverId);
      }
      return next;
    });
  };

  const expandAllServers = () => {
    setExpandedServerIds(new Set(filteredServers.map((s) => s.id)));
  };

  const collapseAllServers = () => {
    setExpandedServerIds(new Set());
  };

  const getServerServices = (srv: Server) => {
    if (srv.servicesData && srv.servicesData.length > 0) {
      return srv.servicesData.map((svc) => {
        const foundInAll = allServices.find((s) => s.id === svc.id);
        const isUp =
          svc.status === 'UP' ||
          svc.status === 'healthy' ||
          foundInAll?.rawStatus === 'UP' ||
          foundInAll?.status === 'healthy';
        return {
          id: svc.id,
          name: svc.name || foundInAll?.name || svc.id,
          stack: svc.stack || foundInAll?.stack || 'nodejs',
          description: svc.description || foundInAll?.description || '',
          status: (isUp ? 'UP' : 'DOWN') as 'UP' | 'DOWN',
          reqPerSecond: svc.reqPerSecond ?? foundInAll?.throughputRps ?? 0,
          errorRatePercent: svc.errorRatePercent ?? foundInAll?.errorRatePercent ?? 0,
          p99LatencyMs: svc.p99LatencyMs ?? foundInAll?.latencyP99Ms ?? 0,
          version: foundInAll?.version || 'v1.0.0',
        };
      });
    }

    const hostServiceIds = srv.hostedServices || [];
    const matchedFromAll = allServices.filter(
      (s) => hostServiceIds.includes(s.id) || s.serverId === srv.id
    );

    if (matchedFromAll.length > 0) {
      return matchedFromAll.map((s) => {
        const isUp = s.rawStatus === 'UP' || s.status === 'healthy';
        return {
          id: s.id,
          name: s.name,
          stack: s.stack || 'nodejs',
          description: s.description || '',
          status: (isUp ? 'UP' : 'DOWN') as 'UP' | 'DOWN',
          reqPerSecond: s.throughputRps ?? 0,
          errorRatePercent: s.errorRatePercent ?? 0,
          p99LatencyMs: s.latencyP99Ms ?? 0,
          version: s.version || 'v1.0.0',
        };
      });
    }

    return hostServiceIds.map((svcId) => {
      const found = allServices.find((s) => s.id === svcId);
      const isUp = found?.rawStatus === 'UP' || found?.status === 'healthy';
      return {
        id: svcId,
        name: found?.name || svcId,
        stack: found?.stack || 'nodejs',
        description: found?.description || 'Microservice container',
        status: (isUp ? 'UP' : 'DOWN') as 'UP' | 'DOWN',
        reqPerSecond: found?.throughputRps ?? 0,
        errorRatePercent: found?.errorRatePercent ?? 0,
        p99LatencyMs: found?.latencyP99Ms ?? 0,
        version: found?.version || 'v1.0.0',
      };
    });
  };

  const renderStackBadge = (stack: string) => {
    const s = (stack || '').toLowerCase();
    if (s.includes('go')) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
          Go
        </span>
      );
    }
    if (s.includes('node')) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
          Node.js
        </span>
      );
    }
    if (s.includes('python')) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
          Python
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        {stack || 'Service'}
      </span>
    );
  };

  const [project, setProject] = useState<Project | null>(null);
  const [showManageProjectServersModal, setShowManageProjectServersModal] = useState<boolean>(false);
  const [isUpdatingProjectServers, setIsUpdatingProjectServers] = useState<boolean>(false);

  const fetchProject = async () => {
    if (!projectId) return;
    try {
      const p = await ProjectService.getProjectById(projectId);
      setProject(p);
    } catch (err) {
      console.error('Failed to load project in ServerListPage:', err);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchProject();
    } else {
      setProject(null);
    }
  }, [projectId]);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [showAddServerModal, setShowAddServerModal] = useState<boolean>(false);

  // Discovery Mode & Credentials (default to Zero-Config probe)
  const [discoveryMode, setDiscoveryMode] = useState<'ssh' | 'probe'>('probe');
  const [sshConfig, setSshConfig] = useState({
    sshPort: '22',
    username: 'ubuntu',
    password: '',
    privateKey: '',
  });
  const [discoveredData, setDiscoveredData] = useState<DiscoverServerResponse | null>(null);
  const [discoveredServicesSelection, setDiscoveredServicesSelection] = useState<DiscoveredService[]>([]);

  // Form state for adding new server
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: '9100',
    env: 'PRODUCTION',
    region: 'jakarta-idc',
    description: '',
    selectedServiceIds: [] as string[],
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const discoverServerMutation = useDiscoverServer();
  const registerServerMutation = useRegisterServer();
  const updateServerMutation = useUpdateServer();
  const deleteServerMutation = useDeleteServer();

  // Edit Server State
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    host: '',
    port: '22',
    env: 'PRODUCTION',
    region: 'jakarta-idc',
    description: '',
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  // Delete Server State
  const [deletingServer, setDeletingServer] = useState<Server | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);


  const handleOpenEditModal = (server: Server) => {
    setEditingServer(server);
    setEditFormData({
      name: server.name || '',
      host: server.host || server.ip || '',
      port: String(server.port || 22),
      env: server.env || 'PRODUCTION',
      region: server.region || 'jakarta-idc',
      description: server.description || '',
    });
    setEditError(null);
    setEditSuccess(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingServer) return;
    if (!editFormData.name.trim() || !editFormData.host.trim()) {
      setEditError('Nama Server dan Host / IP wajib diisi.');
      return;
    }

    try {
      setEditError(null);
      setEditSuccess(null);
      await updateServerMutation.mutateAsync({
        id: editingServer.id,
        payload: {
          name: editFormData.name.trim(),
          host: editFormData.host.trim(),
          port: parseInt(editFormData.port, 10) || 22,
          env: editFormData.env,
          region: editFormData.region,
          description: editFormData.description.trim(),
        },
      });
      setEditSuccess('Server berhasil diperbarui!');
      setTimeout(() => {
        setEditingServer(null);
        setEditSuccess(null);
      }, 600);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Gagal memperbarui server');
    }
  };

  const handleOpenDeleteModal = (server: Server) => {
    setDeletingServer(server);
    setDeleteError(null);
  };

  const handleDeleteSubmit = async () => {
    if (!deletingServer) return;
    try {
      setDeleteError(null);
      await deleteServerMutation.mutateAsync(deletingServer.id);
      setDeletingServer(null);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Gagal menghapus server');
    }
  };

  const handleRunDiscovery = async () => {
    setFormError(null);
    setFormSuccess(null);

    const cleanHost = formData.host.trim();
    if (!cleanHost) {
      setFormError('Masukkan IP Address atau Host target terlebih dahulu');
      return;
    }

    try {
      const res = await discoverServerMutation.mutateAsync({
        host: cleanHost,
        mode: discoveryMode,
        sshPort: parseInt(sshConfig.sshPort, 10) || 22,
        username: sshConfig.username.trim() || undefined,
        password: sshConfig.password || undefined,
        passphrase: sshConfig.password || undefined,
        privateKey: sshConfig.privateKey.trim() || undefined,
        exporterPort: parseInt(formData.port, 10) || 9100,
      } as any);

      setDiscoveredData(res);
      // Pre-select all discovered listening services so user can customize
      setDiscoveredServicesSelection(res.services || []);

      // Pre-fill default server name if empty
      if (!formData.name.trim()) {
        const shortHost = cleanHost.replace(/[^a-zA-Z0-9]/g, '-');
        setFormData((prev) => ({
          ...prev,
          name: discoveryMode === 'ssh' ? `Node-${shortHost}` : `Server-${shortHost}`,
          description: `Discovered via ${discoveryMode === 'ssh' ? 'SSH' : 'Zero-Config'} (${res.os || 'Linux Node'}) with ${res.services?.length || 0} active listening ports`,
          port: discoveryMode === 'ssh' ? sshConfig.sshPort : (formData.port || '9100'),
        }));
      }

      setFormSuccess(
        `Deteksi berhasil! Ditemukan ${res.services?.length || 0} port/service aktif di ${cleanHost} (${res.os || 'Linux Node'}). Silakan pilih service yang ingin dipantau.`
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Gagal melakukan deteksi ke target host';
      setFormError(errorMsg);
      setDiscoveredData(null);
    }
  };

  const selectAllDiscoveredServices = () => {
    if (!discoveredData) return;
    setDiscoveredServicesSelection([...discoveredData.services]);
  };

  const deselectAllDiscoveredServices = () => {
    setDiscoveredServicesSelection([]);
  };

  const toggleDiscoveredService = (serviceId: string) => {
    if (!discoveredData) return;
    const found = discoveredData.services.find((s) => s.id === serviceId);
    if (!found) return;

    setDiscoveredServicesSelection((prev) => {
      const exists = prev.some((s) => s.id === serviceId);
      if (exists) {
        return prev.filter((s) => s.id !== serviceId);
      } else {
        return [...prev, found];
      }
    });
  };

  const handleUpdateDiscoveredServiceName = (serviceId: string, newName: string) => {
    setDiscoveredServicesSelection((prev) =>
      prev.map((s) => (s.id === serviceId ? { ...s, name: newName } : s))
    );
    if (discoveredData) {
      setDiscoveredData({
        ...discoveredData,
        services: discoveredData.services.map((s) =>
          s.id === serviceId ? { ...s, name: newName } : s
        ),
      });
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!formData.name.trim()) {
      setFormError('Nama server wajib diisi');
      return;
    }
    if (!formData.host.trim()) {
      setFormError('Host atau IP Address wajib diisi');
      return;
    }
    const portNum = parseInt(formData.port, 10) || 22;

    try {
      const res = await registerServerMutation.mutateAsync({
        name: formData.name.trim(),
        host: formData.host.trim(),
        port: portNum,
        env: formData.env,
        region: formData.region.trim(),
        description: formData.description.trim(),
        serviceIds: formData.selectedServiceIds,
        services: discoveredServicesSelection,
        databases: discoveredData?.databases || [],
        spec: discoveredData?.spec,
        ssh: discoveryMode === 'ssh' ? {
          port: parseInt(sshConfig.sshPort, 10) || 22,
          username: sshConfig.username.trim(),
          password: sshConfig.password || undefined,
          passphrase: sshConfig.password || undefined,
          privateKey: sshConfig.privateKey.trim() || undefined,
        } : undefined,
        projectId: projectId || undefined,
      } as any);

      setFormSuccess(
        projectId
          ? `Server "${res.name}" berhasil didaftarkan dan dialokasikan ke projek!`
          : `Server "${res.name}" berhasil didaftarkan! Status: ${res.status}`
      );

      if (projectId && res?.id) {
        try {
          const updatedProject = await ProjectService.addServerToProject(projectId, res.id);
          if (updatedProject) {
            setProject(updatedProject);
          }
        } catch (projErr) {
          console.error('Failed to link server to project:', projErr);
        }
      }

      await refetch();
      setTimeout(() => {
        setShowAddServerModal(false);
        setFormSuccess(null);
        setDiscoveredData(null);
        setDiscoveredServicesSelection([]);
        setFormData({
          name: '',
          host: '',
          port: '22',
          env: 'PRODUCTION',
          region: 'jakarta-idc',
          description: '',
          selectedServiceIds: [],
        });
      }, 1200);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Gagal mendaftarkan server target';
      setFormError(errorMsg);
    }
  };

  const handleToggleServerInProject = async (serverId: string) => {
    if (!project) return;
    setIsUpdatingProjectServers(true);
    try {
      const isCurrentlyIn = (project.serverIds || []).includes(serverId);
      let updated: Project;
      if (isCurrentlyIn) {
        updated = await ProjectService.removeServerFromProject(project.id, serverId);
      } else {
        updated = await ProjectService.addServerToProject(project.id, serverId);
      }
      setProject(updated);
    } catch (err: any) {
      alert('Gagal mengalokasikan server ke projek: ' + err.message);
    } finally {
      setIsUpdatingProjectServers(false);
    }
  };

  const filteredServers = useMemo(() => {
    let list = [...servers];

    if (projectId && project) {
      const allowedIds = project.serverIds || [];
      list = list.filter((s) => allowedIds.includes(s.id));
    }

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
  }, [servers, searchQuery, sortKey, sortAsc, projectId, project]);

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
      return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-50 ml-1 inline-block shrink-0" />;
    }
    return sortAsc ? (
      <span className="text-cyan-400 font-bold ml-1">&uarr;</span>
    ) : (
      <span className="text-cyan-400 font-bold ml-1">&darr;</span>
    );
  };

  if (isError) {
    return <ErrorState onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      {/* Top Title & Allocation Rules Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {projectId ? (
          <div className="flex items-center gap-3">
            <Link
              to="/projects"
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white transition shadow-sm"
              title="Kembali ke Daftar Projek"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Servers &mdash; {project ? project.name : 'Projek'}
                </h1>
                {project && (
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {project.env || 'PRODUCTION'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Infrastructure hosts dan utilisasi resource untuk projek <span className="font-semibold text-slate-700 dark:text-slate-300">{project ? project.name : ''}</span>
              </p>
            </div>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Servers
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Infrastructure hosts and resource utilization
            </p>
          </div>
        )}

        <div className="flex items-center gap-2.5 flex-wrap">
          {projectId && (
            <>
              <button
                onClick={() => setShowManageProjectServersModal(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-xs font-bold font-mono hover:bg-indigo-100 dark:hover:bg-indigo-500/25 transition shadow-sm"
              >
                <ServerIcon className="w-4 h-4" />
                <span>Kelola Server Projek (+/-)</span>
              </button>

              {/* Add Server Button - Only available in Project view */}
              <button
                onClick={() => {
                  setFormError(null);
                  setFormSuccess(null);
                  setShowAddServerModal(true);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold font-mono transition shadow-sm shadow-cyan-500/20"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Server Target</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* AI Telemetry & Infrastructure Insight (Project Detail View) */}
      {projectId && project && (
        <ProjectAiInsightCard project={project} />
      )}

      {/* Search Bar with Rows Count & Expand/Collapse Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative max-w-sm w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search servers..."
            className="w-full bg-white dark:bg-[#111827]/80 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500 shadow-sm transition font-mono"
          />
        </div>
        <div className="flex items-center gap-3">
          {filteredServers.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={expandAllServers}
                className="px-2.5 py-1 text-[11px] font-mono rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 hover:border-cyan-500/40 dark:hover:border-cyan-500/40 hover:bg-cyan-500/5 transition"
                title="Buka semua detail services server"
              >
                Expand Semua
              </button>
              <button
                type="button"
                onClick={collapseAllServers}
                className="px-2.5 py-1 text-[11px] font-mono rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition"
                title="Tutup semua detail services server"
              >
                Collapse Semua
              </button>
            </div>
          )}
          <span className="text-xs text-slate-400 font-mono select-none">
            {filteredServers.length} rows
          </span>
        </div>
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
                  <th className="py-3.5 px-4 text-center">
                    <span>AKSI</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs font-mono">
                {filteredServers.map((server) => {
                  const memPercent = Math.round(
                    (server.memoryUsedBytes / (server.memoryTotalBytes || 1)) * 100
                  );
                  const isCritical = server.status === 'critical';
                  const isDegraded = server.status === 'degraded' || server.status === 'warning';
                  const maxCap = server.maxCapacity || 4;
                  const currentCount = server.hostedServices.length;
                  const isExpanded = expandedServerIds.has(server.id);
                  const serverServices = getServerServices(server);

                  return (
                    <React.Fragment key={server.id}>
                      <tr
                        onClick={() => toggleExpandServer(server.id)}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition cursor-pointer group ${
                          isExpanded ? 'bg-cyan-50/30 dark:bg-cyan-950/10' : ''
                        }`}
                      >
                        {/* Server Name with Expand/Collapse Chevron Button */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={(e) => toggleExpandServer(server.id, e)}
                              className={`w-5 h-5 rounded flex items-center justify-center border transition shrink-0 ${
                                isExpanded
                                  ? 'border-cyan-500 bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
                                  : 'border-slate-300 dark:border-slate-700 text-slate-400 hover:border-cyan-500 hover:text-cyan-500'
                              }`}
                              title={isExpanded ? 'Tutup daftar services' : 'Lihat services di server ini'}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <div>
                              <Link
                                to={`/servers/${server.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-bold text-slate-900 dark:text-white hover:text-cyan-600 dark:hover:text-cyan-400 transition block"
                                title="Buka telemetry detail server"
                              >
                                {server.name}
                              </Link>
                              <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 flex-wrap">
                                <span>{server.host || server.ip}{server.port ? `:${server.port}` : ''}</span>
                                <span>&bull;</span>
                                <span>{server.region || 'jakarta-idc'}</span>
                                {server.probeResult && (
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                      server.probeResult.open
                                        ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-500/20'
                                        : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-500/20'
                                    }`}
                                    title={server.probeResult.message}
                                  >
                                    {server.probeResult.open ? 'ONLINE' : 'UNREACHABLE'}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="py-4 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                              isCritical
                                ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                : isDegraded
                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isCritical
                                  ? 'bg-rose-500 animate-pulse'
                                  : isDegraded
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                            />
                            <span className="capitalize">{server.status}</span>
                          </span>
                        </td>

                        {/* CPU Bar + Value */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-20 sm:w-28 bg-slate-100 dark:bg-slate-800/80 h-1.5 rounded-full overflow-hidden shrink-0">
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
                            <span className="text-slate-800 dark:text-slate-200 font-bold w-10">
                              {server.cpuUsagePercent}%
                            </span>
                          </div>
                        </td>

                        {/* Memory Bar + Value */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-20 sm:w-28 bg-slate-100 dark:bg-slate-800/80 h-1.5 rounded-full overflow-hidden shrink-0">
                              <div
                                className={`h-full rounded-full ${
                                  memPercent >= 85
                                    ? 'bg-rose-500'
                                    : memPercent >= 70
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500 dark:bg-emerald-400'
                                }`}
                                style={{ width: `${memPercent}%` }}
                              />
                            </div>
                            <span className="text-slate-800 dark:text-slate-200 font-bold w-10">
                              {memPercent}%
                            </span>
                          </div>
                        </td>

                        {/* SERVICES (matching screenshot format 1 / 3, 0 / 4) with quick expand toggle */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2 cursor-pointer group/svc">
                            <span className="text-sm font-bold text-slate-900 dark:text-white group-hover/svc:text-cyan-600 dark:group-hover/svc:text-cyan-400 transition">
                              {currentCount} / {maxCap}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {currentCount === 0 ? 'Empty' : currentCount >= maxCap ? 'Full' : 'Available'}
                            </span>
                            <span className="text-slate-400 group-hover/svc:text-cyan-500 transition ml-0.5">
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-cyan-500" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </span>
                          </div>
                        </td>

                        {/* Uptime */}
                        <td className="py-4 px-5 text-slate-600 dark:text-slate-400">
                          {server.uptime}
                        </td>

                        {/* Actions Column (Edit & Delete) */}
                        <td className="py-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(server)}
                              title="Edit konfigurasi server"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-500 hover:bg-cyan-500/10 dark:hover:bg-cyan-500/20 transition border border-transparent hover:border-cyan-500/30"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenDeleteModal(server)}
                              title="Hapus server dari monitoring"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 transition border border-transparent hover:border-rose-500/30"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Services & Components Row */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80 dark:bg-[#070c18]/90 border-b border-slate-200 dark:border-slate-800/80">
                          <td colSpan={7} className="p-0">
                            <div className="p-4 sm:p-5 border-l-4 border-cyan-500 dark:border-cyan-400 pl-6 space-y-4">
                              {/* Header sub-panel */}
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                                    <Layers className="w-3.5 h-3.5" />
                                  </div>
                                  <div>
                                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                      Services di Host: <span className="text-cyan-600 dark:text-cyan-400">{server.name}</span>
                                    </h4>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                      Microservice dan database runtime yang teralokasi pada host {server.host || server.ip}
                                    </p>
                                  </div>
                                  <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/20">
                                    {serverServices.length} Service{serverServices.length !== 1 ? 's' : ''}
                                  </span>
                                </div>

                                <Link
                                  to={`/servers/${server.id}`}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 transition"
                                >
                                  <span>Lihat Metrik Lengkap Host</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </Link>
                              </div>

                              {/* Services Table */}
                              {serverServices.length > 0 ? (
                                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1322] shadow-xs">
                                  <table className="w-full text-left border-collapse">
                                    <thead>
                                      <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                        <th className="py-2.5 px-4">Nama Service & Stack</th>
                                        <th className="py-2.5 px-3">Status</th>
                                        <th className="py-2.5 px-3">P99 Latency</th>
                                        <th className="py-2.5 px-3">Throughput</th>
                                        <th className="py-2.5 px-3">Error Rate</th>
                                        <th className="py-2.5 px-4 text-right">Aksi</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                                      {serverServices.map((svc) => {
                                        const isUp = svc.status === 'UP';
                                        return (
                                          <tr
                                            key={svc.id}
                                            className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition"
                                          >
                                            <td className="py-3 px-4">
                                              <div className="flex items-center gap-2.5">
                                                <div className="flex flex-col">
                                                  <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-800 dark:text-slate-200">
                                                      {svc.name}
                                                    </span>
                                                    {renderStackBadge(svc.stack)}
                                                    {svc.version && (
                                                      <span className="text-[10px] text-slate-400 font-mono">
                                                        {svc.version}
                                                      </span>
                                                    )}
                                                  </div>
                                                  {svc.description && (
                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-xs sm:max-w-md">
                                                      {svc.description}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            </td>
                                            <td className="py-3 px-3">
                                              <span
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                                  isUp
                                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                                }`}
                                              >
                                                <span
                                                  className={`w-1.5 h-1.5 rounded-full ${
                                                    isUp ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'
                                                  }`}
                                                />
                                                <span>{svc.status}</span>
                                              </span>
                                            </td>
                                            <td className="py-3 px-3 text-slate-600 dark:text-slate-300 font-mono">
                                              {svc.p99LatencyMs ? `${svc.p99LatencyMs} ms` : '—'}
                                            </td>
                                            <td className="py-3 px-3 text-slate-600 dark:text-slate-300 font-mono">
                                              {svc.reqPerSecond !== undefined && svc.reqPerSecond !== null
                                                ? `${svc.reqPerSecond} req/s`
                                                : '—'}
                                            </td>
                                            <td className="py-3 px-3 font-mono">
                                              <span
                                                className={
                                                  svc.errorRatePercent > 1
                                                    ? 'text-rose-500 font-bold'
                                                    : 'text-slate-600 dark:text-slate-300'
                                                }
                                              >
                                                {svc.errorRatePercent !== undefined && svc.errorRatePercent !== null
                                                  ? `${svc.errorRatePercent}%`
                                                  : '0%'}
                                              </span>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                              <Link
                                                to={`/services/${svc.id}`}
                                                className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-600 dark:text-cyan-400 hover:underline"
                                              >
                                                <span>Detail Service</span>
                                                <ArrowRight className="w-3 h-3" />
                                              </Link>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center bg-white/50 dark:bg-slate-900/30">
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Belum ada microservice yang dialokasikan pada server host ini.
                                  </p>
                                </div>
                              )}

                              {/* Databases Section if present on server */}
                              {server.databases && server.databases.length > 0 && (
                                <div className="pt-1">
                                  <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                                    <Database className="w-3.5 h-3.5 text-indigo-500" />
                                    <span>Database Runtime Instances ({server.databases.length})</span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                    {server.databases.map((db, idx) => (
                                      <div
                                        key={idx}
                                        className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1322]"
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                          <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                                            {db.name}
                                          </span>
                                          <span className="text-[10px] text-slate-400 font-mono">
                                            :{db.port}
                                          </span>
                                        </div>
                                        <span className="text-[10px] text-slate-500 font-mono">
                                          {db.status || 'UP'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── MODAL: TAMBAH SERVER TARGET & MULTI-NODE DISCOVERY ────────────── */}
      <Modal
        isOpen={showAddServerModal}
        onClose={() => {
          if (!registerServerMutation.isPending && !discoverServerMutation.isPending) {
            setShowAddServerModal(false);
          }
        }}
        title={
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <ServerIcon className="w-5 h-5 text-cyan-500" />
            <span>Daftarkan Server Node</span>
          </div>
        }
        subtitle="Hubungkan server target (Node Exporter / microservices) untuk auto-detect port listening dan monitoring dinamis."
        maxWidth="2xl"
      >
        <form onSubmit={handleRegisterSubmit} className="space-y-4 text-xs font-mono">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-400 flex items-center gap-2 font-sans">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {formSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-400 flex items-center gap-2 font-sans">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{formSuccess}</span>
            </div>
          )}

          {/* Connection Mode Switcher */}
          <div className="space-y-1.5">
            <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
              Metode Koneksi &amp; Auto-Discovery
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDiscoveryMode('probe')}
                className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition ${
                  discoveryMode === 'probe'
                    ? 'bg-white dark:bg-[#1e293b] text-cyan-600 dark:text-cyan-400 shadow-sm border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-emerald-500" />
                <span>HTTP Port Probe (Zero-Config)</span>
              </button>

              <button
                type="button"
                onClick={() => setDiscoveryMode('ssh')}
                className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition ${
                  discoveryMode === 'ssh'
                    ? 'bg-white dark:bg-[#1e293b] text-cyan-600 dark:text-cyan-400 shadow-sm border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-cyan-500" />
                <span>SSH Remote (Linux / EC2)</span>
              </button>
            </div>
          </div>

          {/* Network Host & Discovery Parameters */}
          <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#0f172a]/60 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                  IP Address / Host Target <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 16.171.70.224, 192.168.1.105 atau localhost"
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                />
              </div>

              {discoveryMode === 'ssh' ? (
                <div className="space-y-1.5">
                  <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                    Port SSH
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="65535"
                    value={sshConfig.sshPort}
                    onChange={(e) => setSshConfig({ ...sshConfig, sshPort: e.target.value })}
                    className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                    Port Exporter
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="65535"
                    placeholder="9100"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                    className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                  />
                </div>
              )}
            </div>

            {discoveryMode === 'ssh' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                      SSH Username <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. ubuntu atau ec2-user"
                      value={sshConfig.username}
                      onChange={(e) => setSshConfig({ ...sshConfig, username: e.target.value })}
                      className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                      SSH Password (Opsional)
                    </label>
                    <input
                      type="password"
                      placeholder="Password user SSH (jika ada)"
                      value={sshConfig.password}
                      onChange={(e) => setSshConfig({ ...sshConfig, password: e.target.value })}
                      className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                      SSH Private Key (.pem) — Khusus AWS EC2 / Key Pair
                    </label>
                    <label className="cursor-pointer text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-sans">
                      <span>📁 Pilih File .pem</span>
                      <input
                        type="file"
                        accept=".pem,.key,text/plain"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              setSshConfig((prev) => ({ ...prev, privateKey: (event.target?.result as string) || '' }));
                            };
                            reader.readAsText(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Paste isi file .pem di sini (atau klik 'Pilih File .pem' di atas). Default AWS EC2 Ubuntu hanya menerima SSH Key."
                    value={sshConfig.privateKey}
                    onChange={(e) => setSshConfig({ ...sshConfig, privateKey: e.target.value })}
                    className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-[11px] font-mono text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm resize-none"
                  />
                </div>
              </div>
            )}

            {/* Run Discovery Trigger Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                {discoveryMode === 'ssh'
                  ? '💡 Pastikan SSH di server target aktif dan port 22/2222 dapat dihubungi.'
                  : '💡 Backend akan mendeteksi port-port yang listening dan mengambil spesifikasi hardware secara otomatis.'}
              </span>

              <button
                type="button"
                onClick={handleRunDiscovery}
                disabled={discoverServerMutation.isPending || !formData.host.trim()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold font-mono transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {discoverServerMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghubungi Host &amp; Memindai...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
                    <span>Tes &amp; Auto-Detect Service</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ─── HASIL DISCOVERY PANEL (JIKA SUDAH DISCAN) ───────────────────── */}
          {discoveredData && (
            <div className="p-4 rounded-xl bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800/40 space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-bold text-xs text-slate-900 dark:text-white font-mono">
                    Hasil Deteksi Host: {discoveredData.os || 'Linux Node'}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {discoveredData.services.length} Service Ditemukan
                </span>
              </div>

              {/* Hardware Specs Preview */}
              {discoveredData.spec && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                      <Cpu className="w-3 h-3 text-cyan-500" />
                      <span>CPU</span>
                    </div>
                    <div className="font-bold text-sm text-slate-800 dark:text-white mt-0.5">
                      {discoveredData.spec.cores} Cores
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                      <HardDrive className="w-3 h-3 text-emerald-500" />
                      <span>RAM</span>
                    </div>
                    <div className="font-bold text-sm text-slate-800 dark:text-white mt-0.5">
                      {Math.round(discoveredData.spec.totalMemoryMb / 1024)} GB
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                      <Layers className="w-3 h-3 text-amber-500" />
                      <span>Disk SSD</span>
                    </div>
                    <div className="font-bold text-sm text-slate-800 dark:text-white mt-0.5">
                      {discoveredData.spec.totalDiskGb} GB
                    </div>
                  </div>
                </div>
              )}

              {/* Discovered Services Checklist */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[11px] flex-wrap gap-2">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      Port Listening &amp; Service yang Terdeteksi:
                    </span>
                    <span className="text-slate-400 text-[10px]">
                      {discoveredServicesSelection.length} dari {discoveredData.services.length} dipilih untuk dipantau
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllDiscoveredServices}
                      className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 hover:underline"
                    >
                      Pilih Semua
                    </button>
                    <span className="text-slate-300 dark:text-slate-700">&bull;</span>
                    <button
                      type="button"
                      onClick={deselectAllDiscoveredServices}
                      className="text-[11px] text-slate-500 hover:underline"
                    >
                      Batal Semua
                    </button>
                  </div>
                </div>

                {discoveredData.services.length === 0 ? (
                  <div className="p-3 text-center text-slate-500 text-[11px] bg-white dark:bg-[#111827] rounded-lg border border-slate-200 dark:border-slate-800">
                    Tidak ada port listening aktif yang terdeteksi di host ini. Pastikan IP dan firewall / security group port terbuka.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                    {discoveredData.services.map((svc) => {
                      const isSelected = discoveredServicesSelection.some((s) => s.id === svc.id);
                      return (
                        <div
                          key={svc.id}
                          onClick={() => toggleDiscoveredService(svc.id)}
                          className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition select-none ${
                            isSelected
                              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-900 dark:text-emerald-100 shadow-sm'
                              : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 hover:border-slate-300 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded text-emerald-500 focus:ring-emerald-400 h-4 w-4 pointer-events-none shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={svc.name}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => handleUpdateDiscoveredServiceName(svc.id, e.target.value)}
                                  className="font-bold text-[11px] bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 hover:border-cyan-500 focus:border-cyan-500 focus:bg-white/40 dark:focus:bg-black/30 focus:outline-none px-1 py-0.5 rounded text-slate-900 dark:text-white transition w-full"
                                  title="Nama service (klik untuk mengubah nama service)"
                                />
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 shrink-0">
                                  :{svc.port}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5 px-1">
                                {svc.url}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {svc.stack}
                            </span>
                            <span className="text-[9px] font-medium text-emerald-500">
                              {svc.hasMetrics ? 'Metrics' : 'Listening'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Server Identity & Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                Nama Server / Label <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Node-EC2-01"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                Environment
              </label>
              <select
                value={formData.env}
                onChange={(e) => setFormData({ ...formData, env: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm font-mono"
              >
                <option value="PRODUCTION">PRODUCTION</option>
                <option value="STAGING">STAGING</option>
                <option value="DEVELOPMENT">DEVELOPMENT</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                Region / Lokasi
              </label>
              <input
                type="text"
                placeholder="e.g. jakarta-idc / ap-southeast-1"
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
              Deskripsi Singkat (Opsional)
            </label>
            <input
              type="text"
              placeholder="e.g. Server menjalankan microservice konsultasi dan profil kesehatan"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={registerServerMutation.isPending || discoverServerMutation.isPending}
              onClick={() => setShowAddServerModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={registerServerMutation.isPending || !formData.name.trim() || !formData.host.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold font-mono transition shadow-sm shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {registerServerMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mendaftarkan &amp; Memulai Scraping...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Daftarkan Server &amp; Mulai Scraping</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL: EDIT KONFIGURASI SERVER ───────────────────────────────── */}
      <Modal
        isOpen={Boolean(editingServer)}
        onClose={() => {
          if (!updateServerMutation.isPending) {
            setEditingServer(null);
            setEditError(null);
            setEditSuccess(null);
          }
        }}
        title={
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Pencil className="w-5 h-5 text-cyan-500" />
            <span>Edit Konfigurasi Server: {editingServer?.name}</span>
          </div>
        }
        subtitle="Perbarui nama server, host IP, port inspeksi, region, atau deskripsi."
        maxWidth="xl"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4 text-xs font-mono">
          {editError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-400 flex items-center gap-2 font-sans">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          {editSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-400 flex items-center gap-2 font-sans">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{editSuccess}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
              Nama Server / Node *
            </label>
            <input
              type="text"
              required
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm font-sans"
              placeholder="e.g. AWS-Ubuntu-Server-1"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                IP Address / Host Target *
              </label>
              <input
                type="text"
                required
                value={editFormData.host}
                onChange={(e) => setEditFormData({ ...editFormData, host: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                placeholder="192.168.1.50 atau domain"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                Port Target / SSH
              </label>
              <input
                type="number"
                value={editFormData.port}
                onChange={(e) => setEditFormData({ ...editFormData, port: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                placeholder="22 / 9100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                Environment
              </label>
              <select
                value={editFormData.env}
                onChange={(e) => setEditFormData({ ...editFormData, env: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
              >
                <option value="PRODUCTION">PRODUCTION</option>
                <option value="STAGING">STAGING</option>
                <option value="DEVELOPMENT">DEVELOPMENT</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                Region / Lokasi
              </label>
              <input
                type="text"
                value={editFormData.region}
                onChange={(e) => setEditFormData({ ...editFormData, region: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                placeholder="jakarta-idc / ap-southeast-1"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
              Deskripsi Server
            </label>
            <input
              type="text"
              value={editFormData.description}
              onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
              className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm font-sans"
              placeholder="e.g. Server hosting Docker containers"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={updateServerMutation.isPending}
              onClick={() => setEditingServer(null)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={updateServerMutation.isPending || !editFormData.name.trim() || !editFormData.host.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold font-mono transition shadow-sm shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updateServerMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <span>Simpan Perubahan</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL: HAPUS SERVER CONFIRMATION ─────────────────────────────── */}
      <Modal
        isOpen={Boolean(deletingServer)}
        onClose={() => {
          if (!deleteServerMutation.isPending) {
            setDeletingServer(null);
            setDeleteError(null);
          }
        }}
        title={
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <Trash2 className="w-5 h-5 text-rose-500" />
            <span>Hapus Server dari Monitoring</span>
          </div>
        }
        subtitle="Konfirmasi pencopotan server node dari sistem pemantauan."
        maxWidth="md"
      >
        <div className="space-y-4 text-xs font-sans">
          {deleteError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-400 flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{deleteError}</span>
            </div>
          )}

          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 space-y-2">
            <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
              Apakah Anda yakin ingin menghapus server <strong>{deletingServer?.name}</strong> ({deletingServer?.host || deletingServer?.ip}) dari monitoring?
            </p>
            <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
              Semua microservice yang terikat pada server ini akan otomatis dibersihkan dari dashboard agar tidak menampilkan status Down/Unreachable palsu.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 font-mono">
            <button
              type="button"
              disabled={deleteServerMutation.isPending}
              onClick={() => setDeletingServer(null)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={deleteServerMutation.isPending}
              onClick={handleDeleteSubmit}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm shadow-rose-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleteServerMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menghapus Server...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Ya, Hapus Server</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── MODAL: KELOLA SERVER PROJEK (+/-) ───────────────────────────── */}
      {projectId && project && (
        <Modal
          isOpen={showManageProjectServersModal}
          onClose={() => setShowManageProjectServersModal(false)}
          title={
            <div className="flex items-center gap-2 text-slate-900 dark:text-white">
              <FolderKanban className="w-5 h-5 text-indigo-500" />
              <span>Kelola Alokasi Server Projek &mdash; {project.name}</span>
            </div>
          }
          subtitle="Centang atau hilangkan centang untuk mengalokasikan / mengeluarkan server dari projek ini."
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs font-sans">
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {servers.map((srv) => {
                const isInProject = (project.serverIds || []).includes(srv.id);
                return (
                  <div
                    key={srv.id}
                    onClick={() => !isUpdatingProjectServers && handleToggleServerInProject(srv.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between text-xs ${
                      isInProject
                        ? 'bg-indigo-50/70 dark:bg-indigo-500/15 border-indigo-300 dark:border-indigo-500/40 text-indigo-950 dark:text-indigo-200'
                        : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center transition ${
                          isInProject
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-slate-400 bg-white dark:bg-slate-800'
                        }`}
                      >
                        {isInProject && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div>
                        <div className="font-bold">{srv.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{srv.ip || srv.host}</div>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                        isInProject
                          ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {isInProject ? 'Terdaftar di Projek' : 'Belum Terdaftar'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 font-mono">
              <button
                type="button"
                onClick={() => setShowManageProjectServersModal(false)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-sm"
              >
                Selesai
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
};

