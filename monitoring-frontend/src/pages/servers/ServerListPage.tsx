import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServers, useRegisterServer } from '../../hooks/useServers';
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
} from 'lucide-react';
import {
  OFFICIAL_PLACEMENT_RULES,
  evaluateServerCompliance,
} from '../../utils/serverRules';

export const ServerListPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: servers = [], isLoading, isError, refetch } = useServers();
  const { data: allServices = [] } = useServices();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
  const [showAddServerModal, setShowAddServerModal] = useState<boolean>(false);

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

  const toggleServiceSelection = (serviceId: string) => {
    setFormData((prev) => {
      const exists = prev.selectedServiceIds.includes(serviceId);
      return {
        ...prev,
        selectedServiceIds: exists
          ? prev.selectedServiceIds.filter((id) => id !== serviceId)
          : [...prev.selectedServiceIds, serviceId],
      };
    });
  };

  const registerServerMutation = useRegisterServer();

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
    const portNum = parseInt(formData.port, 10);
    if (isNaN(portNum) || portNum <= 0 || portNum > 65535) {
      setFormError('Port harus valid antara 1 - 65535');
      return;
    }

    try {
      const res = await registerServerMutation.mutateAsync({
        name: formData.name.trim(),
        host: formData.host.trim(),
        port: portNum,
        env: formData.env,
        region: formData.region.trim(),
        description: formData.description.trim(),
        serviceIds: formData.selectedServiceIds,
      });
      setFormSuccess(`Server "${res.name}" berhasil didaftarkan! Status: ${res.status}`);
      refetch();
      setTimeout(() => {
        setShowAddServerModal(false);
        setFormSuccess(null);
        setFormData({
          name: '',
          host: '',
          port: '9100',
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

      {/* ─── MODAL: TAMBAH SERVER TARGET VIA IP & PORT ───────────────────────── */}
      <Modal
        isOpen={showAddServerModal}
        onClose={() => {
          if (!registerServerMutation.isPending) {
            setShowAddServerModal(false);
          }
        }}
        title={
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <ServerIcon className="w-5 h-5 text-cyan-500" />
            <span>Daftarkan Server Host Target Baru</span>
          </div>
        }
        subtitle="Registrasikan host server fisik/VM baru untuk dipantau telemetrinya via IP dan Port Agent/Exporter."
        maxWidth="lg"
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

          <div className="space-y-1.5">
            <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
              Nama Server / Host <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Server Gamma / Worker Node 1"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                Host / IP Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 192.168.1.150 / localhost"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                Port Exporter / Agent <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                required
                min="1"
                max="65535"
                placeholder="e.g. 9100"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
            Port yang diuji adalah port telemetri host (misal port 9100 untuk Prometheus Node Exporter atau port agent kesehatan server).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                Environment
              </label>
              <select
                value={formData.env}
                onChange={(e) => setFormData({ ...formData, env: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm font-mono"
              >
                <option value="PRODUCTION">PRODUCTION</option>
                <option value="STAGING">STAGING</option>
                <option value="DEVELOPMENT">DEVELOPMENT</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                Region
              </label>
              <input
                type="text"
                placeholder="e.g. jakarta-idc"
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
              Deskripsi Singkat (Opsional)
            </label>
            <input
              type="text"
              placeholder="e.g. Node worker cadangan untuk pipeline pemrosesan"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-sm"
            />
          </div>

          {/* Microservices Allocation (Checklist) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                Pilih Microservices yang Berjalan di Host Ini ({formData.selectedServiceIds.length} dipilih)
              </label>
              <span className="text-[10px] text-slate-400 font-mono">Opsional</span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
              Tandai service yang di-deploy ke server ini agar telemetri service otomatis terpantau di detail host.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-[#0a0f1d]/50">
              {allServices.length === 0 ? (
                <div className="col-span-2 p-3 text-center text-slate-400 text-[11px]">
                  Memuat daftar microservice...
                </div>
              ) : (
                allServices.map((svc) => {
                  const isChecked = formData.selectedServiceIds.includes(svc.id);
                  const isGo = (svc.stack || '').toLowerCase().includes('go');
                  return (
                    <div
                      key={svc.id}
                      onClick={() => toggleServiceSelection(svc.id)}
                      className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition select-none ${
                        isChecked
                          ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-700 dark:text-cyan-300'
                          : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="rounded text-cyan-500 focus:ring-cyan-400 h-3.5 w-3.5 pointer-events-none"
                        />
                        <span className="font-bold text-[11px] truncate">
                          {svc.name}
                        </span>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tracking-wider shrink-0 ${
                          isGo
                            ? 'bg-cyan-50 dark:bg-[#0e2238] text-cyan-600 dark:text-[#38bdf8]'
                            : 'bg-emerald-50 dark:bg-[#0d2a22] text-emerald-600 dark:text-[#10b981]'
                        }`}
                      >
                        {isGo ? 'GO' : 'NODE.JS'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={registerServerMutation.isPending}
              onClick={() => setShowAddServerModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={registerServerMutation.isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold font-mono transition shadow-sm shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {registerServerMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menguji Koneksi &amp; Mendaftarkan...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Daftarkan Server Target</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
