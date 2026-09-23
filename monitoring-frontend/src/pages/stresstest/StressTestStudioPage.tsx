import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Zap,
  Play,
  Square,
  TrendingUp,
  FolderKanban,
  Plus,
  Trash2,
  Pencil,
  Activity,
  ArrowLeft,
  Layers,
  Users,
  CheckCircle2,
  Eye,
  Clock,
  Terminal,
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
  StressStage,
  CustomFlow,
  generateRecommendations,
  getStressTestHistory,
  saveStressTestRecord,
  clearStressTestHistory,
  fetchDbStressTestHistory,
  fetchCustomFlows,
  saveCustomFlow,
  deleteCustomFlow,
} from "../../services/stressTestEngine";
import { Project, Service, Server as ServerType } from "../../types";
import StressTestResultModal from "../../components/monitoring/StressTestResultModal";
import { LivePatientPipeline } from "../../components/monitoring/LivePatientPipeline";
import { CustomFlowModal } from "../../components/monitoring/CustomFlowModal";
import { ServiceTestCreatorModal } from "../../components/monitoring/ServiceTestCreatorModal";
import { AiStressInsightCard } from "../../components/monitoring/AiStressInsightCard";

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
  identity: "http://34.101.207.115:8080",
  aiConsult: "http://34.101.122.171:4006",
  lifestyle: "http://34.101.207.115:4005",
  liveConsult: "http://34.101.207.115:4004",
  healthProfile: "http://34.101.207.115:3001",
};

interface StressTestStudioPageProps {
  activeProject: Project;
  projectServices: Service[];
  projectServers: ServerType[];
  onBackToProjectList: () => void;
}

export const StressTestStudioPage: React.FC<StressTestStudioPageProps> = ({
  activeProject,
  projectServices,
  projectServers,
  onBackToProjectList,
}) => {
  const [progress, setProgress] = useState<StressTestProgress>(stressTestEngine.getProgress());

  const [selectedFlow, setSelectedFlow] = useState<SelectedFlowType>(() => {
    const urlFlow = new URLSearchParams(window.location.search).get("flow");
    if (urlFlow) return urlFlow as SelectedFlowType;
    const storedFlow = localStorage.getItem("stress_test_selected_flow");
    if (storedFlow) return storedFlow as SelectedFlowType;
    return "1";
  });

  const [intensityTab, setIntensityTab] = useState<"load" | "stress">(() => {
    const urlTab = new URLSearchParams(window.location.search).get("tab");
    if (urlTab === "load" || urlTab === "stress") return urlTab;
    const storedTab = localStorage.getItem("stress_test_intensity_tab");
    if (storedTab === "load" || storedTab === "stress") return storedTab as "load" | "stress";
    return "load";
  });

  const [targetVUs, setTargetVUs] = useState<number>(() => {
    const stored = localStorage.getItem("stress_test_target_vus");
    return stored && !isNaN(Number(stored)) ? Number(stored) : 50;
  });

  const [durationSec, setDurationSec] = useState<number>(() => {
    const stored = localStorage.getItem("stress_test_duration_sec");
    return stored && !isNaN(Number(stored)) ? Number(stored) : 30;
  });

  const [selectedPresetPattern, setSelectedPresetPattern] = useState<"standard" | "spike" | "stepup">(() => {
    const stored = localStorage.getItem("stress_test_preset_pattern");
    if (stored === "standard" || stored === "spike" || stored === "stepup") return stored;
    return "standard";
  });

  const [chartData, setChartData] = useState<LatencyPoint[]>([]);
  const [endpoints, setEndpoints] = useState<ServiceEndpointState>(DEFAULT_ENDPOINTS);
  const [logs, setLogs] = useState<string[]>([]);

  // Custom Flows States
  const [customFlows, setCustomFlows] = useState<CustomFlow[]>([]);
  const [isFlowModalOpen, setIsFlowModalOpen] = useState<boolean>(false);
  const [isServiceTestModalOpen, setIsServiceTestModalOpen] = useState<boolean>(false);
  const [editingFlow, setEditingFlow] = useState<CustomFlow | null>(null);

  // Observability Panel Tab in Studio: "pipeline" | "chart" | "logs"
  const [observabilityTab, setObservabilityTab] = useState<"pipeline" | "chart" | "logs">("pipeline");

  // History Filter: "all" | "load" | "stress"
  const [historyFilter, setHistoryFilter] = useState<"all" | "load" | "stress">("all");

  // Dynamic Stages States
  const [stages, setStages] = useState<StressStage[]>([
    { durationSec: 10, targetVUs: 25 },
    { durationSec: 15, targetVUs: 50 },
    { durationSec: 10, targetVUs: 0 },
  ]);
  const [isFlowStepsModalOpen, setIsFlowStepsModalOpen] = useState<boolean>(false);

  // Subscribe to real-time k6 stdout/stderr logs
  useEffect(() => {
    const unsubLogs = stressTestEngine.subscribeLogs((newLogs) => {
      setLogs([...newLogs]);
    });
    return () => unsubLogs();
  }, []);

  // Load Custom Flows for this Project
  useEffect(() => {
    if (!activeProject?.id) {
      setCustomFlows([]);
      return;
    }
    const loadFlows = async () => {
      const list = await fetchCustomFlows(activeProject.id);
      setCustomFlows(list);
    };
    loadFlows();
  }, [activeProject?.id]);

  // Active Custom Flow & Title
  const activeCustomFlow = useMemo(() => {
    return customFlows.find((f) => f.id === selectedFlow) || null;
  }, [customFlows, selectedFlow]);

  const currentFlowTitle = useMemo(() => {
    if (activeCustomFlow) return `Custom: ${activeCustomFlow.name}`;
    if (selectedFlow === "1") return "Konsultasi AI Healthcare";
    if (selectedFlow === "2") return "Artikel Medis & Lifestyle";
    if (selectedFlow === "3") return "Temu Dokter & Live Chat";
    return `Alur Kustom (${selectedFlow})`;
  }, [activeCustomFlow, selectedFlow]);

  // Auto-generate stages based on Preset Pattern & Target VUs
  useEffect(() => {
    if (selectedPresetPattern === "standard") {
      const rUp = Math.max(5, Math.round(durationSec * 0.25));
      const peak = Math.max(10, Math.round(durationSec * 0.5));
      const rDown = Math.max(5, durationSec - rUp - peak);
      setStages([
        { durationSec: rUp, targetVUs },
        { durationSec: peak, targetVUs },
        { durationSec: rDown, targetVUs: 0 },
      ]);
    } else if (selectedPresetPattern === "spike") {
      const baseline = Math.max(5, Math.round(targetVUs * 0.25));
      const spikeVU = Math.min(500, Math.round(targetVUs * 1.6));
      setStages([
        { durationSec: 10, targetVUs: baseline },
        { durationSec: 5, targetVUs: spikeVU },
        { durationSec: 15, targetVUs },
        { durationSec: 10, targetVUs: 0 },
      ]);
    } else if (selectedPresetPattern === "stepup") {
      const s1 = Math.max(5, Math.round(targetVUs * 0.33));
      const s2 = Math.max(10, Math.round(targetVUs * 0.66));
      setStages([
        { durationSec: 10, targetVUs: s1 },
        { durationSec: 10, targetVUs: s2 },
        { durationSec: 15, targetVUs },
        { durationSec: 10, targetVUs: 0 },
      ]);
    }
  }, [selectedPresetPattern, targetVUs, durationSec]);

  const totalCalculatedDuration = useMemo(() => {
    if (intensityTab === "load") return 30;
    return stages.reduce((acc, s) => acc + s.durationSec, 0);
  }, [stages, intensityTab]);

  const maxPeakVU = useMemo(() => {
    if (intensityTab === "load") return targetVUs;
    return Math.max(targetVUs, ...stages.map((s) => s.targetVUs));
  }, [intensityTab, stages, targetVUs]);

  const activeStepsCount = useMemo(() => {
    if (activeCustomFlow && activeCustomFlow.steps && activeCustomFlow.steps.length > 0) {
      return activeCustomFlow.steps.length;
    }
    if (selectedFlow === "1") return 5;
    if (selectedFlow === "2") return 3;
    if (selectedFlow === "3") return 4;
    return 1;
  }, [activeCustomFlow, selectedFlow]);

  const activeFlowStepDetails = useMemo(() => {
    const identityHost = endpoints.identity.replace(/^https?:\/\//, "");
    const aiHost = endpoints.aiConsult.replace(/^https?:\/\//, "");
    const lifeHost = endpoints.lifestyle.replace(/^https?:\/\//, "");
    const liveHost = endpoints.liveConsult.replace(/^https?:\/\//, "");

    if (activeCustomFlow && activeCustomFlow.steps && activeCustomFlow.steps.length > 0) {
      return activeCustomFlow.steps.map((st, i) => ({
        id: i + 1,
        name: st.name,
        method: st.method || "GET",
        path: st.path || "/",
        service: st.serviceKey || "Custom Service",
        server: identityHost,
        serverName: "Node GCP 1",
        desc: `Panggilan API ${st.method} ke ${st.path} pada ${st.serviceKey}`,
      }));
    }
    if (selectedFlow === "1") {
      return [
        { id: 1, name: "Akses Akun & Login Pasien", method: "POST", path: "/api/v1/auth/login", service: "Identity Service", server: identityHost, serverName: "Node GCP 1", desc: "Otentikasi kredensial 50 akun pasien unik & token JWT" },
        { id: 2, name: "Buka Sesi Konsultasi", method: "POST", path: "/api/consultations", service: "AI Consult (PostgreSQL)", server: aiHost, serverName: "Node GCP 2 (AI Engine)", desc: "Inisiasi sesi konsultasi baru & simpan rekam keluhan" },
        { id: 3, name: "Tanya Jawab AI Dokter", method: "POST", path: "/api/consultation/chat", service: "AI Consult (Fastify)", server: aiHost, serverName: "Node GCP 2 (AI Engine)", desc: "Pengiriman pesan keluhan pasien & inferensi model LLM" },
        { id: 4, name: "Riwayat Transkrip Percakapan", method: "GET", path: "/api/consultations/:id", service: "AI Consult (Storage)", server: aiHost, serverName: "Node GCP 2 (AI Engine)", desc: "Pengambilan transkrip lengkap percakapan dan ringkasan diagnosa" },
        { id: 5, name: "Beri Rating Feedback & Selesai", method: "PATCH", path: "/api/consultations/:id", service: "AI Consult & Event Kafka", server: aiHost, serverName: "Node GCP 2 (AI Engine)", desc: "Penutupan sesi, kirim rating kepuasan & audit event broker Kafka" },
      ];
    }
    if (selectedFlow === "2") {
      return [
        { id: 1, name: "Verifikasi Identitas Akun", method: "POST", path: "/api/v1/auth/login", service: "Identity Service", server: identityHost, serverName: "Node GCP 1", desc: "Otentikasi akun pasien untuk verifikasi hak akses konten kesehatan" },
        { id: 2, name: "Buka Katalog Artikel Medis", method: "GET", path: "/api/articles", service: "Lifestyle Service (MongoDB)", server: lifeHost, serverName: "Node GCP 1", desc: "Akses katalog artikel kesehatan, tips nutrisi & daftar topik edukasi" },
        { id: 3, name: "Baca Isi Artikel Lengkap", method: "GET", path: "/api/articles/:slug", service: "Lifestyle Service (Konten)", server: lifeHost, serverName: "Node GCP 1", desc: "Pengambilan isi artikel edukasi lengkap (dipilih secara dinamis)" },
      ];
    }
    return [
      { id: 1, name: "Akses Akun Pasien", method: "POST", path: "/api/v1/auth/login", service: "Identity Service", server: identityHost, serverName: "Node GCP 1", desc: "Otentikasi kredensial pasien & penerbitan token sesi" },
      { id: 2, name: "Cari Jadwal Dokter Spesialis", method: "GET", path: "/api/live-consult", service: "Live Consult (Golang)", server: liveHost, serverName: "Node GCP 1", desc: "Pencarian direktori spesialisasi dokter & cek jadwal praktik yang buka" },
      { id: 3, name: "Pilih Profil & Booking Antrean", method: "GET", path: "/api/live-consult/:id", service: "Live Consult (Session)", server: liveHost, serverName: "Node GCP 1", desc: "Akses detail profil dokter & registrasi ruang temu telekonsultasi" },
      { id: 4, name: "Kirim Chat via WebSocket", method: "WS", path: "/ws/live-consult/:id", service: "Golang WebSocket Engine", server: liveHost, serverName: "Node GCP 1", desc: "Handshake HTTP 101 & pertukaran pesan langsung dengan dokter asli" },
    ];
  }, [activeCustomFlow, selectedFlow, endpoints]);

  // Otomatis sinkronkan endpoint terpilih: prioritaskan yang statusnya UP (Online)
  useEffect(() => {
    if (!projectServices || projectServices.length === 0) return;

    setEndpoints((prev) => {
      let changed = false;
      const updated = { ...prev };

      const serviceConfigs: Array<{ key: keyof ServiceEndpointState; filter: string; port: string }> = [
        { key: "identity", filter: "identity", port: "8080" },
        { key: "aiConsult", filter: "ai-consult", port: "4006" },
        { key: "lifestyle", filter: "lifestyle", port: "4005" },
        { key: "liveConsult", filter: "live", port: "4004" },
        { key: "healthProfile", filter: "health-profile", port: "3001" },
      ];

      serviceConfigs.forEach(({ key, filter, port }) => {
        const matches = projectServices.filter((s) => {
          const sId = (s.id || "").toLowerCase();
          const sName = (s.name || "").toLowerCase();
          return sId.includes(filter) || sName.includes(filter);
        });

        if (matches.length > 0) {
          const current = (prev[key] || "").replace(/\/$/, "");
          const currentMatch = matches.find((m) => (m.url || "").replace(/\/$/, "") === current);
          const isCurrentUp = currentMatch
            ? currentMatch.rawStatus === "UP" || currentMatch.status === "healthy" || (currentMatch.status as any) === "UP"
            : false;
          const upMatches = matches.filter(
            (m) => m.rawStatus === "UP" || m.status === "healthy" || (m.status as any) === "UP"
          );

          if (!currentMatch || (!isCurrentUp && upMatches.length > 0)) {
            const rawUrl = upMatches[0]?.url || matches[0].url || "";
            const cleanUrl = rawUrl.replace(/:\s*undefined/g, "").replace(/\/$/, "");
            const hostFallback = upMatches[0]?.serverHost || matches[0]?.serverHost || (key === "aiConsult" ? "34.101.122.171" : "34.101.207.115");
            const targetUrl = (cleanUrl && !cleanUrl.endsWith(":"))
              ? cleanUrl
              : `http://${hostFallback}:${port}`;

            if (updated[key] !== targetUrl) {
              updated[key] = targetUrl;
              changed = true;
            }
          }
        }
      });

      return changed ? updated : prev;
    });
  }, [projectServices]);

  const [historyRecords, setHistoryRecords] = useState<StressTestRecord[]>(() => getStressTestHistory());
  const [activeModalRecord, setActiveModalRecord] = useState<StressTestRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const prevIsRunningRef = useRef<boolean>(false);

  // Ambil riwayat pengujian dari MySQL database berdasarkan Project aktif
  useEffect(() => {
    let isMounted = true;
    const loadDbHistory = () => {
      if (activeProject?.id) {
        fetchDbStressTestHistory(activeProject.id).then((runs) => {
          if (isMounted && runs.length > 0) {
            setHistoryRecords(runs);
          }
        });
      }
    };

    loadDbHistory();

    // Otomatis refresh riwayat begitu hasil k6 selesai tersimpan ke database MySQL
    const unsubSaved = stressTestEngine.subscribeSaved(() => {
      loadDbHistory();
    });

    return () => {
      isMounted = false;
      unsubSaved();
    };
  }, [activeProject?.id]);

  useEffect(() => {
    const unsubscribe = stressTestEngine.subscribe((p) => {
      setProgress(p);

      if (p.isRunning) {
        setChartData((prev) => {
          const nowStr = new Date().toLocaleTimeString("id-ID", {
            minute: "2-digit",
            second: "2-digit",
          });
          const newPt: LatencyPoint = {
            time: nowStr,
            p95: p.p95LatencyMs,
            rps: Math.round(p.currentRps),
          };
          const next = [...prev, newPt];
          return next.slice(-25);
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Tangani otomatis pop-up modal saat pengujian selesai
  useEffect(() => {
    if (prevIsRunningRef.current && !progress.isRunning && progress.totalRequests > 0) {
      const activeCustom = customFlows.find((f) => f.id === progress.selectedFlow);
      const flowTitle = activeCustom
        ? `Custom: ${activeCustom.name}`
        : progress.selectedFlow === "1"
        ? "Konsultasi AI Healthcare"
        : progress.selectedFlow === "2"
        ? "Artikel Medis & Lifestyle"
        : "Temu Dokter & Live Chat";

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
        testType: progress.testType || (intensityTab === "load" ? "load_test" : "stress_test"),
        selectedFlow: progress.selectedFlow,
        flowTitle,
        targetVUs: maxPeakVU,
        durationSec: progress.totalDurationSec || totalCalculatedDuration,
        totalRequests: progress.totalRequests,
        successRequests: progress.successRequests,
        failedRequests: progress.failedRequests,
        currentRps: progress.currentRps,
        p95LatencyMs: progress.p95LatencyMs,
        p90LatencyMs: progress.p90LatencyMs,
        avgLatencyMs: progress.avgLatencyMs,
        minLatencyMs: progress.minLatencyMs,
        medLatencyMs: progress.medLatencyMs,
        maxLatencyMs: progress.maxLatencyMs,
        errorRatePercent: progress.errorRatePercent,
        healthGrade: progress.healthGrade,
        healthVerdict: progress.healthVerdict,
        recommendations: recs,
        checks: progress.checks,
        k6Metrics: progress.k6Metrics,
        rawSummaryText: progress.rawSummaryText,
        logs: logs,
        failurePoint: progress.failurePoint,
        customSteps: activeCustom?.steps,
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
    maxPeakVU,
    totalCalculatedDuration,
    endpoints,
    customFlows,
    intensityTab,
    logs,
  ]);

  const handleStart = () => {
    setChartData([]);
    const customFlowObj = customFlows.find((f) => f.id === selectedFlow) || null;
    const testType = intensityTab === "load" ? "load_test" : "stress_test";
    stressTestEngine.start(
      selectedFlow,
      maxPeakVU,
      totalCalculatedDuration,
      {
        identity: endpoints.identity,
        aiConsult: endpoints.aiConsult,
        lifestyle: endpoints.lifestyle,
        liveConsult: endpoints.liveConsult,
        healthProfile: endpoints.healthProfile,
      },
      testType === "stress_test" ? stages : undefined,
      customFlowObj,
      testType,
      activeProject?.id,
      activeProject?.name
    );
  };

  const handleStop = () => {
    stressTestEngine.stop();
  };

  const handleSaveFlow = async (newFlow: CustomFlow) => {
    const saved = await saveCustomFlow(newFlow);
    if (saved) {
      setCustomFlows((prev) => [saved, ...prev.filter((f) => f.id !== saved.id)]);
      setSelectedFlow(saved.id);
      stressTestEngine.setSelectedFlow(saved.id);
    }
  };

  const handleDeleteFlow = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await deleteCustomFlow(id);
    if (ok) {
      setCustomFlows((prev) => prev.filter((f) => f.id !== id));
      if (selectedFlow === id) {
        setSelectedFlow("1");
        stressTestEngine.setSelectedFlow("1");
      }
    }
  };

  // Filtered History
  const filteredHistory = useMemo(() => {
    if (historyFilter === "load") {
      return historyRecords.filter((r) => r.testType === "load_test");
    }
    if (historyFilter === "stress") {
      return historyRecords.filter((r) => r.testType === "stress_test" || !r.testType);
    }
    return historyRecords;
  }, [historyRecords, historyFilter]);

  const loadHistoryCount = useMemo(() => historyRecords.filter((r) => r.testType === "load_test").length, [historyRecords]);
  const stressHistoryCount = useMemo(() => historyRecords.filter((r) => r.testType === "stress_test" || !r.testType).length, [historyRecords]);

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* ─── WORKSPACE HEADER BAR ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] p-3.5 sm:p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToProjectList}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition cursor-pointer border border-slate-200 dark:border-slate-700"
              title="Kembali ke pemilihan projek"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Ganti Projek</span>
            </button>
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center border border-orange-500/20 shrink-0">
              <FolderKanban className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-900 dark:text-white">
                  {activeProject.name}
                </span>
                <span
                  className={`text-[9px] font-black uppercase px-2 py-0.2 rounded border ${
                    activeProject.env === "PRODUCTION"
                      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                      : activeProject.env === "STAGING"
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                      : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                  }`}
                >
                  {activeProject.env || "DEV"}
                </span>
                <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                  • {projectServers.length} Node • {projectServices.length} Microservice
                </span>
              </div>
            </div>
          </div>

          {/* Mode Aktif Indicator */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium hidden md:inline">Mode Aktif:</span>
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 border transition-colors ${
                intensityTab === "load"
                  ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
                  : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
              }`}
            >
              {intensityTab === "load" ? (
                <Zap className="w-3.5 h-3.5 text-indigo-500" />
              ) : (
                <Activity className="w-3.5 h-3.5 text-purple-500" />
              )}
              <span>{intensityTab === "load" ? "Load Test (1x Serentak)" : "Stress Test (Ketahanan)"}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ─── 2-KOLOM STUDIO: KIRI KONTROL RINGKAS, KANAN OBSERVABILITAS TABS ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* KOLOM KIRI: Konfigurasi & Tombol Start/Stop (Above the fold, no scroll!) */}
        <div className="lg:col-span-5 space-y-3.5">
          {/* Card 1: Pilihan Skenario & Microservice */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-orange-500" />
                <span>Skenario / Service yang Diuji:</span>
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingFlow(null);
                    setIsFlowModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500 hover:text-white border border-blue-500/20 px-2.5 py-1 rounded-lg transition cursor-pointer"
                  title="Rancang alur bertingkat multi-service (misal: Login -> Service Lain)"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Rancang Alur</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsServiceTestModalOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 dark:text-orange-400 bg-orange-500/10 hover:bg-orange-500 hover:text-white border border-orange-500/20 px-2.5 py-1 rounded-lg transition cursor-pointer"
                  title="Uji cepat satu service spesifik"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Uji Service</span>
                </button>
              </div>
            </div>

            {/* Selector Skenario */}
            <div className="space-y-1.5">
              <select
                disabled={progress.isRunning}
                value={selectedFlow}
                onChange={(e) => {
                  stressTestEngine.resetToIdle();
                  setSelectedFlow(e.target.value);
                  stressTestEngine.setSelectedFlow(e.target.value);
                  setChartData([]);
                }}
                className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-orange-500/20 cursor-pointer"
              >
                <optgroup label="Skenario Alur Terpadu (Presets)">
                  <option value="1">1. Konsultasi AI Healthcare (Identity + AI Consult)</option>
                  <option value="2">2. Artikel Medis & Lifestyle (Identity + Lifestyle)</option>
                  <option value="3">3. Temu Dokter & Live Chat (Identity + Live Consult WebSocket)</option>
                </optgroup>
                {customFlows.length > 0 && (
                  <optgroup label="Skenario Service Projek (Kustom)">
                    {customFlows.map((f) => (
                      <option key={f.id} value={f.id}>
                        ⚡ {f.name} ({f.steps?.length || 0} Langkah)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              {/* Rincian Singkat Skenario Terpilih */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 border border-orange-500/20 shrink-0">
                    {activeStepsCount} Tahap
                  </span>
                  <span className="text-slate-600 dark:text-slate-300 font-medium truncate">
                    {currentFlowTitle}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={() => setIsFlowStepsModalOpen(true)}
                    className="text-orange-500 hover:text-orange-600 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Detail</span>
                  </button>
                  {activeCustomFlow && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFlow(activeCustomFlow);
                          setIsFlowModalOpen(true);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-orange-500 transition cursor-pointer"
                        title="Edit Skenario Kustom"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteFlow(activeCustomFlow.id, e)}
                        className="p-1 rounded text-slate-400 hover:text-rose-500 transition cursor-pointer"
                        title="Hapus Skenario Kustom"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Mode Pengujian: Load Test (1x Serentak) | Stress Test (Ketahanan) */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Kategori Pengujian:
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                    intensityTab === "load"
                      ? "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20"
                      : "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20"
                  }`}
                >
                  {intensityTab === "load" ? "1x Gelombang" : "Sustained Looping"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-slate-900/90 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800">
                <button
                  type="button"
                  disabled={progress.isRunning}
                  onClick={() => {
                    setIntensityTab("load");
                    localStorage.setItem("stress_test_intensity_tab", "load");
                  }}
                  className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition cursor-pointer ${
                    intensityTab === "load"
                      ? "bg-indigo-600 text-white shadow-xs font-black"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Load Test (1x Serentak)</span>
                </button>

                <button
                  type="button"
                  disabled={progress.isRunning}
                  onClick={() => {
                    setIntensityTab("stress");
                    localStorage.setItem("stress_test_intensity_tab", "stress");
                  }}
                  className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition cursor-pointer ${
                    intensityTab === "stress"
                      ? "bg-purple-600 text-white shadow-xs font-black"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Stress Test (Ketahanan)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Parameter Beban (Load Test vs Stress Test) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-orange-500" />
                <span>Beban Pasien (Virtual Users):</span>
              </span>
              <span className="text-xs font-mono font-black text-orange-600 dark:text-orange-400">
                {targetVUs} Pasien (VU)
              </span>
            </div>

            {/* Presets VU (25, 50, 100, 250, 500) */}
            <div className="grid grid-cols-5 gap-1.5">
              {[25, 50, 100, 250, 500].map((vu) => (
                <button
                  key={vu}
                  type="button"
                  disabled={progress.isRunning}
                  onClick={() => setTargetVUs(vu)}
                  className={`py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer text-center ${
                    targetVUs === vu
                      ? intensityTab === "load"
                        ? "bg-indigo-600 text-white shadow-xs font-black"
                        : "bg-purple-600 text-white shadow-xs font-black"
                      : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                  }`}
                >
                  {vu}
                </button>
              ))}
            </div>

            {/* Khusus Stress Test: Durasi & Pola */}
            {intensityTab === "stress" && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 animate-in fade-in duration-150">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-600 dark:text-slate-400">Lama Tekanan Server:</span>
                  <div className="flex items-center gap-1">
                    {[15, 30, 60].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        disabled={progress.isRunning}
                        onClick={() => setDurationSec(sec)}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition ${
                          durationSec === sec
                            ? "bg-purple-600 text-white shadow-xs"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-600 dark:text-slate-400">Pola Beban:</span>
                  <div className="flex items-center gap-1">
                    {[
                      { id: "standard", label: "Standar" },
                      { id: "spike", label: "Spike (+60%)" },
                      { id: "stepup", label: "Bertingkat" },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={progress.isRunning}
                        onClick={() => setSelectedPresetPattern(p.id as any)}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition ${
                          selectedPresetPattern === p.id
                            ? "bg-purple-600 text-white shadow-xs"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Mini Explainer Banner */}
            <div
              className={`p-2.5 rounded-xl text-[11px] leading-relaxed flex items-center gap-2 border transition-colors ${
                intensityTab === "load"
                  ? "bg-indigo-500/10 text-indigo-950 dark:text-indigo-200 border-indigo-500/20"
                  : "bg-purple-500/10 text-purple-950 dark:text-purple-200 border-purple-500/20"
              }`}
            >
              {intensityTab === "load" ? (
                <>
                  <Zap className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>
                    <strong>1x Gelombang Serentak:</strong> {targetVUs} pasien mengakses sekaligus 1 iterasi penuh.
                  </span>
                </>
              ) : (
                <>
                  <Activity className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  <span>
                    <strong>Uji Ketahanan Bertahap:</strong> Tekanan looping {totalCalculatedDuration} detik untuk deteksi breakpoint.
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Card 3: Tombol Eksekusi (Start / Stop) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] p-4 shadow-sm space-y-2.5">
            {!progress.isRunning ? (
              <button
                type="button"
                onClick={handleStart}
                className={`w-full py-3 px-4 rounded-xl text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-md cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 ${
                  intensityTab === "load"
                    ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/25 active:bg-indigo-800"
                    : "bg-purple-600 hover:bg-purple-700 shadow-purple-600/25 active:bg-purple-800"
                }`}
              >
                <Play className="w-4 h-4 fill-white" />
                <span>
                  {intensityTab === "load" ? "Mulai Load Test Serentak" : "Mulai Stress Test Ketahanan"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStop}
                className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer border border-rose-500/30 shadow-md shadow-rose-600/20 animate-pulse active:bg-rose-800"
              >
                <Square className="w-4 h-4 fill-white text-white" />
                <span>Batalkan Pengujian Sekarang</span>
              </button>
            )}

            <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span>Grafana k6 Core</span>
              </span>
              <span>
                Status SRE:{" "}
                <strong className={progress.healthGrade === "HEALTHY" ? "text-emerald-500" : "text-amber-500"}>
                  {progress.healthGrade || "HEALTHY"}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* KOLOM KANAN: Observabilitas Terpadu (Tabs: Visualizer, Latensi, Console Logs) */}
        <div className="lg:col-span-7 space-y-3.5">
          {/* Top Telemetry Cards Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] shadow-xs">
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                <span>Pasien Aktif</span>
                <Users className="w-3 h-3 text-orange-500" />
              </div>
              <div className="text-xl font-mono font-black text-slate-900 dark:text-white mt-1">
                {progress.activeVUs}
                <span className="text-[10px] text-slate-400 font-normal ml-1">/ {maxPeakVU} VU</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] shadow-xs">
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                <span>Throughput</span>
                <TrendingUp className="w-3 h-3 text-indigo-500" />
              </div>
              <div className="text-xl font-mono font-black text-slate-900 dark:text-white mt-1">
                {Math.round(progress.currentRps)}
                <span className="text-[10px] text-slate-400 font-normal ml-1">RPS</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] shadow-xs">
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                <span>P95 Latensi</span>
                <Clock className="w-3 h-3 text-amber-500" />
              </div>
              <div className="text-xl font-mono font-black text-slate-900 dark:text-white mt-1">
                {progress.p95LatencyMs}
                <span className="text-[10px] text-slate-400 font-normal ml-1">ms</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] shadow-xs">
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                <span>Tingkat Sukses</span>
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              </div>
              <div className="text-xl font-mono font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {(100 - progress.errorRatePercent).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Tab Observabilitas */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] shadow-sm overflow-hidden flex flex-col">
            {/* Header Tabs Navigation */}
            <div className="px-4 py-2.5 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setObservabilityTab("pipeline")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    observabilityTab === "pipeline"
                      ? "bg-orange-500 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Visualizer Alur</span>
                </button>

                <button
                  type="button"
                  onClick={() => setObservabilityTab("chart")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    observabilityTab === "chart"
                      ? "bg-orange-500 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Grafik Latensi</span>
                </button>

                <button
                  type="button"
                  onClick={() => setObservabilityTab("logs")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    observabilityTab === "logs"
                      ? "bg-orange-500 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Console Log k6</span>
                  {logs.length > 0 && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </button>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    progress.isRunning ? "bg-orange-500 animate-ping" : "bg-slate-400"
                  }`}
                />
                <span className="text-[11px] font-mono font-bold text-slate-500 uppercase">
                  {progress.isRunning ? "RUNNING" : "IDLE"}
                </span>
              </div>
            </div>

            {/* Tab Body Content */}
            <div className="p-4 min-h-[300px] flex flex-col justify-center">
              {observabilityTab === "pipeline" && (
                <div className="w-full">
                  <LivePatientPipeline
                    isRunning={progress.isRunning}
                    isFinished={!progress.isRunning && progress.totalRequests > 0}
                    selectedFlow={progress.selectedFlow || selectedFlow}
                    flowTitle={currentFlowTitle}
                    testType={intensityTab === "load" ? "load_test" : "stress_test"}
                    activeVUs={progress.activeVUs}
                    targetVUs={maxPeakVU}
                    elapsedSec={progress.elapsedSec}
                    totalRequests={progress.totalRequests}
                    currentRps={progress.currentRps}
                    p95LatencyMs={progress.p95LatencyMs}
                    errorRatePercent={progress.errorRatePercent}
                    healthGrade={progress.healthGrade}
                    checks={progress.checks}
                    logs={logs}
                    customFlow={activeCustomFlow}
                    projectServers={projectServers}
                  />
                </div>
              )}

              {observabilityTab === "chart" && (
                <div className="w-full space-y-2">
                  <div className="h-56 w-full">
                    {chartData.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                        <TrendingUp className="w-8 h-8 opacity-40 mb-1" />
                        <span>Data grafik akan muncul otomatis saat pengujian berjalan</span>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <ReLineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                          <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 10 }} />
                          <YAxis tick={{ fill: "#64748b", fontSize: 10 }} unit="ms" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#0f172a",
                              borderColor: "#334155",
                              fontSize: "12px",
                              borderRadius: "8px",
                            }}
                          />
                          <ReferenceLine y={1000} stroke="#e11d48" strokeDasharray="3 3" label={{ value: "SLA (1s)", fill: "#e11d48", fontSize: 10 }} />
                          <Line type="monotone" dataKey="p95" stroke="#f97316" strokeWidth={2.5} dot={false} isAnimationActive={false} name="P95 Latency" />
                        </ReLineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              )}

              {observabilityTab === "logs" && (
                <div className="h-56 w-full rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-slate-300 overflow-y-auto space-y-1 border border-slate-800 custom-scrollbar">
                  {logs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500">
                      <Terminal className="w-6 h-6 opacity-30 mb-1" />
                      <span>Belum ada log stream dari engine k6</span>
                    </div>
                  ) : (
                    logs.map((line, idx) => (
                      <div key={idx} className="leading-relaxed whitespace-pre-wrap break-all">
                        {line}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── AI CAPACITY & RELIABILITY INSIGHT CARD ─── */}
      <AiStressInsightCard
        records={historyRecords}
        projectName={activeProject?.name}
        projectId={activeProject?.id}
        onOpenRecordModal={(rec) => {
          setActiveModalRecord(rec);
          setIsModalOpen(true);
        }}
      />

      {/* ─── RIWAYAT PENGUJIAN: FIXED HEIGHT MAX-H-72 DENGAN INTERNAL SCROLL ─── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111622] p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-500" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Riwayat Hasil Pengujian Beban
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {historyRecords.length} Record
            </span>
          </div>

          {/* Filter Kategori: Semua | Load Test | Stress Test */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setHistoryFilter("all")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                historyFilter === "all"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
              }`}
            >
              Semua ({historyRecords.length})
            </button>
            <button
              type="button"
              onClick={() => setHistoryFilter("load")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 border ${
                historyFilter === "load"
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                  : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20"
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Load Test</span>
              <span>({loadHistoryCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setHistoryFilter("stress")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 border ${
                historyFilter === "stress"
                  ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                  : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 hover:bg-purple-500/20"
              }`}
            >
              <Activity className="w-3 h-3" />
              <span>Stress Test</span>
              <span>({stressHistoryCount})</span>
            </button>

            {historyRecords.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Hapus seluruh catatan riwayat pengujian?")) {
                    clearStressTestHistory();
                    setHistoryRecords([]);
                  }
                }}
                className="ml-2 text-slate-400 hover:text-rose-500 text-[11px] font-medium transition cursor-pointer"
                title="Hapus riwayat"
              >
                Hapus
              </button>
            )}
          </div>
        </div>

        {/* Container Tabel dengan max-h-72 agar halaman tidak memanjang ke bawah */}
        <div className="max-h-72 overflow-y-auto custom-scrollbar border border-slate-100 dark:border-slate-800/80 rounded-xl">
          {filteredHistory.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              Belum ada data riwayat untuk filter kategori ini.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900/90 backdrop-blur-xs text-[10px] uppercase font-black tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800 z-10">
                <tr>
                  <th className="py-2 px-3">Waktu &amp; Kategori</th>
                  <th className="py-2 px-3">Skenario</th>
                  <th className="py-2 px-3">Beban (VU)</th>
                  <th className="py-2 px-3">Throughput</th>
                  <th className="py-2 px-3">P95 Latensi</th>
                  <th className="py-2 px-3">Error Rate</th>
                  <th className="py-2 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredHistory.map((rec) => {
                  const isLoad = rec.testType === "load_test";
                  return (
                    <tr
                      key={rec.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition cursor-pointer"
                      onClick={() => {
                        const matchedCustom = customFlows.find(
                          (f) => f.id === rec.selectedFlow || f.name === rec.flowTitle || (rec.flowTitle && f.name && rec.flowTitle.includes(f.name))
                        );
                        const enrichedRecord = {
                          ...rec,
                          customSteps: rec.customSteps || matchedCustom?.steps,
                        };
                        setActiveModalRecord(enrichedRecord);
                        setIsModalOpen(true);
                      }}
                    >
                      <td className="py-2 px-3">
                        <div className="font-mono text-[11px] text-slate-900 dark:text-white">
                          {rec.timestamp}
                        </div>
                        <span
                          className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded mt-0.5 border ${
                            isLoad
                              ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
                              : "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20"
                          }`}
                        >
                          {isLoad ? "⚡ Load Test (Serentak)" : "🔥 Stress Test (Ketahanan)"}
                        </span>
                      </td>
                      <td className="py-2 px-3 max-w-[180px] truncate text-slate-700 dark:text-slate-300">
                        {rec.flowTitle}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-800 dark:text-slate-200">
                        {rec.targetVUs} VU
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-800 dark:text-slate-200">
                        {Math.round(rec.currentRps)} RPS
                      </td>
                      <td className="py-2 px-3 font-mono">
                        <span
                          className={
                            rec.p95LatencyMs > 1000
                              ? "text-rose-500 font-bold"
                              : "text-emerald-500 font-bold"
                          }
                        >
                          {rec.p95LatencyMs} ms
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono">
                        <span
                          className={
                            rec.errorRatePercent > 0
                              ? "text-rose-500 font-bold"
                              : "text-emerald-500"
                          }
                        >
                          {rec.errorRatePercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const matchedCustom = customFlows.find(
                              (f) => f.id === rec.selectedFlow || f.name === rec.flowTitle || (rec.flowTitle && f.name && rec.flowTitle.includes(f.name))
                            );
                            const enrichedRecord = {
                              ...rec,
                              customSteps: rec.customSteps || matchedCustom?.steps,
                            };
                            setActiveModalRecord(enrichedRecord);
                            setIsModalOpen(true);
                          }}
                          className="px-2 py-1 rounded bg-orange-500/10 hover:bg-orange-500 hover:text-white text-orange-600 dark:text-orange-400 text-[11px] font-bold transition cursor-pointer"
                        >
                          Laporan
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ─── MODAL DETAIL HASIL PENGUJIAN ─────────────────────────────── */}
      {isModalOpen && activeModalRecord && (
        <StressTestResultModal
          isOpen={isModalOpen}
          record={activeModalRecord}
          onClose={() => {
            setIsModalOpen(false);
            setActiveModalRecord(null);
          }}
        />
      )}

      {/* ─── MODAL SERVICE TEST CREATOR ──────────────────────────────── */}
      {isServiceTestModalOpen && (
        <ServiceTestCreatorModal
          isOpen={isServiceTestModalOpen}
          onClose={() => setIsServiceTestModalOpen(false)}
          projectId={activeProject.id}
          projectName={activeProject.name}
          services={projectServices}
          onSaveFlow={handleSaveFlow}
        />
      )}

      {/* ─── MODAL EDIT CUSTOM FLOW EXISTING ─────────────────────────── */}
      {isFlowModalOpen && (
        <CustomFlowModal
          isOpen={isFlowModalOpen}
          onClose={() => {
            setIsFlowModalOpen(false);
            setEditingFlow(null);
          }}
          onSaveFlow={handleSaveFlow}
          initialFlow={editingFlow}
          projectId={activeProject.id}
          projectName={activeProject.name}
          services={projectServices}
        />
      )}

      {/* ─── MODAL RINCIAN TAHAP ALUR ─────────────────────────────────── */}
      {isFlowStepsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-white dark:bg-[#0B0F19] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center font-bold">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    Detail Alur &amp; Target Endpoint
                  </h4>
                  <p className="text-[11px] text-slate-400">{currentFlowTitle} ({activeStepsCount} Langkah)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFlowStepsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto custom-scrollbar pr-1">
              {activeFlowStepDetails.map((st) => (
                <div
                  key={st.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-orange-500/15 text-orange-600 text-[10px] flex items-center justify-center font-black">
                        {st.id}
                      </span>
                      {st.name}
                    </span>
                    <span
                      className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded font-mono ${
                        st.method === "POST"
                          ? "bg-blue-500/15 text-blue-600"
                          : st.method === "GET"
                          ? "bg-emerald-500/15 text-emerald-600"
                          : st.method === "WS"
                          ? "bg-purple-500/15 text-purple-600"
                          : "bg-amber-500/15 text-amber-600"
                      }`}
                    >
                      {st.method}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-slate-400 bg-white dark:bg-slate-950 p-1.5 rounded border border-slate-100 dark:border-slate-800 truncate">
                    {st.path}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                    <span>{st.desc}</span>
                    <span className="font-mono text-orange-500 font-semibold">{st.server}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsFlowStepsModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-bold transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
