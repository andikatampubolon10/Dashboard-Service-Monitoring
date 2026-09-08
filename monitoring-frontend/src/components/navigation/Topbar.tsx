import React from 'react';
import { TimeRangePicker } from '../filters/TimeRangePicker';
import { AutoRefreshControl } from '../filters/AutoRefreshControl';
import { useTheme } from '../../context/ThemeContext';
import { useGlobalFilters } from '../../context/FilterContext';
import { useServers } from '../../hooks/useServers';
import { useServices } from '../../hooks/useServices';
import { Environment } from '../../types';
import { Sun, Moon, Filter } from 'lucide-react';

export const Topbar: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { filter, setEnvironment, setServerId, setServiceId } = useGlobalFilters();
  const { data: servers = [] } = useServers();
  const { data: services = [] } = useServices();

  return (
    <header className="h-14 bg-white dark:bg-[#0B0F19] border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between px-6 shrink-0 z-20 transition-colors duration-150 shadow-sm dark:shadow-none">
      {/* Left: Scope Filter Pill matching screenshot */}
      <div className="flex items-center">
        <div className="flex items-center bg-slate-100 dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs gap-3 shadow-inner dark:shadow-none">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold tracking-wide uppercase text-[10px]">
            <Filter className="w-3 h-3 text-slate-500 dark:text-slate-400" />
            <span>SCOPE</span>
          </div>

          <div className="h-3.5 w-px bg-slate-300 dark:bg-slate-700/60" />

          {/* Env Filter */}
          <select
            value={filter.environment}
            onChange={(e) => setEnvironment(e.target.value as Environment)}
            className="bg-transparent text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium focus:outline-none cursor-pointer text-xs"
          >
            <option value="all" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">All env</option>
            <option value="production" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">Production</option>
            <option value="staging" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">Staging</option>
          </select>

          {/* Server Filter */}
          <select
            value={filter.serverId}
            onChange={(e) => setServerId(e.target.value)}
            className="bg-transparent text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium focus:outline-none cursor-pointer text-xs"
          >
            <option value="all" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">All servers</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                {s.name}
              </option>
            ))}
          </select>

          {/* Service Filter */}
          <select
            value={filter.serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="bg-transparent text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium focus:outline-none cursor-pointer text-xs"
          >
            <option value="all" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">All services</option>
            {services.map((svc) => (
              <option key={svc.id} value={svc.id} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                {svc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right Controls: Time Range, Auto-Refresh & Theme Toggle */}
      <div className="flex items-center gap-2.5">
        <TimeRangePicker />
        <AutoRefreshControl />

        {/* Dark / Light Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition shadow-sm"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>
      </div>
    </header>
  );
};
