import React from 'react';
import { Clock } from 'lucide-react';
import { useGlobalFilters } from '../../context/FilterContext';
import { TimeRangePreset } from '../../types';

export const TimeRangePicker: React.FC = () => {
  const { filter, setTimeRange } = useGlobalFilters();

  return (
    <div className="flex items-center bg-slate-100 dark:bg-slate-800/90 rounded-lg px-2.5 py-1 border border-slate-200 dark:border-slate-700 text-xs shadow-sm">
      <Clock className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 mr-1.5" />
      <select
        value={filter.timeRange}
        onChange={(e) => setTimeRange(e.target.value as TimeRangePreset)}
        className="bg-transparent text-slate-800 dark:text-white font-medium focus:outline-none cursor-pointer"
      >
        <option value="5m" className="dark:bg-slate-900">Last 5 Minutes</option>
        <option value="15m" className="dark:bg-slate-900">Last 15 Minutes</option>
        <option value="1h" className="dark:bg-slate-900">Last 1 Hour</option>
        <option value="6h" className="dark:bg-slate-900">Last 6 Hours</option>
        <option value="24h" className="dark:bg-slate-900">Last 24 Hours</option>
        <option value="7d" className="dark:bg-slate-900">Last 7 Days</option>
      </select>
    </div>
  );
};
