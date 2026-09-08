import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useGlobalFilters } from '../../context/FilterContext';

export const AutoRefreshControl: React.FC = () => {
  const { filter, setRefreshInterval, triggerManualRefresh } = useGlobalFilters();
  const [isSpinning, setIsSpinning] = useState(false);

  const handleManualClick = () => {
    setIsSpinning(true);
    triggerManualRefresh();
    setTimeout(() => setIsSpinning(false), 600);
  };

  return (
    <div className="flex items-center gap-1.5">
      {/* Auto refresh dropdown */}
      <div className="flex items-center bg-slate-100 dark:bg-slate-800/90 rounded-lg px-2.5 py-1 border border-slate-200 dark:border-slate-700 text-xs shadow-sm">
        <RefreshCw
          className={`w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 mr-1.5 ${
            filter.refreshInterval > 0 ? 'animate-spin' : ''
          }`}
          style={{ animationDuration: '3s' }}
        />
        <span className="text-slate-500 dark:text-slate-400 mr-1 font-medium">Auto:</span>
        <select
          value={filter.refreshInterval}
          onChange={(e) => setRefreshInterval(Number(e.target.value))}
          className="bg-transparent text-cyan-600 dark:text-cyan-400 font-semibold focus:outline-none cursor-pointer"
        >
          <option value={5} className="dark:bg-slate-900">5s</option>
          <option value={10} className="dark:bg-slate-900">10s</option>
          <option value={30} className="dark:bg-slate-900">30s</option>
          <option value={60} className="dark:bg-slate-900">60s</option>
          <option value={0} className="dark:bg-slate-900">Off</option>
        </select>
      </div>

      {/* Force refresh button */}
      <button
        onClick={handleManualClick}
        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600 transition shadow-sm"
        title="Force Refresh Data Now"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isSpinning ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
};
