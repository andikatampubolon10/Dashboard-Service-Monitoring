import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServices } from '../../hooks/useServices';
import { ErrorState } from '../../components/common/ErrorState';
import { TableSkeleton } from '../../components/common/LoadingSkeleton';
import { Modal } from '../../components/common/Modal';
import {
  Search,
  ArrowUpDown,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Plus,
  Server as ServerIcon,
  Loader2,
  Terminal,
  Cpu,
  HardDrive,
  Sparkles,
  Radio,
  Layers,
} from 'lucide-react';
import {
  OFFICIAL_PLACEMENT_RULES,
  evaluateServerCompliance,
} from '../../utils/serverRules';
import { useServers, useRegisterServer, useDiscoverServer } from '../../hooks/useServers';
import { DiscoveredService, DiscoverServerResponse } from '../../types';

export const ServerListPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: servers = [], isLoading, isError, refetch } = useServers();
  const { data: allServices = [] } = useServices();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
  const [showAddServerModal, setShowAddServerModal] = useState<boolean>(false);

  // Discovery Mode & Credentials
  const [discoveryMode, setDiscoveryMode] = useState<'ssh' | 'probe'>('ssh');
  const [sshConfig, setSshConfig] = useState({
    sshPort: '22',
    username: 'ubuntu',
    password: '',
  });
  const [candidatePortsStr, setCandidatePortsStr] = useState('8080, 4004, 4006, 4007, 3001, 3002, 4005, 9100');
  const [discoveredData, setDiscoveredData] = useState<DiscoverServerResponse | null>(null);
  const [discoveredServicesSelection, setDiscoveredServicesSelection] = useState<DiscoveredService[]>([]);

  // Form state for adding new server
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: '22',
    env: 'PRODUCTION',
    region: 'jakarta-idc',
    description: '',
    selectedServiceIds: [] as string[],
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const discoverServerMutation = useDiscoverServer();
  const registerServerMutation = useRegisterServer();

  const handleRunDiscovery = async () => {
    setFormError(null);
    setFormSuccess(null);

    const cleanHost = formData.host.trim();
    if (!cleanHost) {
      setFormError('Masukkan IP Address atau Host laptop target terlebih dahulu');
      return;
    }

    try {
      let candidatePorts: number[] | undefined;
      if (discoveryMode === 'probe' && candidatePortsStr.trim()) {
        candidatePorts = candidatePortsStr
          .split(',')
          .map((p) => parseInt(p.trim(), 10))
          .filter((p) => !isNaN(p) && p > 0);
      }

      const res = await discoverServerMutation.mutateAsync({
        host: cleanHost,
        mode: discoveryMode,
        sshPort: parseInt(sshConfig.sshPort, 10) || 22,
        username: sshConfig.username.trim() || undefined,
        password: sshConfig.password || undefined,
        candidatePorts,
      });

      setDiscoveredData(res);
      setDiscoveredServicesSelection(res.services || []);

      // Pre-fill default name if empty
      if (!formData.name.trim()) {
        const shortHost = cleanHost.replace(/[^a-zA-Z0-9]/g, '-');
        setFormData((prev) => ({
          ...prev,
          name: discoveryMode === 'ssh' ? `WSL2-Node-${shortHost}` : `Remote-Node-${shortHost}`,
          description: `Discovered via ${discoveryMode.toUpperCase()} (${res.os || 'Linux'}) with ${res.services?.length || 0} active services`,
          port: discoveryMode === 'ssh' ? sshConfig.sshPort : (res.services?.[0]?.port ? String(res.services[0].port) : '9100'),
        }));
      }

      setFormSuccess(
        `Koneksi berhasil! Terdeteksi ${res.services?.length || 0} microservice aktif di ${cleanHost} (${res.os || 'Linux'}).`
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Gagal melakukan auto-discovery ke target host';
      setFormError(errorMsg);
      setDiscoveredData(null);
    }
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
        spec: discoveredData?.spec,
      });

      setFormSuccess(`Server "${res.name}" berhasil didaftarkan! Status: ${res.status}`);
      refetch();
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
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Servers
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Infrastructure hosts and resource utilization with service placement rules
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Rules Guide Action Button */}
          <button
            onClick={() => setShowRulesModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/25 text-xs font-semibold text-cyan-700 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 transition shadow-sm"
          >
            <ShieldCheck className="w-4 h-4 text-cyan-500" />
            <span>Aturan Penggabungan Service</span>
          </button>

          {/* Add Server Button */}
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
        </div>
      </div>

      {/* Search Bar with Rows Count */}
      <div className="flex items-center justify-between gap-4">
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
        <span className="text-xs text-slate-400 font-mono select-none">
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
                  <th className="py-3.5 px-5 text-right">
                    <span>ATURAN ALOKASI</span>
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

                  // Evaluate placement rules for this server
                  const currentServicesOnServer = allServices.filter((s) =>
                    server.hostedServices.includes(s.id)
                  );
                  const compliance = evaluateServerCompliance(server, currentServicesOnServer);

                  return (
                    <tr
                      key={server.id}
                      onClick={() => navigate(`/servers/${server.id}`)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer group"
                    >
                      {/* Server Name with Checkbox matching screenshot */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <span className="w-4 h-4 rounded border border-slate-400 dark:border-slate-600 inline-flex items-center justify-center shrink-0">
                            <span className="w-2 h-2 rounded-sm bg-slate-400 dark:bg-slate-600 opacity-60" />
                          </span>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white group-hover:text-cyan-400 transition block">
                              {server.name}
                            </span>
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

                      {/* SERVICES (matching screenshot format 1 / 3, 0 / 4) */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {currentCount} / {maxCap}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {currentCount === 0 ? 'Empty' : currentCount >= maxCap ? 'Full' : 'Available'}
                          </span>
                        </div>
                      </td>

                      {/* Uptime */}
                      <td className="py-4 px-5 text-slate-600 dark:text-slate-400">
                        {server.uptime}
                      </td>

                      {/* Rule Compliance Status Badge */}
                      <td className="py-4 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                            compliance.status === 'violation'
                              ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/25'
                              : compliance.status === 'warning'
                              ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/25'
                              : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25'
                          }`}
                          title={
                            compliance.violations[0] ||
                            compliance.warnings[0] ||
                            'Semua aturan alokasi terpenuhi'
                          }
                        >
                          {compliance.status === 'violation' ? (
                            <XCircle className="w-3.5 h-3.5 text-rose-500" />
                          ) : compliance.status === 'warning' ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          )}
                          <span>
                            {compliance.status === 'violation'
                              ? 'Melanggar Aturan'
                              : compliance.status === 'warning'
                              ? 'Peringatan Resource'
                              : 'Sesuai Aturan'}
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── MODAL: PANDUAN RESMI ATURAN PENGGABUNGAN SERVICE ─────────────────── */}
      <Modal
        isOpen={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        title={
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <ShieldCheck className="w-5 h-5 text-cyan-500" />
            <span>Aturan Baku Penggabungan Service ke Server Host</span>
          </div>
        }
        subtitle="Standard Operating Procedure (SOP) & Kebijakan Penempatan Microservices Multi-Tenant"
        maxWidth="3xl"
      >
        <div className="space-y-4 text-xs font-mono">
          <p className="text-slate-600 dark:text-slate-300 font-sans text-xs leading-relaxed">
            Satu server dapat menampung 2 atau lebih microservice untuk efisiensi resource. Namun, penempatan service <strong>tidak boleh dilakukan sembarangan</strong>. Setiap penggabungan service harus mematuhi 5 aturan di bawah ini:
          </p>

          {/* Rules List */}
          <div className="space-y-3">
            {OFFICIAL_PLACEMENT_RULES.map((rule, idx) => (
              <div
                key={rule.id}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0a0f1d] border border-slate-200 dark:border-slate-800/80 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 text-[11px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <strong className="text-slate-900 dark:text-white text-xs font-sans">
                      {rule.title}
                    </strong>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    {rule.strictness}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-[11px] font-sans pl-7">
                  {rule.description}
                </p>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 flex items-start gap-2.5 text-[11px] text-cyan-700 dark:text-cyan-300 font-sans">
            <HelpCircle className="w-4 h-4 shrink-0 text-cyan-500 mt-0.5" />
            <div>
              <strong>Validasi Otomatis:</strong> Klik pada salah satu server untuk membuka halaman detail host. Sistem menyediakan pemantauan resource CPU, Memory, Disk, status database, grafik timeline, dan daftar service.
            </div>
          </div>
        </div>
      </Modal>

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
            <span>Daftarkan Server Node (Laptop / WSL Distro)</span>
          </div>
        }
        subtitle="Registrasikan laptop lain di jaringan LAN/Wi-Fi untuk auto-detect hardware dan scraping microservices secara dinamis."
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
                onClick={() => setDiscoveryMode('ssh')}
                className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition ${
                  discoveryMode === 'ssh'
                    ? 'bg-white dark:bg-[#1e293b] text-cyan-600 dark:text-cyan-400 shadow-sm border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-cyan-500" />
                <span>SSH Remote (WSL2 / Linux)</span>
              </button>

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
            </div>
          </div>

          {/* Network Host & Discovery Parameters */}
          <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#0f172a]/60 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                  IP Address / Host Laptop Target <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 192.168.1.105 atau localhost"
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
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                    className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                  />
                </div>
              )}
            </div>

            {discoveryMode === 'ssh' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                    SSH Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ubuntu atau nama user WSL"
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
                    placeholder="Password user WSL (jika ada)"
                    value={sshConfig.password}
                    onChange={(e) => setSshConfig({ ...sshConfig, password: e.target.value })}
                    className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                  Daftar Port Kandidat Microservice untuk Di-scan
                </label>
                <input
                  type="text"
                  placeholder="8080, 4004, 4006, 4007, 3001, 3002, 4005, 9100"
                  value={candidatePortsStr}
                  onChange={(e) => setCandidatePortsStr(e.target.value)}
                  className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm font-mono"
                />
              </div>
            )}

            {/* Run Discovery Trigger Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                {discoveryMode === 'ssh'
                  ? '💡 Pastikan WSL di laptop 2 menggunakan networkingMode=mirrored di .wslconfig atau SSH aktif.'
                  : '💡 Backend akan menguji response /metrics di setiap port secara paralel.'}
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
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    Microservice yang Ditemukan di Laptop Ini:
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    {discoveredServicesSelection.length} dari {discoveredData.services.length} dipilih untuk di-scrape
                  </span>
                </div>

                {discoveredData.services.length === 0 ? (
                  <div className="p-3 text-center text-slate-500 text-[11px] bg-white dark:bg-[#111827] rounded-lg border border-slate-200 dark:border-slate-800">
                    Tidak ada microservice dengan endpoint <code>/metrics</code> yang merespons di port yang dipindai. Anda tetap dapat mendaftarkan server ini dan memilih service secara manual di bawah.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {discoveredData.services.map((svc) => {
                      const isSelected = discoveredServicesSelection.some((s) => s.id === svc.id);
                      return (
                        <div
                          key={svc.id}
                          onClick={() => toggleDiscoveredService(svc.id)}
                          className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition select-none ${
                            isSelected
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                              : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 hover:border-slate-300 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded text-emerald-500 focus:ring-emerald-400 h-3.5 w-3.5 pointer-events-none"
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-[11px] truncate">
                                {svc.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Port :{svc.port} &bull; {svc.url}
                              </div>
                            </div>
                          </div>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                            {svc.stack}
                          </span>
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
                placeholder="e.g. Laptop-2-Worker"
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
                placeholder="e.g. jakarta-idc / local-lan"
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
              placeholder="e.g. Laptop 2 menjalankan microservice live-consult dan ai-consultation"
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
    </div>
  );
};
