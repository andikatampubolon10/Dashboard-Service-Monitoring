import React from 'react';
import { ServiceError } from '../../types';
import { Modal } from '../common/Modal';
import { formatRelativeTime } from '../../utils/dateUtils';
import { AlertOctagon, Copy } from 'lucide-react';

interface ErrorDetailProps {
  error: ServiceError | null;
  isOpen: boolean;
  onClose: () => void;
  onResolve?: (errorId: string) => void;
}

export const ErrorDetail: React.FC<ErrorDetailProps> = ({ error, isOpen, onClose, onResolve }) => {
  if (!error) return null;

  const handleCopyStack = () => {
    navigator.clipboard.writeText(error.stackTrace);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
          <AlertOctagon className="w-5 h-5 shrink-0" />
          <span className="font-mono font-bold text-sm">{error.type}</span>
        </div>
      }
      subtitle={
        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
          <span>Service: <strong className="text-cyan-600 dark:text-cyan-400">{error.serviceName}</strong></span>
          <span>&bull;</span>
          <span>Endpoint: <strong className="text-slate-700 dark:text-slate-300">{error.affectedEndpoint}</strong></span>
        </div>
      }
      maxWidth="3xl"
    >
      <div className="space-y-4 text-xs font-mono">
        {/* Error Message Alert Box */}
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-rose-800 dark:text-rose-300">
          <div className="text-[10px] text-rose-500 uppercase font-bold tracking-wider mb-1">
            Exception Message
          </div>
          <div className="text-xs font-bold leading-relaxed">{error.message}</div>
        </div>

        {/* Telemetry Stats */}
        <div className="grid grid-cols-3 gap-3 text-[11px]">
          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-slate-400 text-[10px] uppercase">Occurrences</span>
            <div className="text-base font-bold text-rose-600 dark:text-rose-400 mt-0.5">
              {error.occurrences.toLocaleString()} events
            </div>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-slate-400 text-[10px] uppercase">First Seen</span>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
              {formatRelativeTime(error.firstSeen)}
            </div>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-slate-400 text-[10px] uppercase">Last Seen</span>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
              {formatRelativeTime(error.lastSeen)}
            </div>
          </div>
        </div>

        {/* Stack Trace Code Block */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="font-sans font-bold text-xs text-slate-900 dark:text-white">Formatted Stack Trace</h4>
            <button
              onClick={handleCopyStack}
              className="inline-flex items-center gap-1 text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline"
            >
              <Copy className="w-3 h-3" />
              Copy Stack Trace
            </button>
          </div>
          <pre className="p-3.5 bg-slate-900 dark:bg-slate-950 text-rose-300 dark:text-rose-300/90 rounded-xl overflow-x-auto text-[11px] leading-relaxed border border-slate-800">
            {error.stackTrace}
          </pre>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          {onResolve && error.status === 'active' && (
            <button
              onClick={() => onResolve(error.id)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition text-xs"
            >
              Mark as Resolved
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
