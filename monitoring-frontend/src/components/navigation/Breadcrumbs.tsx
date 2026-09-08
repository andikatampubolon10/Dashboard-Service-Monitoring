import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  if (pathnames.length === 0) return null;

  return (
    <nav className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-4 font-medium select-none">
      <Link
        to="/"
        className="flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
      >
        <Home className="w-3.5 h-3.5" />
        <span>Overview</span>
      </Link>

      {pathnames.map((value, index) => {
        const to = `/${pathnames.slice(0, index + 1).join('/')}`;
        const isLast = index === pathnames.length - 1;

        return (
          <React.Fragment key={to}>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
            {isLast ? (
              <span className="text-cyan-600 dark:text-cyan-400 font-mono font-semibold">
                {decodeURIComponent(value)}
              </span>
            ) : (
              <Link
                to={to}
                className="hover:text-slate-900 dark:hover:text-white transition capitalize"
              >
                {decodeURIComponent(value)}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
