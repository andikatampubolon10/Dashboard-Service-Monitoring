import React from 'react';
import { useParams } from 'react-router-dom';
import { useServiceLogs } from '../../hooks/useServiceLogs';
import { LogViewer } from '../../components/monitoring/LogViewer';
import { ErrorState } from '../../components/common/ErrorState';

export const ServiceLogsTab: React.FC = () => {
  const { id = 'live-consult-service' } = useParams<{ id: string }>();
  const { data: logs = [], isError, refetch } = useServiceLogs(id);

  if (isError) {
    return <ErrorState onRetry={refetch} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Scoped Real-Time Log Stream for {id}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time log stream filtered for this microservice with search and level filters
          </p>
        </div>
      </div>

      <LogViewer logs={logs} serviceName={id} />
    </div>
  );
};
