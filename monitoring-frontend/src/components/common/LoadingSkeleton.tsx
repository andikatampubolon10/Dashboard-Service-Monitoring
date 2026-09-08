import React from 'react';

export const CardSkeleton: React.FC = () => (
  <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl animate-pulse">
    <div className="flex items-center justify-between">
      <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-24"></div>
      <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-12"></div>
    </div>
    <div className="h-7 bg-slate-200 dark:bg-slate-800 rounded w-32 mt-3"></div>
    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-full mt-3"></div>
  </div>
);

export const ChartSkeleton: React.FC<{ height?: string }> = ({ height = 'h-56' }) => (
  <div className={`bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl animate-pulse ${height} flex flex-col justify-between`}>
    <div className="flex items-center justify-between">
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-40"></div>
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20"></div>
    </div>
    <div className="h-32 bg-slate-100 dark:bg-slate-950/60 rounded-xl"></div>
  </div>
);

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl overflow-hidden shadow-sm dark:shadow-xl animate-pulse">
    <div className="p-4 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-48"></div>
      <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded w-24"></div>
    </div>
    <div className="divide-y divide-slate-100 dark:divide-slate-800/60 p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="py-3 px-4 flex items-center justify-between">
          <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-32"></div>
          <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-16"></div>
          <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-20"></div>
          <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-24"></div>
        </div>
      ))}
    </div>
  </div>
);

export interface LoadingSkeletonProps {
  variant?: 'card' | 'chart' | 'table';
  count?: number;
  height?: string;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  variant = 'card',
  count = 1,
  height,
}) => {
  if (variant === 'table') {
    return <TableSkeleton rows={count} />;
  }
  if (variant === 'chart') {
    return <ChartSkeleton height={height} />;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
};
