import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useServiceErrors } from '../../hooks/useServiceErrors';
import { DataTable, ColumnDef } from '../../components/tables/DataTable';
import { ErrorDetail } from '../../components/monitoring/ErrorDetail';
import { ServiceError } from '../../types';
import { formatRelativeTime } from '../../utils/dateUtils';
import { AlertOctagon, ArrowRight } from 'lucide-react';

export const ServiceErrorsTab: React.FC = () => {
  const { id = 'live-consult-service' } = useParams<{ id: string }>();
  const { data: errors = [], isLoading } = useServiceErrors(id);
  const [selectedError, setSelectedError] = useState<ServiceError | null>(null);

  const totalErrors = errors.reduce((acc, curr) => acc + curr.occurrences, 0);

  const columns: ColumnDef<ServiceError>[] = [
    {
      key: 'type',
      header: 'EXCEPTION TYPE & MESSAGE',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
            <span>{row.type}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
            {row.message}
          </div>
        </div>
      ),
    },
    {
      key: 'affectedEndpoint',
      header: 'AFFECTED ENDPOINT',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-slate-700 dark:text-slate-300 text-xs font-medium">
          {row.affectedEndpoint}
        </span>
      ),
    },
    {
      key: 'occurrences',
      header: 'OCCURRENCES',
      sortable: true,
      render: (row) => (
        <span className="font-mono font-bold text-xs text-rose-600 dark:text-rose-400">
          {row.occurrences.toLocaleString()} events
        </span>
      ),
    },
    {
      key: 'lastSeen',
      header: 'LAST SEEN',
      sortable: true,
      render: (row) => (
        <span className="text-slate-500 dark:text-slate-400 text-xs">
          {formatRelativeTime(row.lastSeen)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'STATUS',
      sortable: true,
      render: (row) => (
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
            row.status === 'active'
              ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
              : row.status === 'acknowledged'
              ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
              : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
          }`}
        >
          {row.status}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'ACTION',
      align: 'right',
      render: (row) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedError(row);
          }}
          className="inline-flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400 font-semibold hover:underline"
        >
          <span>Inspect Stack</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Error Tracking & Exception Analyzer for {id}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Total of <strong className="text-rose-600 dark:text-rose-400 font-mono">{totalErrors.toLocaleString()} occurrences</strong> recorded in current time window
          </p>
        </div>
      </div>

      <DataTable
        data={errors as unknown as Record<string, unknown>[]}
        columns={columns as unknown as ColumnDef<Record<string, unknown>>[]}
        isLoading={isLoading}
        onRowClick={(row) => setSelectedError(row as unknown as ServiceError)}
        searchPlaceholder="Filter exceptions by name, message, endpoint..."
        pageSize={10}
      />

      <ErrorDetail
        error={selectedError}
        isOpen={Boolean(selectedError)}
        onClose={() => setSelectedError(null)}
      />
    </div>
  );
};
