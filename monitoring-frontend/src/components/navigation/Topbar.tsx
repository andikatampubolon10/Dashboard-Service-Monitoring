import React from 'react';
import { TimeRangePicker } from '../filters/TimeRangePicker';
import { AutoRefreshControl } from '../filters/AutoRefreshControl';
import { useTheme } from '../../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export const Topbar: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="h-14 bg-white dark:bg-[#0B0F19] border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between px-6 shrink-0 z-20 transition-colors duration-150 shadow-sm dark:shadow-none">
      {/* Left spacer */}
      <div />

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
