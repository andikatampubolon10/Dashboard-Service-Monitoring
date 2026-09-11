import { useState, useEffect, useRef, useMemo } from "react";
import {
  Zap,
  Play,
  Square,
  CheckCircle2,
  MessageSquare,
  BookOpen,
  Stethoscope,
  Users,
  TrendingUp,
  FileText,
  Laptop,
  Globe,
  Lock,
  Activity,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import {
  LineChart as ReLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  stressTestEngine,
  StressTestProgress,
  SelectedFlowType,
  StressTestRecord,
  generateRecommendations,
  getStressTestHistory,
  saveStressTestRecord,
  clearStressTestHistory,
} from "../services/stressTestEngine";
import { formatPercent, formatNumber } from "../utils/formatters";
import { useServices } from "../hooks/useServices";
import StressTestResultModal from "../components/monitoring/StressTestResultModal";

interface LatencyPoint {
  time: string;
  p95: number;
  rps: number;
}

interface ServiceEndpointState {
  identity: string;
  aiConsult: string;
  lifestyle: string;
  liveConsult: string;
  healthProfile: string;
}

const DEFAULT_ENDPOINTS: ServiceEndpointState = {
  identity: "http://localhost:8081",
  aiConsult: "http://localhost:4006",
  lifestyle: "http://localhost:4007",
  liveConsult: "http://localhost:4004",
  healthProfile: "http://localhost:3001",
};

export const StressTestPage = () => {
  const { data: servicesList } = useServices();
  const [progress, setProgress] = useState<StressTestProgress>(stressTestEngine.getProgress());
  const [selectedFlow, setSelectedFlow] = useState<SelectedFlowType>("1");
  const [targetVUs, setTargetVUs] = useState<number>(50);
  const durationSec = 30; // Durasi pengujian standar 30 detik
  const [chartData, setChartData] = useState<LatencyPoint[]>([]);
  const [endpoints, setEndpoints] = useState<ServiceEndpointState>(DEFAULT_ENDPOINTS);

  // Expand / Collapse state untuk detail target endpoint & pemilihan server
  const [isEndpointExpanded, setIsEndpointExpanded] = useState<boolean>(false);

  // Otomatis sinkronkan endpoint terpilih: prioritaskan yang statusnya UP (Online)
  useEffect(() => {
    if (!servicesList || servicesList.length === 0) return;

    setEndpoints((prev) => {
      let changed = false;
      const updated = { ...prev };

      const serviceConfigs: Array<{ key: keyof ServiceEndpointState; filter: string; port: string }> = [
        { key: "identity", filter: "identity", port: "8081" },
        { key: "aiConsult", filter: "ai-consult", port: "4006" },
        { key: "lifestyle", filter: "lifestyle", port: "4007" },
        { key: "liveConsult", filter: "live-consult", port: "4004" },
        { key: "healthProfile", filter: "health-profile", port: "3001" },
      ];

      serviceConfigs.forEach(({ key, filter, port }) => {
        const matches = servicesList.filter((s) => {
          const sId = (s.id || "").toLowerCase();
          const sName = (s.name || "").toLowerCase();
          return sId.includes(filter) || sName.includes(filter);
        });

        if (matches.length > 0) {
          const current = (prev[key] || "").replace(/\/$/, "");
          const currentMatch = matches.find((m) => (m.url || "").replace(/\/$/, "") === current);
          const isCurrentUp = currentMatch ? (currentMatch.rawStatus === "UP" || currentMatch.status === "healthy") : false;
          const upMatches = matches.filter((m) => m.rawStatus === "UP" || m.status === "healthy");

          // Jika URL saat ini belum terpilih/tidak valid, ATAU URL saat ini sedang DOWN tapi ada instance lain yang UP:
          if (!currentMatch || (!isCurrentUp && upMatches.length > 0)) {
            const targetUrl = (upMatches[0]?.url || matches[0].url || `http://localhost:${port}`).replace(/\/$/, "");
            if (updated[key] !== targetUrl) {
              updated[key] = targetUrl;
              changed = true;
            }
          }
        }
      });

      return changed ? updated : prev;
    });
  }, [servicesList]);

  // Evaluasi kesiapan target endpoint untuk flow yang sedang dipilih
  const flowEndpointsStatus = useMemo(() => {
    const requiredKeys: Array<{ key: keyof ServiceEndpointState; name: string; port: string; role: string }> = [
      { key: "identity", name: "Identity Service", port: "8081", role: "Step 1: Auth & Login" },
    ];
    if (selectedFlow === "1") {
      requiredKeys.push({ key: "aiConsult", name: "AI Consultation", port: "4006", role: "Step 2 & 3: Chat & AI Session" });
    } else if (selectedFlow === "2") {
      requiredKeys.push({ key: "healthProfile", name: "Health Profile", port: "3001", role: "Step 1: Status PIN" });
      requiredKeys.push({ key: "lifestyle", name: "Lifestyle Service", port: "4007", role: "Step 2 & 3: Artikel" });
    } else if (selectedFlow === "3") {
      requiredKeys.push({ key: "liveConsult", name: "Live Consult", port: "4004", role: "Step 2 & 3: Telekonsultasi" });
    }

    const details = requiredKeys.map(({ key, name, port, role }) => {
      const targetUrl = (endpoints[key] || "").replace(/\/$/, "");
      const matchedService = (servicesList || []).find(
        (s) => (s.url || "").replace(/\/$/, "") === targetUrl
      );
      const isUp = matchedService ? (matchedService.rawStatus === "UP" || matchedService.status === "healthy") : false;
      const isRemote = Boolean(matchedService?.isRemote || (!targetUrl.includes("localhost") && !targetUrl.includes("127.0.0.1")));
      return {
        key,
        name,
        port,
        role,
        url: targetUrl,
        isUp,
        isRemote,
      };
    });

    const upCount = details.filter((d) => d.isUp).length;
    const totalCount = details.length;
    const allUp = upCount === totalCount;
    const downServices = details.filter((d) => !d.isUp);

    return { details, upCount, totalCount, allUp, downServices };
  }, [selectedFlow, endpoints, servicesList]);

  // Status Kesiapan masing-masing flow untuk indikator kartu Step 1
  const flowOverviewStatus = useMemo(() => {
    const isServiceUrlUp = (url: string) => {
      const cleanUrl = (url || "").replace(/\/$/, "");
      return (servicesList || []).some(
        (s) => (s.url || "").replace(/\/$/, "") === cleanUrl && (s.rawStatus === "UP" || s.status === "healthy")
      );
    };

    const flow1Up = (isServiceUrlUp(endpoints.identity) ? 1 : 0) + (isServiceUrlUp(endpoints.aiConsult) ? 1 : 0);
    const flow2Up = (isServiceUrlUp(endpoints.healthProfile) ? 1 : 0) + (isServiceUrlUp(endpoints.lifestyle) ? 1 : 0);
    const flow3Up = (isServiceUrlUp(endpoints.identity) ? 1 : 0) + (isServiceUrlUp(endpoints.liveConsult) ? 1 : 0);

    return {
      flow1: { up: flow1Up, total: 2, allUp: flow1Up === 2 },
      flow2: { up: flow2Up, total: 2, allUp: flow2Up === 2 },
      flow3: { up: flow3Up, total: 2, allUp: flow3Up === 2 },
    };
  }, [endpoints, servicesList]);

  const [historyRecords, setHistoryRecords] = useState<StressTestRecord[]>(() => getStressTestHistory());
  const [activeModalRecord, setActiveModalRecord] = useState<StressTestRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const prevIsRunningRef = useRef<boolean>(false);

  useEffect(() => {
    const unsubscribe = stressTestEngine.subscribe((p) => {
      setProgress(p);

      if (p.isRunning) {
        setChartData((prev) => {
          const nowStr = new Date().toLocaleTimeString("id-ID", {
            minute: "2-digit",
            second: "2-digit",
          });
          const newPoint: LatencyPoint = {
            time: nowStr,
            p95: p.p95LatencyMs,
            rps: p.currentRps,
          };
          const updated = [...prev, newPoint];
          return updated.slice(-30);
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Detect completion of stress test run & auto open result modal
  useEffect(() => {
    if (prevIsRunningRef.current && !progress.isRunning && progress.isFinished && progress.totalRequests > 0) {
      const flowTitles: Record<SelectedFlowType, string> = {
        "1": "Flow 1: Konsultasi AI Healthcare",
        "2": "Flow 2: PIN & Baca Artikel",
        "3": "Flow 3: Pencarian & Profil Dokter",
      };

      const recs = generateRecommendations(
        progress.healthGrade,
        progress.p95LatencyMs,
        progress.errorRatePercent,
        progress.selectedFlow
      );

      const newRecord: StressTestRecord = {
        id: `run-${Date.now()}`,
        timestamp: new Date().toLocaleString("id-ID", {
          dateStyle: "short",
          timeStyle: "medium",
        }),
        selectedFlow: progress.selectedFlow,
        flowTitle: flowTitles[progress.selectedFlow] || "Pengujian Stress Test",
        targetVUs,
        durationSec: progress.totalDurationSec,
        totalRequests: progress.totalRequests,
        successRequests: progress.successRequests,
        failedRequests: progress.failedRequests,
        currentRps: progress.currentRps,
        p95LatencyMs: progress.p95LatencyMs,
        avgLatencyMs: progress.avgLatencyMs,
        errorRatePercent: progress.errorRatePercent,
        healthGrade: progress.healthGrade,
        healthVerdict: progress.healthVerdict,
        recommendations: recs,
        targetEndpoints: {
          identity: endpoints.identity,
          aiConsult: endpoints.aiConsult,
          lifestyle: endpoints.lifestyle,
          liveConsult: endpoints.liveConsult,
          healthProfile: endpoints.healthProfile,
        },
      };

      const updatedHistory = saveStressTestRecord(newRecord);
      setHistoryRecords(updatedHistory);
      setActiveModalRecord(newRecord);
      setIsModalOpen(true);
    }

    prevIsRunningRef.current = progress.isRunning;
  }, [
    progress.isRunning,
    progress.isFinished,
    progress.totalRequests,
    progress.healthGrade,
    progress.p95LatencyMs,
    progress.errorRatePercent,
    progress.selectedFlow,
    progress.totalDurationSec,
    progress.successRequests,
    progress.failedRequests,
    progress.currentRps,
    progress.avgLatencyMs,
    progress.healthVerdict,
    targetVUs,
    endpoints,
  ]);

  const handleStart = () => {
    setChartData([]);
    stressTestEngine.start(selectedFlow, targetVUs, durationSec, {
      identity: endpoints.identity,
      aiConsult: endpoints.aiConsult,
      lifestyle: endpoints.lifestyle,
      liveConsult: endpoints.liveConsult,
      healthProfile: endpoints.healthProfile,
    });
  };

  const handleStop = () => {
    stressTestEngine.stop();
  };

  // Reusable Endpoint Picker Component (Support single auto-lock & multi-IP instance selection)
  const renderServiceEndpointPicker = (
    key: keyof ServiceEndpointState,
    name: string,
    defaultPort: string,
    desc: string,
    currentUrl: string,
    categoryFilter: string
  ) => {
    const registeredMatches = (servicesList || []).filter((s) => {
      const sId = (s.id || "").toLowerCase();
      const sName = (s.name || "").toLowerCase();
      const filterKey = categoryFilter.toLowerCase();
      return sId.includes(filterKey) || sName.includes(filterKey);
    });

    const serviceOptions: Array<{
      id: string;
      name: string;
      url: string;
      isRemote: boolean;
      serverLabel: string;
      isUp: boolean;
    }> = [];

    const seenUrls = new Set<string>();

    if (registeredMatches.length > 0) {
      registeredMatches.forEach((s) => {
        const rawUrl = (s.url || "").trim();
        if (!rawUrl) return;
        const normalizedUrl = rawUrl.replace(/\/$/, "");
        if (seenUrls.has(normalizedUrl)) return;
        seenUrls.add(normalizedUrl);

        const isRemote = Boolean(
          s.isRemote || (!normalizedUrl.includes("localhost") && !normalizedUrl.includes("127.0.0.1"))
        );
        const isUp = s.rawStatus === "UP" || s.status === "healthy";

        serviceOptions.push({
          id: s.id,
          name: s.name,
          url: normalizedUrl,
          isRemote,
          serverLabel: isRemote ? "AWS EC2 Cloud" : "Local Server",
          isUp,
        });
      });
    }

    if (serviceOptions.length === 0) {
      const defaultUrl = `http://localhost:${defaultPort}`;
      serviceOptions.push({
        id: `default-${key}`,
        name,
        url: defaultUrl,
        isRemote: false,
        serverLabel: "Local Server (Default)",
        isUp: false,
      });
    }

    const hasRemoteInstance = serviceOptions.some((opt) => opt.isRemote);
    const hasMultipleOptions = serviceOptions.length > 1;
    const upOptions = serviceOptions.filter((opt) => opt.isUp);
    const isSingleUpInstance = upOptions.length === 1 && hasMultipleOptions;

    return (
      <div
        key={key}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3.5 space-y-2.5 shadow-2xs"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {name}
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              :{defaultPort}
            </span>
          </div>

          {!hasMultipleOptions ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
              <Lock className="w-2.5 h-2.5" /> Target Otomatis ({serviceOptions[0]?.isUp ? "Online" : "Offline"})
            </span>
          ) : isSingleUpInstance ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
              <Lock className="w-2.5 h-2.5" /> Target Otomatis ({upOptions[0].serverLabel} Online)
            </span>
          ) : upOptions.length > 1 ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded">
              ⚡ Tersedia {upOptions.length} Server Online (Bebas Pilih)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
              Semua Server Offline
            </span>
          )}
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {desc}
        </p>

        {hasMultipleOptions ? (
          <div className="space-y-1.5 pt-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Pilih Server / Lokasi IP Instance:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {serviceOptions.map((opt) => {
                const isSelected = currentUrl === opt.url;
                return (
                  <button
                    key={opt.url}
                    type="button"
                    disabled={progress.isRunning}
                    onClick={() => {
                      setEndpoints((prev) => ({ ...prev, [key]: opt.url }));
                    }}
                    className={`text-left p-2.5 rounded-lg border text-xs transition-all cursor-pointer ${
                      isSelected
                        ? opt.isRemote
                          ? "border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20 shadow-xs"
                          : "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20 shadow-xs"
                        : "border-slate-200 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <div className="flex items-center gap-1.5 font-bold text-[11px]">
                        {opt.isRemote ? (
                          <Globe className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                        ) : (
                          <Laptop className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        )}
                        <span>{opt.serverLabel}</span>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.2 rounded-full font-mono ${
                          opt.isUp
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                            : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            opt.isUp ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                          }`}
                        />
                        {opt.isUp ? "UP (ONLINE)" : "DOWN"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <code className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate block">
                        {opt.url.replace(/^https?:\/\//, "")}
                      </code>
                      {isSelected && (
                        <span className="text-[10px] font-bold text-orange-500 ml-1 shrink-0">
                          ✓ Aktif
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs">
            {hasRemoteInstance ? (
              <Globe className="w-3.5 h-3.5 text-purple-500 shrink-0" />
            ) : (
              <Laptop className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            )}
            <span className="text-slate-600 dark:text-slate-400 text-[11px]">
              {serviceOptions[0]?.serverLabel || "Localhost"}:
            </span>
            <code className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200">
              {currentUrl}
            </code>
            <span
              className={`ml-auto inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.2 rounded-full font-mono ${
                serviceOptions[0]?.isUp
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  serviceOptions[0]?.isUp ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                }`}
              />
              {serviceOptions[0]?.isUp ? "UP (ONLINE)" : "DOWN"}
            </span>
          </div>
        )}

        <div className="text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-1.5">
          <span>Target Terpilih:</span>
          <span
            className={`font-semibold ${
              currentUrl.includes("localhost") || currentUrl.includes("127.0.0.1")
                ? "text-blue-600 dark:text-blue-400"
                : "text-purple-600 dark:text-purple-400"
            }`}
          >
            {currentUrl}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Compact Mini Header Bar (~36px height) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-1.5 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500 border border-orange-500/20">
            <Zap className="h-4 w-4 fill-orange-500/20" />
          </div>
          <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
            Stress Testing & Microservices Capacity Simulator
          </h1>
          <span className="hidden md:inline-block text-[11px] text-slate-400">
            • Simulasi Beban & Analisis SLA Real-Time
          </span>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {progress.isRunning ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              SEDANG MENGUJI ({progress.activeVUs} VU)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Sistem Siap Diuji
            </span>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2-COLUMN COCKPIT LAYOUT: Zero-Scroll Height, Direct Above-the-Fold Launch */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Controls & Launch Action (~460px Height, Fits Screen) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* STEP 1: Pilih Alur Fitur (3 Compact Horizontal Buttons) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-4 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-extrabold">1</span>
                Pilih Alur Skenario:
              </span>
              <span className="text-[10px] text-slate-400">1-Klik Ganti Alur</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {/* Flow 1 */}
              <button
                type="button"
                disabled={progress.isRunning}
                onClick={() => {
                  setSelectedFlow("1");
                  stressTestEngine.setSelectedFlow("1");
                }}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedFlow === "1"
                    ? "border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300 ring-2 ring-orange-500/30 font-bold shadow-xs"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <MessageSquare className="w-3.5 h-3.5 text-rose-500" />
                  <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                    flowOverviewStatus.flow1.allUp ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"
                  }`}>
                    {flowOverviewStatus.flow1.up}/2 UP
                  </span>
                </div>
                <div className="text-xs font-bold truncate">Konsultasi AI Dokter</div>
                <div className="text-[9px] text-slate-400 truncate">Tanya Jawab Medis</div>
              </button>

              {/* Flow 2 */}
              <button
                type="button"
                disabled={progress.isRunning}
                onClick={() => {
                  setSelectedFlow("2");
                  stressTestEngine.setSelectedFlow("2");
                }}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedFlow === "2"
                    ? "border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300 ring-2 ring-orange-500/30 font-bold shadow-xs"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                  <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                    flowOverviewStatus.flow2.allUp ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"
                  }`}>
                    {flowOverviewStatus.flow2.up}/2 UP
                  </span>
                </div>
                <div className="text-xs font-bold truncate">Portal Artikel Medis</div>
                <div className="text-[9px] text-slate-400 truncate">Edukasi & Lifestyle</div>
              </button>

              {/* Flow 3 */}
              <button
                type="button"
                disabled={progress.isRunning}
                onClick={() => {
                  setSelectedFlow("3");
                  stressTestEngine.setSelectedFlow("3");
                }}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedFlow === "3"
                    ? "border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300 ring-2 ring-orange-500/30 font-bold shadow-xs"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Stethoscope className="w-3.5 h-3.5 text-blue-500" />
                  <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                    flowOverviewStatus.flow3.allUp ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"
                  }`}>
                    {flowOverviewStatus.flow3.up}/2 UP
                  </span>
                </div>
                <div className="text-xs font-bold truncate">Jadwal & Cari Dokter</div>
                <div className="text-[9px] text-slate-400 truncate">Direktori Spesialis</div>
              </button>
            </div>

            {/* Keterangan Singkat Skenario Alur Terpilih */}
            <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-800 flex items-center gap-1.5">
              <span className="text-orange-500 font-bold shrink-0">💡 Skenario:</span>
              <span className="truncate">
                {selectedFlow === "1" && "Uji ketahanan saat ratusan pasien login lalu tanya-jawab dengan AI Dokter."}
                {selectedFlow === "2" && "Uji query database saat banyak pengguna memverifikasi PIN & membaca artikel edukasi."}
                {selectedFlow === "3" && "Uji kecepatan engine Golang saat pasien mencari dokter & memfilter jadwal praktik."}
              </span>
            </div>
          </div>

          {/* STEP 2: Target Microservices (Ringkas Chip + Expand/Collapse Server Picker) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-4 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-extrabold">2</span>
                  Target Microservices:
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsEndpointExpanded(!isEndpointExpanded)}
                className="text-[11px] font-bold text-orange-500 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                {isEndpointExpanded ? "Tutup Detail" : "⚙️ Ganti Server / Detail"}
                {isEndpointExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Penjelasan Singkat Fungsi Target Microservices */}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Daftar server backend yang menerima beban uji. Target otomatis diarahkan ke server yang aktif (<span className="text-emerald-500 font-semibold">Online 🟢</span>). Anda dapat mengganti target server melalui menu detail.
            </p>

            {/* Summary Chip Baris Ringkas (Menampilkan instance aktif & status online) */}
            <div className="flex items-center gap-2 flex-wrap text-xs bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
              {flowEndpointsStatus.details.map((item) => (
                <div
                  key={item.key}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]"
                >
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    {item.name.replace(" Service", "")}:
                  </span>
                  <code
                    className={`text-[10px] font-mono ${
                      item.isRemote
                        ? "text-purple-600 dark:text-purple-400"
                        : "text-blue-600 dark:text-blue-400"
                    }`}
                  >
                    {item.isRemote ? "Remote" : "Lokal"} :{item.port}
                  </code>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      item.isUp ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                    }`}
                    title={item.isUp ? `${item.name} UP` : `${item.name} DOWN`}
                  />
                </div>
              ))}

              <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                flowEndpointsStatus.allUp ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"
              }`}>
                {flowEndpointsStatus.upCount}/{flowEndpointsStatus.totalCount} READY
              </span>
            </div>

            {/* Area Expandable jika ingin melihat Pipeline API & Mengganti Server */}
            {isEndpointExpanded && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3 animate-in fade-in duration-200">
                {/* Visual Pipeline Breadcrumbs */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-2.5 space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Pipeline Tahapan Eksekusi API:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {selectedFlow === "1" && (
                      <>
                        <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-bold text-[10px]">1. Auth Login</span>
                            <span className="text-[9px] font-mono font-bold px-1 rounded bg-blue-500/10 text-blue-500">POST</span>
                          </div>
                          <code className="text-[10px] font-mono text-slate-500 truncate block">/api/v1/auth/login</code>
                        </div>
                        <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-bold text-[10px]">2. Sesi Chat</span>
                            <span className="text-[9px] font-mono font-bold px-1 rounded bg-rose-500/10 text-rose-500">POST</span>
                          </div>
                          <code className="text-[10px] font-mono text-slate-500 truncate block">/api/consultations</code>
                        </div>
                        <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-bold text-[10px]">3. Chat Dokter</span>
                            <span className="text-[9px] font-mono font-bold px-1 rounded bg-rose-500/10 text-rose-500">POST</span>
                          </div>
                          <code className="text-[10px] font-mono text-slate-500 truncate block">/api/consultation/chat</code>
                        </div>
                      </>
                    )}
                    {selectedFlow === "2" && (
                      <>
                        <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-bold text-[10px]">1. Status PIN</span>
                            <span className="text-[9px] font-mono font-bold px-1 rounded bg-emerald-500/10 text-emerald-500">GET</span>
                          </div>
                          <code className="text-[10px] font-mono text-slate-500 truncate block">/api/v1/pin/status</code>
                        </div>
                        <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-bold text-[10px]">2. List Artikel</span>
                            <span className="text-[9px] font-mono font-bold px-1 rounded bg-amber-500/10 text-amber-500">GET</span>
                          </div>
                          <code className="text-[10px] font-mono text-slate-500 truncate block">/api/articles</code>
                        </div>
                        <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-bold text-[10px]">3. Baca Detail</span>
                            <span className="text-[9px] font-mono font-bold px-1 rounded bg-amber-500/10 text-amber-500">GET</span>
                          </div>
                          <code className="text-[10px] font-mono text-slate-500 truncate block">/api/articles/:slug</code>
                        </div>
                      </>
                    )}
                    {selectedFlow === "3" && (
                      <>
                        <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-bold text-[10px]">1. Auth Login</span>
                            <span className="text-[9px] font-mono font-bold px-1 rounded bg-blue-500/10 text-blue-500">POST</span>
                          </div>
                          <code className="text-[10px] font-mono text-slate-500 truncate block">/api/v1/auth/login</code>
                        </div>
                        <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-bold text-[10px]">2. List Dokter</span>
                            <span className="text-[9px] font-mono font-bold px-1 rounded bg-blue-500/10 text-blue-500">GET</span>
                          </div>
                          <code className="text-[10px] font-mono text-slate-500 truncate block">/api/live-consult</code>
                        </div>
                        <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-bold text-[10px]">3. Profil Dokter</span>
                            <span className="text-[9px] font-mono font-bold px-1 rounded bg-blue-500/10 text-blue-500">GET</span>
                          </div>
                          <code className="text-[10px] font-mono text-slate-500 truncate block">/api/live-consult/:id</code>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Instance Picker Form (Hanya muncul opsi pemilih jika ada multi-IP) */}
                {(selectedFlow === "1" || selectedFlow === "3") &&
                  renderServiceEndpointPicker(
                    "identity",
                    "Identity Service",
                    "8081",
                    "Menangani login akun & penerbitan token JWT resmi untuk autentikasi API",
                    endpoints.identity,
                    "identity"
                  )}
                {selectedFlow === "1" &&
                  renderServiceEndpointPicker(
                    "aiConsult",
                    "AI Consultation Service",
                    "4006",
                    "Engine AI percakapan medis, riwayat chat (MongoDB) & streaming respon",
                    endpoints.aiConsult,
                    "ai-consult"
                  )}
                {selectedFlow === "2" && (
                  <>
                    {renderServiceEndpointPicker(
                      "healthProfile",
                      "Health Profile Service",
                      "3001",
                      "Verifikasi keamanan kode PIN & data profil kepesertaan pasien",
                      endpoints.healthProfile,
                      "health-profile"
                    )}
                    {renderServiceEndpointPicker(
                      "lifestyle",
                      "Lifestyle Service",
                      "4007",
                      "Katalog artikel gaya hidup, tips kesehatan & indexing konten medis",
                      endpoints.lifestyle,
                      "lifestyle"
                    )}
                  </>
                )}
                {selectedFlow === "3" &&
                  renderServiceEndpointPicker(
                    "liveConsult",
                    "Live Consult Service",
                    "4004",
                    "Direktori dokter spesialis & filter jadwal praktik (Golang High-Performance)",
                    endpoints.liveConsult,
                    "live-consult"
                  )}
              </div>
            )}
          </div>

          {/* STEP 3: Beban Virtual Users (VU) & Tombol Eksekusi Langsung */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-extrabold">3</span>
                Beban User & Eksekusi:
              </span>
              <span className="text-[11px] font-mono text-slate-400">Durasi: 30s</span>
            </div>

            <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-orange-500" />
                <input
                  type="number"
                  disabled={progress.isRunning}
                  min={1}
                  max={2000}
                  value={targetVUs}
                  onChange={(e) => setTargetVUs(Math.max(1, parseInt(e.target.value || "1", 10)))}
                  className="w-16 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-center font-extrabold font-mono text-sm text-slate-900 dark:text-white"
                />
                <span className="text-xs font-bold text-slate-500">VU</span>
              </div>

              <div className="flex items-center gap-1">
                {[25, 50, 100, 200, 500].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={progress.isRunning}
                    onClick={() => setTargetVUs(preset)}
                    className={`rounded-md px-2 py-1 text-[11px] font-bold font-mono transition cursor-pointer ${
                      targetVUs === preset
                        ? "bg-orange-500 text-white shadow-xs"
                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Tombol Utama: Langsung Terlihat di Layar Pertama Tanpa Scroll! */}
            {progress.isRunning ? (
              <button
                type="button"
                onClick={handleStop}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 py-3 text-xs font-black text-white shadow-lg shadow-rose-600/30 transition-all cursor-pointer uppercase tracking-wider animate-pulse"
              >
                <Square className="h-4 w-4 fill-white" /> HENTIKAN PENGUJIAN SEKARANG
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStart}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:from-orange-600 hover:to-amber-600 py-3.5 text-xs font-black text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:-translate-y-0.5 transition-all cursor-pointer uppercase tracking-wider"
              >
                <Play className="h-4 w-4 fill-white" /> JALANKAN STRESS TEST ({targetVUs} VU)
              </button>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Live Observability Dashboard (Side-by-Side dengan Kolom Kiri) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Header Status & Progress */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-4 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <Activity className="w-4 h-4 text-orange-500" />
                <span>Telemetry Monitor (Real-Time)</span>
              </div>
              {progress.isRunning ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-600 dark:text-orange-400 font-bold font-mono text-[11px] animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping" />
                  MENGUJI ({progress.activeVUs} VU)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" /> SISTEM SIAP
                </span>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-500">Status Waktu:</span>
                <span className="text-slate-700 dark:text-slate-300 font-bold">
                  {progress.elapsedSec}s / {progress.totalDurationSec}s ({progress.totalDurationSec > 0 ? Math.min(100, Math.round((progress.elapsedSec / progress.totalDurationSec) * 100)) : 0}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full transition-all duration-300 ${progress.isRunning ? "bg-gradient-to-r from-orange-500 to-amber-500" : "bg-emerald-500"}`}
                  style={{
                    width: `${progress.totalDurationSec > 0 ? Math.min(100, Math.round((progress.elapsedSec / progress.totalDurationSec) * 100)) : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* 4 KPI Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-3 text-center shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">VU Aktif</span>
              <p className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white mt-0.5">{progress.activeVUs}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-3 text-center shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Throughput</span>
              <p className="text-2xl font-extrabold font-mono text-orange-500 mt-0.5">{progress.currentRps}<span className="text-xs font-normal">/s</span></p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-3 text-center shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Latensi P95</span>
              <p className={`text-2xl font-extrabold font-mono mt-0.5 ${progress.p95LatencyMs > 1000 ? "text-rose-500" : "text-slate-900 dark:text-white"}`}>
                {progress.p95LatencyMs}<span className="text-xs font-normal">ms</span>
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-3 text-center shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Error Rate</span>
              <p className={`text-2xl font-extrabold font-mono mt-0.5 ${progress.errorRatePercent > 5 ? "text-rose-500" : "text-emerald-500"}`}>
                {formatPercent(progress.errorRatePercent, 1)}
              </p>
            </div>
          </div>

          {/* Real-Time Latency Chart (Proportional Height h-52) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                <TrendingUp className="w-3.5 h-3.5 text-orange-500" />
                <span>Tren Latensi P95 Real-Time (ms)</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">SLA Limit: 1000ms</span>
            </div>

            <div className="h-52 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <ReLineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} domain={[0, "auto"]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0F172A",
                      borderColor: "#334155",
                      borderRadius: "8px",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                  />
                  <ReferenceLine y={1000} stroke="#f43f5e" strokeDasharray="5 5" label={{ value: "SLA (1000ms)", fill: "#f43f5e", fontSize: 10 }} />
                  <Line type="monotone" dataKey="p95" stroke="#f97316" strokeWidth={2.5} dot={false} name="Latensi P95 (ms)" />
                </ReLineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: Riwayat Pengujian (Test History Table) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
            <FileText className="w-4 h-4 text-orange-500" />
            <span>Riwayat Pengujian Terakhir (Test Run History)</span>
          </div>
          {historyRecords.length > 0 && (
            <button
              onClick={() => {
                clearStressTestHistory();
                setHistoryRecords([]);
              }}
              className="text-xs text-slate-400 hover:text-rose-500 font-semibold transition"
            >
              Hapus Riwayat
            </button>
          )}
        </div>

        {historyRecords.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs font-medium">
            Belum ada riwayat pengujian. Klik tombol <span className="text-orange-500 font-bold">JALANKAN STRESS TEST</span> di atas untuk memulai.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="p-3 rounded-l-xl">Waktu Pengujian</th>
                  <th className="p-3">Skenario Flow</th>
                  <th className="p-3 text-center">User (VU)</th>
                  <th className="p-3 text-center">Kecepatan (RPS)</th>
                  <th className="p-3 text-center">Respon P95</th>
                  <th className="p-3 text-center">Error Rate</th>
                  <th className="p-3 text-center">Status System</th>
                  <th className="p-3 text-right rounded-r-xl">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
                {historyRecords.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition">
                    <td className="p-3 font-mono text-slate-500 dark:text-slate-400">{item.timestamp}</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{item.flowTitle}</td>
                    <td className="p-3 text-center font-mono font-bold">{item.targetVUs} VU</td>
                    <td className="p-3 text-center font-mono">{formatNumber(item.currentRps)}/s</td>
                    <td className={`p-3 text-center font-mono font-bold ${item.p95LatencyMs > 1000 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {item.p95LatencyMs} ms
                    </td>
                    <td className={`p-3 text-center font-mono ${item.errorRatePercent > 5 ? "text-rose-500" : "text-slate-600 dark:text-slate-400"}`}>
                      {item.errorRatePercent.toFixed(1)}%
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                        item.healthGrade === "HEALTHY"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : item.healthGrade === "DEGRADED"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                      }`}>
                        {item.healthGrade === "HEALTHY" && "🟢 SEHAT"}
                        {item.healthGrade === "DEGRADED" && "🟡 TERTEKAN"}
                        {item.healthGrade === "CRITICAL" && "🔴 OVERLOAD"}
                      </span>
                      {item.errorRatePercent > 0 && (
                        <div className="text-[10px] text-rose-500 dark:text-rose-400 font-mono mt-0.5 leading-tight font-semibold">
                          {item.p95LatencyMs >= 5000
                            ? `Timeout (${item.p95LatencyMs}ms > 5s)`
                            : `Auth / HTTP Error (${item.errorRatePercent.toFixed(1)}%)`}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => {
                          setActiveModalRecord(item);
                          setIsModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-bold text-xs transition"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Detail Hasil Pengujian
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Analisis Rekomendasi Beban */}
      <StressTestResultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        record={activeModalRecord}
      />
    </div>
  );
};

export default StressTestPage;
