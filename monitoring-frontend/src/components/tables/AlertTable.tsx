import React from 'react';
import { Alert } from '../../types';
import { SeverityBadge } from '../common/SeverityBadge';
import { formatRelativeTime } from '../../utils/dateUtils';
import { Bell, Check, BellOff } from 'lucide-react';

interface AlertTableProps {
  alerts: Alert[];
  onAcknowledge?: (alertId: string) => void;
  onSilence?: (alertId: string, durationMinutes: number) => void;
  isMutating?: boolean;
}

export const AlertTable: React.FC<AlertTableProps> = ({
  alerts,
  onAcknowledge,
  onSilence,
  isMutating = false,
}) => {
  if (alerts.length === 0) {
    return (
      <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
        <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2">
          <Check className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">All Clear</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">No active alerts firing for this scope.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-semibold">
            <tr>
              <th className="py-3 px-4">SEVERITY</th>
              <th className="py-3 px-4">ALERT NAME & THRESHOLD</th>
              <th className="py-3 px-4">SERVICE</th>
              <th className="py-3 px-4">TRIGGERED</th>
              <th className="py-3 px-4">STATUS</th>
              <th className="py-3 px-4 text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
            {alerts.map((alert) => (
              <tr key={alert.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                <td className="py-3 px-4">
                  <SeverityBadge severity={alert.severity} />
                </td>
                <td className="py-3 px-4">
                  <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-slate-400" />
                    <span>{alert.title}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                    Threshold: <span className="text-slate-700 dark:text-slate-300">{alert.threshold}</span> (Current: <strong className="text-rose-600 dark:text-rose-400">{alert.currentValue}</strong>)
                  </div>
                </td>
                <td className="py-3 px-4 font-mono text-cyan-600 dark:text-cyan-400">
                  {alert.serviceName}
                </td>
                <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                  {formatRelativeTime(alert.triggeredAt)}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      alert.status === 'firing'
                        ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                        : alert.status === 'acknowledged'
                        ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {alert.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-right space-x-1.5">
                  {alert.status === 'firing' && onAcknowledge && (
                    <button
                      disabled={isMutating}
                      onClick={() => onAcknowledge(alert.id)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-medium text-[11px] border border-slate-200 dark:border-slate-700 transition"
                    >
                      Acknowledge
                    </button>
                  )}
                  {onSilence && (
                    <button
                      disabled={isMutating}
                      onClick={() => onSilence(alert.id, 60)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium text-[11px] border border-slate-200 dark:border-slate-700 transition"
                      title="Silence for 1 hour"
                    >
                      <BellOff className="w-3 h-3" />
                      Silence (1h)
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
