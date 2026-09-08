import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Failed to Load Data',
  message = 'An unexpected error occurred while fetching monitoring telemetry.',
  onRetry,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl">
      <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-3">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-semibold text-rose-900 dark:text-rose-300">{title}</h3>
      <p className="text-xs text-rose-700 dark:text-rose-400/80 mt-1 max-w-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Query
        </button>
      )}
    </div>
  );
};
