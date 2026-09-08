import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, Server, Network, Activity, Zap } from 'lucide-react';

export const Sidebar: React.FC = () => {

  return (
    <aside className="w-60 bg-white dark:bg-[#0B0F19] border-r border-slate-200 dark:border-slate-800/80 flex flex-col justify-between shrink-0 select-none z-30 transition-colors duration-150 shadow-sm dark:shadow-none">
      <div className="overflow-y-auto">
        {/* Logo & Brand */}
        <div className="p-5 pb-4 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 border border-orange-500/30 dark:border-orange-500/40 text-orange-600 dark:text-orange-500 flex items-center justify-center font-bold shadow-sm shadow-orange-500/10 group-hover:scale-105 transition">
              <Activity className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-white tracking-tight leading-tight">
                Pulse Monitor
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold tracking-wider uppercase mt-0.5">
                OBSERVABILITY
              </div>
            </div>
          </Link>
        </div>

        {/* Navigation Sections */}
        <div className="px-3 py-3 space-y-6">
          {/* Section 1: OVERVIEW */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-3 mb-2">
              OVERVIEW
            </div>
            <nav className="space-y-1">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                    isActive
                      ? 'bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30 font-semibold shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                  }`
                }
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </NavLink>
            </nav>
          </div>

          {/* Section 2: INFRASTRUCTURE */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-3 mb-2">
              INFRASTRUCTURE
            </div>
            <nav className="space-y-1">
              <NavLink
                to="/servers"
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                    isActive
                      ? 'bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30 font-semibold shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                  }`
                }
              >
                <Server className="w-4 h-4" />
                <span>Servers</span>
              </NavLink>

              <NavLink
                to="/services"
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                    isActive
                      ? 'bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30 font-semibold shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                  }`
                }
              >
                <Network className="w-4 h-4" />
                <span>Services</span>
              </NavLink>

              {/* Dedicated Full Page Stress Test Link under Services */}
              <NavLink
                to="/stress-test"
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                    isActive
                      ? 'bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30 font-semibold shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                  }`
                }
              >
                <Zap className="w-4 h-4 text-orange-500" />
                <span>Stress Test</span>
              </NavLink>
            </nav>
          </div>
        </div>
      </div>

      {/* Datasource / Footer */}
      <div className="p-4 text-[11px] text-slate-400 dark:text-slate-500 font-mono select-none border-t border-slate-100 dark:border-transparent">
        MockMonitoringProvider &middot; v1.0
      </div>
    </aside>
  );
};

