import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useServiceDependencies } from '../../hooks/useServiceDependencies';
import { DependencyGraph } from '../../components/monitoring/DependencyGraph';
import { ErrorState } from '../../components/common/ErrorState';

export const ServiceDependenciesTab: React.FC = () => {
  const { id = 'live-consult-service' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: topology, isError, refetch } = useServiceDependencies(id);

  if (isError) {
    return <ErrorState onRetry={refetch} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Upstream & Downstream Dependencies for {id}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Interactive visual graph of all connected microservices, external APIs, and database stores
          </p>
        </div>
      </div>

      {topology && (
        <DependencyGraph
          data={topology}
          activeServiceId={id}
          onNodeClick={(node) => {
            if (node.type === 'service' && node.id !== id) {
              navigate(`/services/${node.id}`);
            }
          }}
        />
      )}
    </div>
  );
};
