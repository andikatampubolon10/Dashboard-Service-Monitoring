import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Key,
  ShieldCheck,
  Globe,
  Layers,
  Sparkles,
  CheckCircle2,
  Server as ServerIcon,
  ArrowRight,
  Copy,
  ChevronRight,
  AlertCircle,
  Activity,
} from 'lucide-react';
import { CustomFlow, CustomFlowStep, CustomFlowAuthConfig } from '../../services/stressTestEngine';
import { Service } from '../../types';

interface CustomFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  services: Service[];
  initialFlow?: CustomFlow | null;
  onSaveFlow: (flow: CustomFlow) => Promise<void>;
}

export interface EndpointItem {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  name: string;
  desc: string;
  body?: any;
  expectedStatus?: number;
}

// ─── DEFAULT FALLBACK SERVICES JIKA LIST SEDANG DI-FETCH ────────────────────
export const DEFAULT_PROJECT_SERVICES: Service[] = [
  {
    id: 'identity-service-node-34-101-207-115',
    name: 'Identity Service',
    description: 'Autentikasi akun, SSO JWT & verifikasi BPJS',
    url: 'http://34.101.207.115:8080',
    status: 'healthy',
    rawStatus: 'UP',
    serverId: 'server-node-34-101-207-115',
    category: 'identity',
    throughputRps: 0,
    errorCount: 0,
    errorRatePercent: 0,
    latencyP50Ms: 0,
    latencyP90Ms: 0,
    latencyP95Ms: 0,
    latencyP99Ms: 0,
    uptimePercent: 100,
    instancesCount: 1,
  },
  {
    id: 'ai-consultation-service-node-34-101-122-171',
    name: 'AI Consultation Service',
    description: 'Konsultasi dokter AI & LLM inferensi kesehatan',
    url: 'http://34.101.122.171:4006',
    status: 'healthy',
    rawStatus: 'UP',
    serverId: 'server-node-34-101-122-171',
    category: 'core',
    throughputRps: 0,
    errorCount: 0,
    errorRatePercent: 0,
    latencyP50Ms: 0,
    latencyP90Ms: 0,
    latencyP95Ms: 0,
    latencyP99Ms: 0,
    uptimePercent: 100,
    instancesCount: 1,
  },
  {
    id: 'lifestyle-service-node-34-101-207-115',
    name: 'Lifestyle Service',
    description: 'Edukasi medis, artikel kesehatan & aktivitas fisik',
    url: 'http://34.101.207.115:4005',
    status: 'healthy',
    rawStatus: 'UP',
    serverId: 'server-node-34-101-207-115',
    category: 'core',
    throughputRps: 0,
    errorCount: 0,
    errorRatePercent: 0,
    latencyP50Ms: 0,
    latencyP90Ms: 0,
    latencyP95Ms: 0,
    latencyP99Ms: 0,
    uptimePercent: 100,
    instancesCount: 1,
  },
  {
    id: 'liveconsult-app-dev-node-34-101-207-115',
    name: 'Live Consult Service',
    description: 'Booking dokter spesialis & temu antrean video (Golang)',
    url: 'http://34.101.207.115:4004',
    status: 'healthy',
    rawStatus: 'UP',
    serverId: 'server-node-34-101-207-115',
    category: 'core',
    throughputRps: 0,
    errorCount: 0,
    errorRatePercent: 0,
    latencyP50Ms: 0,
    latencyP90Ms: 0,
    latencyP95Ms: 0,
    latencyP99Ms: 0,
    uptimePercent: 100,
    instancesCount: 1,
  },
  {
    id: 'health-profile-service-node-34-101-207-115',
    name: 'Health Profile Service',
    description: 'Profil medis, tanda vital pasien & PIN rekam medis',
    url: 'http://34.101.207.115:3001',
    status: 'healthy',
    rawStatus: 'UP',
    serverId: 'server-node-34-101-207-115',
    category: 'core',
    throughputRps: 0,
    errorCount: 0,
    errorRatePercent: 0,
    latencyP50Ms: 0,
    latencyP90Ms: 0,
    latencyP95Ms: 0,
    latencyP99Ms: 0,
    uptimePercent: 100,
    instancesCount: 1,
  },
  {
    id: 'medical-record-service-node-34-101-122-171',
    name: 'Medical Record Service',
    description: 'Resume klinis, riwayat diagnosa & arsip rekam medis',
    url: 'http://34.101.122.171:3002',
    status: 'healthy',
    rawStatus: 'UP',
    serverId: 'server-node-34-101-122-171',
    category: 'storage',
    throughputRps: 0,
    errorCount: 0,
    errorRatePercent: 0,
    latencyP50Ms: 0,
    latencyP90Ms: 0,
    latencyP95Ms: 0,
    latencyP99Ms: 0,
    uptimePercent: 100,
    instancesCount: 1,
  },
];

// ─── KATALOG ENDPOINT LENGKAP REAL PER MICROSERVICE ────────────────────────
export const SERVICE_ENDPOINTS_CATALOG: Record<string, EndpointItem[]> = {
  'identity': [
    {
      method: 'POST',
      path: '/api/v1/auth/login',
      name: 'Login Pasien & Terbitkan JWT',
      desc: 'Otentikasi kredensial email/password dan terbitkan JWT access_token',
      body: { email: 'patient@tara.health', password: 'Password123!' },
      expectedStatus: 200,
    },
    {
      method: 'POST',
      path: '/api/v1/auth/register',
      name: 'Registrasi Akun Pasien Baru',
      desc: 'Pendaftaran user pasien baru ke database Identity',
      body: { name: 'Pasien Uji', email: 'test.patient@tara.health', password: 'Password123!' },
      expectedStatus: 201,
    },
    {
      method: 'POST',
      path: '/api/v1/auth/refresh',
      name: 'Refresh Token JWT',
      desc: 'Perbarui masa aktif JWT access_token pasien',
      body: { refresh_token: 'jwt_refresh_token_sample' },
      expectedStatus: 200,
    },
    {
      method: 'POST',
      path: '/api/v1/auth/logout',
      name: 'Logout Sesi Pasien',
      desc: 'Cabut otorisasi token sesi pasien saat ini',
      expectedStatus: 200,
    },
    {
      method: 'GET',
      path: '/health',
      name: 'Health Check Probe',
      desc: 'Pemeriksaan status liveness & readiness identity microservice',
      expectedStatus: 200,
    },
    {
      method: 'GET',
      path: '/metrics',
      name: 'Prometheus Metrics',
      desc: 'Metrik kinerja internal runtime server',
      expectedStatus: 200,
    },
  ],

  'ai-consultation': [
    {
      method: 'GET',
      path: '/api/consultations/active',
      name: 'Cek Sesi Konsultasi Aktif',
      desc: 'Ambil sesi konsultasi pasien yang sedang aktif berjalan',
      expectedStatus: 200,
    },
    {
      method: 'POST',
      path: '/api/consultations',
      name: 'Inisiasi Sesi Konsultasi Baru',
      desc: 'Membuka tiket sesi konsultasi dokter AI baru',
      body: { category: 'HEALTH_CARE', mode: 'HEALTH_CARE', title: 'Konsultasi Keluhan Gejala Pasien' },
      expectedStatus: 201,
    },
    {
      method: 'POST',
      path: '/api/consultation/chat',
      name: 'Kirim Chat Gejala & Streaming AI',
      desc: 'Kirim keluhan pasien dan picu inferensi streaming LLM dokter AI',
      body: {
        category: 'HEALTH_CARE',
        mode: 'HEALTH_CARE',
        language: 'id',
        messages: [{ role: 'user', content: 'Halo dokter AI, saya merasa demam dan sakit kepala sejak kemarin.' }],
      },
      expectedStatus: 200,
    },
    {
      method: 'GET',
      path: '/api/consultations',
      name: 'Riwayat Sesi Konsultasi Pasien',
      desc: 'Mengambil riwayat seluruh sesi konsultasi pasien terdahulu',
      expectedStatus: 200,
    },
    {
      method: 'GET',
      path: '/health/live',
      name: 'Health Check AI Service (Liveness)',
      desc: 'Pemeriksaan status hidup runtime Fastify AI service',
      expectedStatus: 200,
    },
  ],

  'lifestyle': [
    {
      method: 'GET',
      path: '/api/articles',
      name: 'Katalog Artikel Kesehatan',
      desc: 'Ambil daftar artikel edukasi medis (paginasi artikel)',
      expectedStatus: 200,
    },
    {
      method: 'GET',
      path: '/api/articles/8-efek-begadang-yang-buruk-untuk-kesehatan',
      name: 'Baca Isi Lengkap Artikel Medis',
      desc: 'Mengambil konten lengkap artikel medis spesifik',
      expectedStatus: 200,
    },
    {
      method: 'GET',
      path: '/api/articles?limit=5&page=1',
      name: 'Navigasi Paginasi Artikel',
      desc: 'Memuat artikel kesehatan terbaru dengan limit & page',
      expectedStatus: 200,
    },
    {
      method: 'GET',
      path: '/api/exercises',
      name: 'Katalog Panduan Latihan Fisik',
      desc: 'Daftar gerakan latihan kebugaran dan kardio',
      expectedStatus: 200,
    },
    {
      method: 'POST',
      path: '/api/completions',
      name: 'Catat Log Latihan Selesai',
      desc: 'Mencatat sesi olahraga yang telah diselesaikan pasien',
      body: { exerciseId: 1, durationMinutes: 20, caloriesBurned: 120 },
      expectedStatus: 200,
    },
    {
      method: 'GET',
      path: '/livez',
      name: 'Health Probe Lifestyle (Liveness)',
      desc: 'Pemeriksaan status service artikel dan latihan',
      expectedStatus: 200,
    },
  ],

  'live-consult': [
    {
      method: 'GET',
      path: '/api/live-consult',
      name: 'Cek Antrean Sesi Konsultasi Dokter',
      desc: 'Mengambil antrean dan riwayat sesi konsultasi dokter langsung',
      expectedStatus: 200,
    },
    {
      method: 'POST',
      path: '/api/live-consult',
      name: 'Reservasi Ruang Temu Dokter Spesialis',
      desc: 'Booking dan mulai sesi konsultasi langsung dokter spesialis',
      body: {
        doctorId: 'doc-sp-01',
        doctorName: 'dr. Budi Santoso, Sp.PD',
        specialty: 'Spesialis Penyakit Dalam',
        hospital: 'RSUP Cipto Mangunkusumo',
        avatarColor: '#3B82F6',
        categoryKey: 'internal-medicine',
        price: '0',
        paymentMethod: 'BPJS',
      },
      expectedStatus: 200,
    },
    {
      method: 'GET',
      path: '/api/live-consult/{{sessionId}}',
      name: 'Ambil Status Sesi Ruangan Dokter',
      desc: 'Cek detail status sesi ruangan temu dokter yang sedang berlangsung',
      expectedStatus: 200,
    },
    {
      method: 'GET',
      path: '/health/live',
      name: 'Health Probe Live Consult (Liveness)',
      desc: 'Pemeriksaan status backend Golang live consult',
      expectedStatus: 200,
    },
  ],

  'health-profile': [
    {
      method: 'GET',
      path: '/api/v1/profile',
      name: 'Ambil Ringkasan Profil Pasien',
      desc: 'Mengambil profil medis, golongan darah, dan identitas pasien',
      expectedStatus: 200,
    },
    {
      method: 'GET',
      path: '/api/health/profile',
      name: 'Profil Wellness & BMI Pasien',
      desc: 'Mengambil data gaya hidup, BMI, dan riwayat kesehatan dasar',
      expectedStatus: 200,
    },
    {
      method: 'PUT',
      path: '/api/health/profile',
      name: 'Perbarui Profil Wellness',
      desc: 'Simpan pembaruan berat badan, tinggi, dan preferensi kesehatan',
      body: { height: 172, weight: 65, sleepQuality: 'good' },
      expectedStatus: 200,
    },
    {
      method: 'POST',
      path: '/api/v1/pin/verify',
      name: 'Verifikasi PIN Rekam Medis',
      desc: 'Validasi PIN pasien sebelum membuka data rekam medis sensitif',
      body: { pin: '123456' },
      expectedStatus: 200,
    },
    {
      method: 'GET',
      path: '/health',
      name: 'Health Check Health Profile',
      desc: 'Pemeriksaan kesiapan service data profil pasien',
      expectedStatus: 200,
    },
  ],

  'medical-record': [
    {
      method: 'GET',
      path: '/api/records',
      name: 'Daftar Rekam Medis Pasien',
      desc: 'Mengambil riwayat rekam medis, hasil lab, dan resep pasien',
      expectedStatus: 200,
    },
    {
      method: 'POST',
      path: '/api/records',
      name: 'Simpan Catatan Rekam Medis Baru',
      desc: 'Mencatat diagnosis klinis baru dan resume medis pasien',
      body: {
        type: 'LAB_RESULT',
        title: 'Pemeriksaan Darah Rutin Pasien',
        date: '2026-09-23',
        notes: 'Hasil pemeriksaan lab darah dalam batas normal',
      },
      expectedStatus: 201,
    },
    {
      method: 'GET',
      path: '/health',
      name: 'Health Probe Medical Record',
      desc: 'Pemeriksaan status service rekam medis',
      expectedStatus: 200,
    },
  ],

  'audit': [
    {
      method: 'GET',
      path: '/api/v1/audit/logs',
      name: 'Audit Trail Logs',
      desc: 'Mengambil catatan audit trail aktivitas transaksi pasien',
      expectedStatus: 200,
    },
    {
      method: 'GET',
      path: '/health',
      name: 'Health Check Audit Service',
      desc: 'Pemeriksaan kesiapan service pencatatan audit trail',
      expectedStatus: 200,
    },
  ],
};

// Helper: Normalisasi ID atau nama service ke kunci katalog
export function getEndpointsForService(serviceIdOrName: string): EndpointItem[] {
  const s = (serviceIdOrName || '').toLowerCase();
  if (s.includes('ai') || s.includes('consultation')) return SERVICE_ENDPOINTS_CATALOG['ai-consultation'] || [];
  if (s.includes('identity') || s.includes('auth')) return SERVICE_ENDPOINTS_CATALOG['identity'] || [];
  if (s.includes('lifestyle')) return SERVICE_ENDPOINTS_CATALOG['lifestyle'] || [];
  if (s.includes('live')) return SERVICE_ENDPOINTS_CATALOG['live-consult'] || [];
  if (s.includes('profile')) return SERVICE_ENDPOINTS_CATALOG['health-profile'] || [];
  if (s.includes('medical') || s.includes('record')) return SERVICE_ENDPOINTS_CATALOG['medical-record'] || [];
  if (s.includes('audit')) return SERVICE_ENDPOINTS_CATALOG['audit'] || [];

  return [
    { method: 'GET', path: '/health', name: 'Health Check Probe', desc: 'Pemeriksaan status kesehatan service', expectedStatus: 200 },
    { method: 'GET', path: '/api/status', name: 'Status API Service', desc: 'Status umum endpoint service', expectedStatus: 200 },
  ];
}

// Helper warna Method HTTP
function getMethodBadgeColor(method: string) {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
    case 'POST':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    case 'PUT':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
    case 'PATCH':
      return 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30';
    case 'DELETE':
      return 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30';
    default:
      return 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30';
  }
}

export const CustomFlowModal: React.FC<CustomFlowModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  services,
  initialFlow,
  onSaveFlow,
}) => {
  // Fallback services
  const effectiveServices = services && services.length > 0 ? services : DEFAULT_PROJECT_SERVICES;

  // Filter Service UP / Running saja
  const [onlyShowUpServices, setOnlyShowUpServices] = useState<boolean>(true);

  const isServiceUp = (s: Service) => {
    const status = (s.rawStatus || s.status || '').toLowerCase();
    return status === 'up' || status === 'healthy' || status === 'warning';
  };

  const runningServices = useMemo(() => {
    return effectiveServices.filter(isServiceUp);
  }, [effectiveServices]);

  const selectableServices = useMemo(() => {
    if (onlyShowUpServices && runningServices.length > 0) {
      return runningServices;
    }
    return effectiveServices;
  }, [onlyShowUpServices, runningServices, effectiveServices]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Mode Autentikasi
  const [authType, setAuthType] = useState<'identity' | 'custom' | 'apiKey' | 'none'>('none');
  const [customLoginUrl, setCustomLoginUrl] = useState('');
  const [customLoginPayload, setCustomLoginPayload] = useState('{\n  "email": "patient@tara.health",\n  "password": "Password123!"\n}');
  const [customTokenField, setCustomTokenField] = useState('data.access_token');
  const [apiKeyHeader, setApiKeyHeader] = useState('X-API-KEY');
  const [apiKeyValue, setApiKeyValue] = useState('');

  const [steps, setSteps] = useState<CustomFlowStep[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Inisialisasi data
  useEffect(() => {
    if (isOpen) {
      if (initialFlow) {
        setName(initialFlow.name || '');
        setDescription(initialFlow.description || '');
        setAuthType(initialFlow.authConfig?.type || 'none');
        setCustomLoginUrl(initialFlow.authConfig?.loginUrl || '');
        setCustomLoginPayload(initialFlow.authConfig?.loginPayload || '{\n  "email": "patient@tara.health",\n  "password": "Password123!"\n}');
        setCustomTokenField(initialFlow.authConfig?.tokenField || 'data.access_token');
        setApiKeyHeader(initialFlow.authConfig?.headerName || 'X-API-KEY');
        setApiKeyValue(initialFlow.authConfig?.apiKeyValue || '');
        if (initialFlow.steps && initialFlow.steps.length > 0) {
          setSteps(
            initialFlow.steps.map((st) => ({
              ...st,
              body: typeof st.body === 'object' ? JSON.stringify(st.body, null, 2) : st.body,
            }))
          );
        }
      } else {
        setName('');
        setDescription('');
        setAuthType('none');
        setCustomLoginUrl('');
        setCustomLoginPayload('{\n  "email": "patient@tara.health",\n  "password": "Password123!"\n}');
        setCustomTokenField('data.access_token');
        setApiKeyHeader('X-API-KEY');
        setApiKeyValue('');

        // Step 1 bawaan
        const initialSvc = selectableServices[0] || effectiveServices[0];
        const initialEps = getEndpointsForService(initialSvc?.id || 'identity');
        const firstDefaultEp = initialEps[0] || { method: 'GET', path: '/health', name: 'Cek Status Layanan', expectedStatus: 200 };
        setSteps([
          {
            id: 'step-1',
            name: firstDefaultEp.name,
            serviceKey: initialSvc?.id || 'identity',
            method: firstDefaultEp.method,
            path: firstDefaultEp.path,
            url: initialSvc?.url ? `${initialSvc.url.replace(/\/$/, '')}${firstDefaultEp.path}` : undefined,
            body: firstDefaultEp.body ? JSON.stringify(firstDefaultEp.body, null, 2) : undefined,
            expectedStatus: firstDefaultEp.expectedStatus || 200,
          },
        ]);
      }
      setErrorMsg(null);
    }
  }, [isOpen, initialFlow]);

  if (!isOpen) return null;

  // Tambah Langkah Baru
  const handleAddStep = () => {
    const newIdx = steps.length + 1;
    // Coba pilih service berikutnya secara rotasi agar bervariasi jika multi-service
    const svcIndex = (newIdx - 1) % selectableServices.length;
    const targetSvc = selectableServices[svcIndex] || selectableServices[0] || effectiveServices[0];
    const eps = getEndpointsForService(targetSvc?.id || 'identity');
    const chosenEp = eps[0] || { method: 'GET', path: '/health', name: `Langkah ${newIdx}: Permintaan HTTP`, expectedStatus: 200 };

    setSteps([
      ...steps,
      {
        id: `step-${Date.now()}-${newIdx}`,
        name: chosenEp.name,
        serviceKey: targetSvc?.id || 'identity',
        method: chosenEp.method,
        path: chosenEp.path,
        url: targetSvc?.url ? `${targetSvc.url.replace(/\/$/, '')}${chosenEp.path}` : undefined,
        body: chosenEp.body ? JSON.stringify(chosenEp.body, null, 2) : undefined,
        expectedStatus: chosenEp.expectedStatus || 200,
      },
    ]);
  };

  // Duplikat Langkah
  const handleDuplicateStep = (idx: number) => {
    const orig = steps[idx];
    const duplicated: CustomFlowStep = {
      ...orig,
      id: `step-${Date.now()}-${steps.length + 1}`,
      name: `${orig.name} (Salinan)`,
    };
    const updated = [...steps];
    updated.splice(idx + 1, 0, duplicated);
    setSteps(updated);
  };

  // Hapus Langkah
  const handleRemoveStep = (idx: number) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, i) => i !== idx));
  };

  // Ubah Field Langkah
  const handleStepChange = (idx: number, field: keyof CustomFlowStep, value: any) => {
    const updated = [...steps];
    updated[idx] = { ...updated[idx], [field]: value };

    // Jika serviceKey berubah: otomatis update URL dan reset endpoint ke endpoint pertama service baru!
    if (field === 'serviceKey') {
      const targetSvc = selectableServices.find((s) => s.id === value) || effectiveServices.find((s) => s.id === value) || effectiveServices[0];
      const eps = getEndpointsForService(targetSvc?.id || value || '');
      if (eps.length > 0) {
        const firstEp = eps[0];
        updated[idx].name = firstEp.name;
        updated[idx].method = firstEp.method;
        updated[idx].path = firstEp.path;
        updated[idx].expectedStatus = firstEp.expectedStatus || 200;
        updated[idx].body = firstEp.body ? JSON.stringify(firstEp.body, null, 2) : undefined;
        if (targetSvc?.url) {
          updated[idx].url = `${targetSvc.url.replace(/\/$/, '')}${firstEp.path}`;
        }
      }
    } else if (field === 'path') {
      const targetSvc = selectableServices.find((s) => s.id === updated[idx].serviceKey) || effectiveServices.find((s) => s.id === updated[idx].serviceKey) || effectiveServices[0];
      if (targetSvc?.url) {
        const cleanPath = (value || '').startsWith('/') ? value : `/${value}`;
        updated[idx].url = `${targetSvc.url.replace(/\/$/, '')}${cleanPath}`;
      }
    }

    setSteps(updated);
  };

  // Pilih Endpoint dari Katalog
  const handleApplyPresetEndpoint = (idx: number, endpoint: EndpointItem) => {
    const updated = [...steps];
    const targetSvc = selectableServices.find((s) => s.id === updated[idx].serviceKey) || effectiveServices.find((s) => s.id === updated[idx].serviceKey) || effectiveServices[0];
    const fullUrl = targetSvc?.url ? `${targetSvc.url.replace(/\/$/, '')}${endpoint.path}` : undefined;

    updated[idx] = {
      ...updated[idx],
      name: endpoint.name,
      method: endpoint.method,
      path: endpoint.path,
      url: fullUrl,
      expectedStatus: endpoint.expectedStatus || 200,
      body: endpoint.body ? JSON.stringify(endpoint.body, null, 2) : undefined,
    };
    setSteps(updated);
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Nama Alur (Flow) wajib diisi.');
      return;
    }
    if (steps.length === 0) {
      setErrorMsg('Minimal harus ada 1 langkah transaksi.');
      return;
    }

    // Validasi format JSON body
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.body && typeof s.body === 'string' && s.body.trim()) {
        try {
          JSON.parse(s.body);
        } catch {
          setErrorMsg(`Format JSON pada Langkah ${i + 1} (${s.name}) tidak valid.`);
          return;
        }
      }
    }

    const authConfig: CustomFlowAuthConfig = {
      type: authType,
      loginUrl: authType === 'custom' ? customLoginUrl : undefined,
      loginPayload: authType === 'custom' ? customLoginPayload : undefined,
      tokenField: authType === 'custom' ? customTokenField : undefined,
      headerName: authType === 'apiKey' ? apiKeyHeader : undefined,
      apiKeyValue: authType === 'apiKey' ? apiKeyValue : undefined,
    };

    const newFlow: CustomFlow = {
      id: initialFlow?.id || `flow-custom-${Date.now()}`,
      projectId,
      name: name.trim(),
      description: description.trim() || `Alur pengujian transaksi mandiri untuk ${projectName}`,
      authConfig,
      steps: steps.map((s, idx) => ({
        ...s,
        id: s.id || `step-${idx + 1}`,
        expectedStatus: s.expectedStatus || 200,
        body: s.body && typeof s.body === 'string' && s.body.trim() ? JSON.parse(s.body) : s.body,
      })),
      createdAt: initialFlow?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setIsSaving(true);
    setErrorMsg(null);
    try {
      await onSaveFlow(newFlow);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan custom flow.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center border border-orange-500/20 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                  FLOW BUILDER STUDIO
                </span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Project: <strong className="text-orange-600 dark:text-orange-400">{projectName}</strong>
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-0.5">
                {initialFlow ? `Edit Alur Pengujian: ${initialFlow.name}` : 'Buat Skenario Stress Test Baru'}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* BAGIAN 1: IDENTITAS ALUR (FLOW) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-extrabold shadow-xs">
                1
              </span>
              <span>Identitas &amp; Deskripsi Skenario Stress Test</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Nama Skenario Flow <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pasien Baru Konsultasi AI & Simpan Rekam Medis"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Deskripsi Singkat Pengujian
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Menguji ketahanan beban saat 50 pasien bersamaan chat dengan AI"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* BAGIAN 2: PENGATURAN AUTENTIKASI (OPSIONAL / LOGIN BEBAS) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-extrabold shadow-xs">
                  2
                </span>
                <Key className="w-4 h-4 text-orange-500" />
                <span>Metode Autentikasi / Sesi Pengguna</span>
              </div>
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Fleksibel &amp; Dinamis
              </span>
            </div>

            {/* Banner Penjelasan Sesi Token Dinamis */}
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <strong>Fitur Token Dinamis:</strong> Anda dapat menguji endpoint publik secara langsung tanpa login, atau memasukkan langkah <em>Login Pasien</em> di urutan langkah mana saja. Token JWT dari respon login akan otomatis disematkan sebagai header <code>Authorization: Bearer &lt;token&gt;</code> ke langkah-langkah berikutnya.
              </div>
            </div>

            {/* Pilihan Metode Autentikasi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                  authType === 'none'
                    ? 'bg-orange-500/10 border-orange-500 text-orange-950 dark:text-orange-200 ring-2 ring-orange-500/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="authType"
                  value="none"
                  checked={authType === 'none'}
                  onChange={() => setAuthType('none')}
                  className="mt-0.5 text-orange-500 focus:ring-orange-500"
                />
                <div>
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Tanpa Login Awal (Rekomendasi)</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    Bebas menentukan endpoint publik atau menyisipkan login di langkah yang diinginkan.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                  authType === 'identity'
                    ? 'bg-orange-500/10 border-orange-500 text-orange-950 dark:text-orange-200 ring-2 ring-orange-500/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="authType"
                  value="identity"
                  checked={authType === 'identity'}
                  onChange={() => setAuthType('identity')}
                  className="mt-0.5 text-orange-500 focus:ring-orange-500"
                />
                <div>
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                    <span>Auto-Login Identity SSO</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    k6 login otomatis sebelum langkah 1 dan menyematkan JWT ke semua langkah.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                  authType === 'apiKey'
                    ? 'bg-orange-500/10 border-orange-500 text-orange-950 dark:text-orange-200 ring-2 ring-orange-500/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="authType"
                  value="apiKey"
                  checked={authType === 'apiKey'}
                  onChange={() => setAuthType('apiKey')}
                  className="mt-0.5 text-orange-500 focus:ring-orange-500"
                />
                <div>
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-purple-500" />
                    <span>Static API Key Header</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    Menyematkan API key statis ke header setiap permintaan.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                  authType === 'custom'
                    ? 'bg-orange-500/10 border-orange-500 text-orange-950 dark:text-orange-200 ring-2 ring-orange-500/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="authType"
                  value="custom"
                  checked={authType === 'custom'}
                  onChange={() => setAuthType('custom')}
                  className="mt-0.5 text-orange-500 focus:ring-orange-500"
                />
                <div>
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-500" />
                    <span>Custom Login URL &amp; Payload</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    Tentukan URL login mandiri dan field path token hasil responnya.
                  </p>
                </div>
              </label>
            </div>

            {/* Custom Login Form jika dipilih */}
            {authType === 'custom' && (
              <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5 mt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">URL Endpoint Login</label>
                    <input
                      type="text"
                      placeholder="http://34.101.207.115:8080/api/v1/auth/login"
                      value={customLoginUrl}
                      onChange={(e) => setCustomLoginUrl(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Field Token Respon</label>
                    <input
                      type="text"
                      placeholder="data.access_token atau token"
                      value={customTokenField}
                      onChange={(e) => setCustomTokenField(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Payload JSON Login</label>
                  <textarea
                    rows={2}
                    value={customLoginPayload}
                    onChange={(e) => setCustomLoginPayload(e.target.value)}
                    className="w-full px-3 py-2 text-[11px] rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>
            )}

            {/* API Key Form jika dipilih */}
            {authType === 'apiKey' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 mt-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Nama Header</label>
                  <input
                    type="text"
                    placeholder="X-API-KEY"
                    value={apiKeyHeader}
                    onChange={(e) => setApiKeyHeader(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Nilai Kunci (API Key Value)</label>
                  <input
                    type="password"
                    placeholder="masukkan_api_key_disini"
                    value={apiKeyValue}
                    onChange={(e) => setApiKeyValue(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* BAGIAN 3: LANGKAH TRANSAKSI DINAMIS (PILIH SERVICE ➔ PILIH ENDPOINT) */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-extrabold shadow-xs">
                  3
                </span>
                <Layers className="w-4 h-4 text-orange-500" />
                <span>Rangkaian Langkah Transaksi ({steps.length} Langkah)</span>
              </div>

              <div className="flex items-center gap-2">
                {/* Toggle Filter Hanya Service UP */}
                <button
                  type="button"
                  onClick={() => setOnlyShowUpServices(!onlyShowUpServices)}
                  className={`text-[10px] font-extrabold px-2.5 py-1 rounded-xl border transition cursor-pointer flex items-center gap-1.5 ${
                    onlyShowUpServices
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                  }`}
                  title="Saring service yang sedang online / aktif"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${onlyShowUpServices ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                  {onlyShowUpServices ? `Service UP Saja (${runningServices.length})` : `Semua Service (${effectiveServices.length})`}
                </button>

                <button
                  type="button"
                  onClick={handleAddStep}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-black shadow-sm shadow-orange-500/20 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Langkah
                </button>
              </div>
            </div>

            {/* Mini Visual Pipeline Stepper Ribbon */}
            <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 overflow-x-auto">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-orange-500" />
                <span>Visualisasi Alur Rantai Transaksi k6:</span>
              </div>

              <div className="flex items-center gap-2 min-w-max">
                {steps.map((s, idx) => {
                  const targetSvc = selectableServices.find((sv) => sv.id === s.serviceKey) || effectiveServices.find((sv) => sv.id === s.serviceKey);
                  return (
                    <React.Fragment key={s.id || idx}>
                      <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
                        <span className="w-5 h-5 rounded-lg bg-orange-500 text-white text-[10px] font-mono font-black flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div className="text-left">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9px] font-mono font-black px-1.5 py-0.2 rounded border ${getMethodBadgeColor(s.method)}`}>
                              {s.method}
                            </span>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 max-w-[120px] truncate">
                              {s.name}
                            </span>
                          </div>
                          <div className="text-[9px] font-mono text-slate-400 truncate max-w-[150px]">
                            {targetSvc?.name || s.serviceKey}
                          </div>
                        </div>
                      </div>

                      {idx < steps.length - 1 && (
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* List Step Cards */}
            <div className="space-y-4">
              {steps.map((step, idx) => {
                const targetSvc = selectableServices.find((s) => s.id === step.serviceKey) || effectiveServices.find((s) => s.id === step.serviceKey) || effectiveServices[0];
                const availableEndpoints = getEndpointsForService(targetSvc?.id || step.serviceKey);
                const isLoginStep = (step.path && step.path.toLowerCase().includes('login')) || step.name.toLowerCase().includes('login');

                return (
                  <div
                    key={step.id || idx}
                    className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4 sm:p-5 space-y-4 shadow-sm hover:border-orange-500/40 transition-colors"
                  >
                    {/* Header Kartu Langkah */}
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div className="flex items-center gap-2.5 flex-1 max-w-lg">
                        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-orange-500 text-white font-black text-xs font-mono shadow-xs shrink-0">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={step.name}
                          onChange={(e) => handleStepChange(idx, 'name', e.target.value)}
                          placeholder={`Nama Langkah ${idx + 1}`}
                          className="w-full text-xs sm:text-sm font-black text-slate-900 dark:text-white bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 outline-none pb-0.5 focus:border-orange-500"
                        />
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDuplicateStep(idx)}
                          className="text-slate-400 hover:text-orange-500 transition cursor-pointer p-1.5 rounded-lg hover:bg-orange-500/10"
                          title="Duplikat langkah ini"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveStep(idx)}
                            className="text-slate-400 hover:text-rose-500 transition cursor-pointer p-1.5 rounded-lg hover:bg-rose-500/10"
                            title="Hapus langkah ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ─── PEMILIHAN TARGET SERVICE & KATALOG ENDPOINT (2 KOLOM JELAS & HARMONIS) ─── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                      {/* KOLOM 1: TARGET MICROSERVICE (TEMA BIRU SLATE) */}
                      <div className="rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-gradient-to-br from-blue-50/70 via-slate-50/50 to-white dark:from-blue-950/25 dark:via-slate-900/40 dark:to-slate-900/60 p-4 space-y-2.5 shadow-xs transition-all">
                        <div className="flex items-center justify-between border-b border-blue-100 dark:border-blue-900/40 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-blue-600 text-white text-[10px] font-black shadow-xs">
                              1
                            </span>
                            <span className="text-xs font-black uppercase tracking-wider text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                              <ServerIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                              Target Microservice
                            </span>
                          </div>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            {targetSvc?.url ? targetSvc.url.replace(/^https?:\/\//, '') : 'Port Host'}
                          </span>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                            Pilih Microservice Projek:
                          </label>
                          <select
                            value={step.serviceKey}
                            onChange={(e) => handleStepChange(idx, 'serviceKey', e.target.value)}
                            className="w-full px-3.5 py-2.5 text-xs font-bold rounded-xl border border-blue-300 dark:border-blue-800/80 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer shadow-xs transition"
                          >
                            {selectableServices.map((svc) => {
                              const isUp = isServiceUp(svc);
                              const cleanUrl = svc.url ? svc.url.replace(/https?:\/\//, '') : 'Port Service';
                              return (
                                <option key={svc.id} value={svc.id}>
                                  {isUp ? '🟢 [UP]' : '⚪ [OFFLINE]'} {svc.name} — ({cleanUrl})
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5 pt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                          <span className="truncate">
                            Layanan aktif: <strong className="text-slate-800 dark:text-slate-200">{targetSvc?.name}</strong>
                          </span>
                        </div>
                      </div>

                      {/* KOLOM 2: KATALOG ENDPOINT RESMI (TEMA INDIGO VIOLET) */}
                      <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-white dark:from-indigo-950/25 dark:via-purple-950/20 dark:to-slate-900/60 p-4 space-y-2.5 shadow-xs transition-all">
                        <div className="flex items-center justify-between border-b border-indigo-100 dark:border-indigo-900/40 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-indigo-600 text-white text-[10px] font-black shadow-xs">
                              2
                            </span>
                            <span className="text-xs font-black uppercase tracking-wider text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                              <Globe className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                              Pilih Endpoint Katalog
                            </span>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            {availableEndpoints.length} Terdaftar
                          </span>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                            Pilih Template Rute Resmi:
                          </label>
                          <select
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!val) return;
                              const found = availableEndpoints.find((ep) => `${ep.method}:${ep.path}` === val);
                              if (found) {
                                handleApplyPresetEndpoint(idx, found);
                              }
                            }}
                            value={
                              availableEndpoints.some((ep) => ep.path === step.path && ep.method === step.method)
                                ? `${step.method}:${step.path}`
                                : ''
                            }
                            className="w-full px-3.5 py-2.5 text-xs font-bold rounded-xl border border-indigo-300 dark:border-indigo-800/80 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer shadow-xs transition"
                          >
                            <option value="">-- Pilih Endpoint untuk {targetSvc?.name} --</option>
                            {availableEndpoints.map((ep) => (
                              <option key={`${ep.method}:${ep.path}`} value={`${ep.method}:${ep.path}`}>
                                [{ep.method}] {ep.path} — {ep.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Deskripsi Endpoint Terpilih */}
                        <div className="text-[11px] text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5 pt-0.5 min-h-[20px]">
                          <ChevronRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span className="truncate">
                            {availableEndpoints.find((ep) => ep.path === step.path && ep.method === step.method)?.desc || 'Pilih template di atas untuk mengisi parameter otomatis.'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Notifikasi Cerdas jika Terdeteksi Endpoint Login */}
                    {isLoginStep && (
                      <div className="px-3.5 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-800 dark:text-violet-300 text-[11px] flex items-center gap-2.5">
                        <Sparkles className="w-4 h-4 shrink-0 text-violet-500" />
                        <div>
                          <strong>Langkah Login Pasien:</strong> k6 akan otomatis mengekstrak token JWT dari respon endpoint ini dan menyematkannya ke semua langkah berikutnya!
                        </div>
                      </div>
                    )}

                    {/* ─── PARAMETER HTTP & LIVE PREVIEW k6 ─── */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4 space-y-3">
                      <div className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5 border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
                        <Sparkles className="w-3.5 h-3.5 text-slate-500" />
                        <span>Parameter Request &amp; Target Eksekusi k6</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                        {/* HTTP Method */}
                        <div className="sm:col-span-3">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Method HTTP</label>
                          <select
                            value={step.method}
                            onChange={(e) => handleStepChange(idx, 'method', e.target.value)}
                            className={`w-full px-3 py-2 text-xs font-black rounded-xl border outline-none font-mono cursor-pointer transition ${getMethodBadgeColor(step.method)}`}
                          >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PATCH">PATCH</option>
                            <option value="PUT">PUT</option>
                            <option value="DELETE">DELETE</option>
                          </select>
                        </div>

                        {/* Path Endpoint */}
                        <div className="sm:col-span-6">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                            Endpoint Path (Dapat Diedit Manual)
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="/api/v1/resource"
                            value={step.path}
                            onChange={(e) => handleStepChange(idx, 'path', e.target.value)}
                            className="w-full px-3.5 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                          />
                        </div>

                        {/* Expected Status Code */}
                        <div className="sm:col-span-3">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Status Diharapkan</label>
                          <input
                            type="number"
                            value={step.expectedStatus || 200}
                            onChange={(e) => handleStepChange(idx, 'expectedStatus', parseInt(e.target.value, 10) || 200)}
                            className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                          />
                        </div>
                      </div>

                      {/* Live Terminal URL Preview */}
                      <div className="text-[11px] font-mono bg-slate-900 dark:bg-black text-slate-200 px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-2 overflow-x-auto border border-slate-800 shadow-inner">
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            URL Target k6
                          </span>
                          <span className={`text-[10px] font-black px-1.5 py-0.2 rounded border ${getMethodBadgeColor(step.method)}`}>
                            {step.method}
                          </span>
                        </div>
                        <span className="text-emerald-400 font-bold truncate">
                          {targetSvc?.url
                            ? `${targetSvc.url.replace(/\/$/, '')}${step.path.startsWith('/') ? step.path : `/${step.path}`}`
                            : `[Base URL]${step.path}`}
                        </span>
                      </div>
                    </div>

                    {/* Step 3.4: BODY PAYLOAD JSON (JIKA METHOD POST / PUT / PATCH) */}
                    {(step.method === 'POST' || step.method === 'PUT' || step.method === 'PATCH') && (
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                            Request Body JSON (Otomatis Terisi &amp; Bebas Diubah):
                          </label>
                          <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded">
                            Placeholder k6: <code>{"{{VU_EMAIL}}"}</code>, <code>{"{{consultId}}"}</code>, <code>{"{{sessionId}}"}</code>
                          </span>
                        </div>
                        <textarea
                          rows={4}
                          value={typeof step.body === 'object' ? JSON.stringify(step.body, null, 2) : step.body || ''}
                          onChange={(e) => handleStepChange(idx, 'body', e.target.value)}
                          placeholder='{\n  "key": "value"\n}'
                          className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Tombol Tambah Langkah Tambahan */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleAddStep}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-orange-500/40 hover:border-orange-500 bg-orange-500/5 hover:bg-orange-500/10 text-orange-600 dark:text-orange-400 font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Langkah Transaksi Baru (+ Step {steps.length + 1})</span>
              </button>
            </div>
          </div>

          {/* Footer Modal Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <div className="text-xs text-slate-400 font-medium">
              Total <strong className="text-slate-800 dark:text-slate-200">{steps.length} langkah</strong> akan diuji secara berurutan.
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black text-white bg-orange-500 hover:bg-orange-600 shadow-md shadow-orange-500/20 transition cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isSaving ? 'Menyimpan Flow...' : 'Simpan & Gunakan Flow Ini'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomFlowModal;
