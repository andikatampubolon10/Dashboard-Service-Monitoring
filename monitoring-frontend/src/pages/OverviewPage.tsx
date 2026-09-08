import React from 'react';

export const OverviewPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Dashboard
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Ringkasan pemantauan sistem
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-16 text-center bg-white/40 dark:bg-slate-900/40">
        <div className="max-w-md mx-auto space-y-2">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Halaman Dashboard Kosong
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Silakan akses menu <strong>Services</strong> atau <strong>Servers</strong> pada navigasi di sebelah kiri.
          </p>
        </div>
      </div>
    </div>
  );
};
