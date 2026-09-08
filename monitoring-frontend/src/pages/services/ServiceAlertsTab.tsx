import React from 'react';
import { useParams } from 'react-router-dom';
import { useServiceAlerts } from '../../hooks/useServiceAlerts';
import { AlertTable } from '../../components/tables/AlertTable';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { ErrorState } from '../../components/common/ErrorState';
import { Bell, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';

export const ServiceAlertsTab: React.FC = () => {
  const { id = 'live-consult-service' } = useParams<{ id: string }>();
  const {
    data: alerts = [],
    isLoading,
    isError,
    refetch,
    acknowledgeAlert,
    silenceAlert,
    isMutating,
  } = useServiceAlerts(id);

  if (isLoading) {
    return <LoadingSkeleton variant="table" count={4} />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Failed to Load Service Alerts"
        message="Could not retrieve active alerts for this microservice."
        onRetry={refetch}
      />
    );
  }

  const firingCount = alerts.filter((a) => a.status === 'firing').length;
  const criticalCount = alerts.filter((a) => a.severity === 'critical' && a.status === 'firing').length;
  const acknowledgedCount = alerts.filter((a) => a.status === 'acknowledged').length;

  return (
    <div className="space-y-6">
      {/* Alert Stats Top Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 flex items-center justify-between shadow-sm dark:shadow-xl">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 font-mono">Firing Alerts</p>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 font-mono mt-1">{firingCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-500 flex items-center justify-center">
            <Bell className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 flex items-center justify-between shadow-sm dark:shadow-xl">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 font-mono">Critical Severity</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono mt-1">{criticalCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 flex items-center justify-between shadow-sm dark:shadow-xl">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 font-mono">Acknowledged</p>
            <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 font-mono mt-1">{acknowledgedCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Alert Policy & Status Description */}
      <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 dark:text-slate-400">
          <span className="font-semibold text-slate-900 dark:text-slate-200">Alert Notification Policy:</span> Firing alerts notify on-call via PagerDuty and Slack webhook. Acknowledging an alert silences immediate escalations while investigation is in progress.
        </div>
      </div>

      {/* Alerts Table */}
      <AlertTable
        alerts={alerts}
        onAcknowledge={(alertId) => acknowledgeAlert(alertId)}
        onSilence={(alertId, duration) => silenceAlert({ alertId, duration })}
        isMutating={isMutating}
      />
    </div>
  );
};
