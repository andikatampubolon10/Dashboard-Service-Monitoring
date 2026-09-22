import React, { useState, useMemo } from 'react';
import {
  X,
  Layers,
  CheckCircle2,
  Server as ServerIcon,
  ShieldCheck,
  Zap,
  Check,
  Globe,
} from 'lucide-react';
import { CustomFlow, CustomFlowStep, CustomFlowAuthConfig } from '../../services/stressTestEngine';
import { Service } from '../../types';
import { SERVICE_ENDPOINTS_CATALOG, EndpointItem, DEFAULT_PROJECT_SERVICES } from './CustomFlowModal';

interface ServiceTestCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  services: Service[];
  onSaveFlow: (flow: CustomFlow) => Promise<void>;
}

export const ServiceTestCreatorModal: React.FC<ServiceTestCreatorModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  services,
  onSaveFlow,
}) => {
  const effectiveServices = services && services.length > 0 ? services : DEFAULT_PROJECT_SERVICES;

  // Selected Service to test
  const [selectedServiceId, setSelectedServiceId] = useState<string>(() => {
    return effectiveServices[0]?.id || 'identity-service-node-34-101-207-115';
  });

  const selectedService = useMemo(() => {
    return effectiveServices.find((s) => s.id === selectedServiceId) || effectiveServices[0];
  }, [effectiveServices, selectedServiceId]);

  // Find endpoints catalog key based on service id / name
  const catalogKey = useMemo(() => {
    if (!selectedService) return 'identity';
    const sId = (selectedService.id || '').toLowerCase();
    const sName = (selectedService.name || '').toLowerCase();

    if (sId.includes('ai-consult') || sName.includes('ai')) return 'ai-consultation';
    if (sId.includes('lifestyle') || sName.includes('lifestyle')) return 'lifestyle';
    if (sId.includes('live') || sName.includes('live')) return 'live-consult';
    if (sId.includes('health-profile') || sName.includes('profile')) return 'health-profile';
    if (sId.includes('identity') || sName.includes('identity') || sName.includes('auth')) return 'identity';
    return 'identity';
  }, [selectedService]);

  const availableEndpoints: EndpointItem[] = useMemo(() => {
    return SERVICE_ENDPOINTS_CATALOG[catalogKey] || [
      { method: 'GET', path: '/health', name: 'Health Probe Liveness', desc: 'Cek status readiness & liveness microservice', expectedStatus: 200 },
      { method: 'GET', path: '/metrics', name: 'Prometheus Metrics', desc: 'Metrik performa internal runtime server', expectedStatus: 200 },
    ];
  }, [catalogKey]);

  // Selected endpoints indices
  const [selectedEndpointIndices, setSelectedEndpointIndices] = useState<number[]>([0]);
  const [flowName, setFlowName] = useState<string>('');
  const [flowDescription, setFlowDescription] = useState<string>('');
  const [authType, setAuthType] = useState<'none' | 'identity'>('identity');
  const [isSaving, setIsSaving] = useState(false);

  // Auto-generate name when service changes
  React.useEffect(() => {
    if (selectedService) {
      setFlowName(`Uji Service: ${selectedService.name}`);
      setFlowDescription(`Pengujian beban terisolasi untuk ${selectedService.name} (${selectedService.url || 'endpoint'})`);
      setSelectedEndpointIndices([0]);
    }
  }, [selectedServiceId]);

  if (!isOpen) return null;

  const toggleEndpoint = (index: number) => {
    if (selectedEndpointIndices.includes(index)) {
      if (selectedEndpointIndices.length === 1) return; // minimal 1 endpoint
      setSelectedEndpointIndices(selectedEndpointIndices.filter((i) => i !== index));
    } else {
      setSelectedEndpointIndices([...selectedEndpointIndices, index]);
    }
  };

  const handleSave = async () => {
    if (!flowName.trim() || selectedEndpointIndices.length === 0) return;

    setIsSaving(true);
    try {
      const baseUrl = (selectedService?.url || '').replace(/\/$/, '');
      const steps: CustomFlowStep[] = selectedEndpointIndices.map((idx, stepIdx) => {
        const ep = availableEndpoints[idx];
        return {
          id: `step-${Date.now()}-${stepIdx + 1}`,
          name: ep.name,
          serviceKey: selectedService?.id || catalogKey,
          method: ep.method,
          path: ep.path,
          url: baseUrl ? `${baseUrl}${ep.path}` : undefined,
          body: ep.body,
          expectedStatus: ep.expectedStatus || 200,
        };
      });

      const authConfig: CustomFlowAuthConfig = {
        type: authType,
        identityServiceKey: authType === 'identity' ? 'identity' : undefined,
      };

      const newFlow: CustomFlow = {
        id: `flow-svc-${Date.now()}`,
        projectId: projectId || undefined,
        name: flowName.trim(),
        description: flowDescription.trim() || `Skenario pengujian untuk ${selectedService?.name}`,
        authConfig,
        steps,
        createdAt: new Date().toISOString(),
      };

      await onSaveFlow(newFlow);
      onClose();
    } catch (err) {
      console.error('Failed to save service test flow:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-white dark:bg-[#0B0F19] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center border border-orange-500/20 shadow-xs">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Buat Pengujian Sesuai Service
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                  Projek: {projectName}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pilih microservice yang ada di projek ini untuk diuji beban atau ketahanannya secara spesifik.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar">
          {/* 1. Pilih Service dalam Projek */}
          <div className="space-y-2.5">
            <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <ServerIcon className="w-3.5 h-3.5 text-orange-500" />
              <span>1. Pilih Microservice Target:</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {effectiveServices.map((svc) => {
                const isSelected = svc.id === selectedServiceId;
                const isUp = (svc.rawStatus || svc.status || '').toLowerCase() === 'up' || (svc.rawStatus || svc.status || '').toLowerCase() === 'healthy';

                return (
                  <div
                    key={svc.id}
                    onClick={() => setSelectedServiceId(svc.id)}
                    className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? 'border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/20 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected ? 'bg-orange-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Layers className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                          {svc.name}
                        </span>
                        <span
                          className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded shrink-0 ${
                            isUp ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'
                          }`}
                        >
                          {isUp ? 'UP' : 'STANDBY'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                        {svc.url || 'http://localhost'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Pilih Endpoint dalam Service Terpilih */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-orange-500" />
                <span>2. Pilih Endpoint yang Ingin Diuji:</span>
              </label>
              <span className="text-[11px] text-slate-500 font-bold">
                {selectedEndpointIndices.length} endpoint terpilih
              </span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {availableEndpoints.map((ep, idx) => {
                const isChecked = selectedEndpointIndices.includes(idx);
                return (
                  <div
                    key={idx}
                    onClick={() => toggleEndpoint(idx)}
                    className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                      isChecked
                        ? 'border-orange-500/50 bg-orange-500/5 dark:bg-orange-500/10 shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                          isChecked
                            ? 'bg-orange-500 border-orange-500 text-white'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800'
                        }`}
                      >
                        {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded border font-mono ${
                              ep.method === 'POST'
                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                : ep.method === 'PATCH'
                                ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                : 'bg-sky-500/10 text-sky-600 border-sky-500/20'
                            }`}
                          >
                            {ep.method}
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                            {ep.path}
                          </span>
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 hidden sm:inline truncate">
                            • {ep.name}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                          {ep.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Detail Skenario & Autentikasi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100 dark:border-slate-800/80">
            <div className="space-y-1">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Nama Skenario Pengujian:
              </label>
              <input
                type="text"
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-orange-500/20"
                placeholder="Contoh: Uji AI Consultation Service"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Mode Autentikasi:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAuthType('identity')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    authType === 'identity'
                      ? 'border-orange-500 bg-orange-500/10 text-orange-600 font-black'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>JWT Pasien</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAuthType('none')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    authType === 'none'
                      ? 'border-orange-500 bg-orange-500/10 text-orange-600 font-black'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span>Tanpa Auth</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            Batal
          </button>

          <button
            type="button"
            disabled={isSaving || !flowName.trim() || selectedEndpointIndices.length === 0}
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black text-xs shadow-md shadow-orange-500/25 flex items-center gap-2 transition cursor-pointer"
          >
            {isSaving ? (
              <span className="animate-spin">🌀</span>
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span>Simpan & Pasang sebagai Skenario Aktif</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default ServiceTestCreatorModal;
