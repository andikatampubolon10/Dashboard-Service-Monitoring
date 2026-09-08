import React from 'react';
import { ServiceRequest } from '../../types';
import { Modal } from '../common/Modal';
import { getStatusCodeColor } from '../../utils/statusColors';
import { Copy, Clock, Globe, ArrowRight, ShieldCheck } from 'lucide-react';

interface RequestDetailProps {
  request: ServiceRequest | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RequestDetail: React.FC<RequestDetailProps> = ({ request, isOpen, onClose }) => {
  if (!request) return null;

  const handleCopyTrace = () => {
    navigator.clipboard.writeText(request.traceId);
  };

  const statusColor = getStatusCodeColor(request.statusCode);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold ${statusColor}`}>{request.method}</span>
          <span className="font-mono text-sm">{request.path}</span>
        </div>
      }
      subtitle={
        <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
          <span>Service: <strong className="text-cyan-400">{request.serviceName}</strong></span>
          <span>&bull;</span>
          <span>Trace ID: <button onClick={handleCopyTrace} className="text-cyan-400 hover:underline inline-flex items-center gap-1">{request.traceId} <Copy className="w-3 h-3" /></button></span>
        </div>
      }
      maxWidth="3xl"
    >
      <div className="space-y-4 text-xs font-mono">
        {/* Overview Stats Box */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-slate-400 text-[10px] uppercase">HTTP Status</span>
            <div className={`text-base font-bold mt-0.5 ${statusColor}`}>
              {request.statusCode}
            </div>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-slate-400 text-[10px] uppercase">Total Duration</span>
            <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
              {request.durationMs.toFixed(1)} ms
            </div>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-slate-400 text-[10px] uppercase">Client IP</span>
            <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
              {request.clientIp}
            </div>
          </div>
        </div>

        {/* Latency Waterfall Breakdown */}
        {request.breakdown && (
          <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
            <h4 className="font-sans font-bold text-xs text-slate-900 dark:text-white mb-2.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-500" />
              APM Latency Waterfall Breakdown
            </h4>
            <div className="space-y-2 text-[11px]">
              <div className="flex items-center justify-between p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <Globe className="w-3 h-3 text-cyan-400" /> DNS Lookup
                </span>
                <span className="font-bold text-emerald-500">{request.breakdown.dnsMs} ms</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <ShieldCheck className="w-3 h-3 text-cyan-400" /> TCP Connect + TLS Handshake
                </span>
                <span className="font-bold text-emerald-500">{request.breakdown.tcpTlsMs} ms</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <ArrowRight className="w-3 h-3 text-cyan-400" /> Internal Server Processing
                </span>
                <span className="font-bold text-slate-700 dark:text-slate-300">{request.breakdown.processingMs} ms</span>
              </div>
              {request.breakdown.externalApiMs && (
                <div className="flex items-center justify-between p-2 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400">
                  <span>Downstream External API Execution (Stripe)</span>
                  <span className="font-bold">{request.breakdown.externalApiMs} ms (TIMEOUT)</span>
                </div>
              )}
              {request.breakdown.dbMs && (
                <div className="flex items-center justify-between p-2 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 text-amber-600 dark:text-amber-400">
                  <span>Database Query Execution (Postgres)</span>
                  <span className="font-bold">{request.breakdown.dbMs} ms</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Request Body */}
        {request.requestBody && (
          <div>
            <h4 className="font-sans font-bold text-xs text-slate-900 dark:text-white mb-1.5">Request Payload</h4>
            <pre className="p-3 bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-cyan-300 rounded-lg overflow-x-auto text-[11px] border border-slate-200 dark:border-slate-800">
              {request.requestBody}
            </pre>
          </div>
        )}

        {/* Response Body */}
        {request.responseBody && (
          <div>
            <h4 className="font-sans font-bold text-xs text-slate-900 dark:text-white mb-1.5">Response Payload</h4>
            <pre className={`p-3 rounded-lg overflow-x-auto text-[11px] border ${
              request.statusCode >= 400
                ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/40'
                : 'bg-slate-100 dark:bg-slate-950 text-emerald-700 dark:text-emerald-400 border-slate-200 dark:border-slate-800'
            }`}>
              {request.responseBody}
            </pre>
          </div>
        )}
      </div>
    </Modal>
  );
};
