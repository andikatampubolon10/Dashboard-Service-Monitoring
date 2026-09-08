import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/navigation/Sidebar';
import { Topbar } from '../components/navigation/Topbar';
import { Breadcrumbs } from '../components/navigation/Breadcrumbs';

export const DashboardLayout: React.FC = () => {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-150">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Shell Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <Topbar />

        {/* Scrollable Page Outlet */}
        <main className="flex-1 overflow-y-auto p-6">
          <Breadcrumbs />
          <Outlet />
        </main>
      </div>
    </div>
  );
};
