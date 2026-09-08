import React from 'react';
import { useGlobalFilters } from '../../context/FilterContext';
import { Environment } from '../../types';

export const GlobalFilter: React.FC = () => {
  const { filter, setEnvironment, setServerId, setServiceId } = useGlobalFilters();

  return (
    <div className="flex items-center gap-2">
      {/* Environment Dropdown */}
      <div className="flex items-center bg-slate-100 dark:bg-slate-800/90 rounded-lg px-2.5 py-1 border border-slate-200 dark:border-slate-700 text-xs shadow-sm">
        <span className="text-slate-500 dark:text-slate-400 mr-2 font-medium">Env:</span>
        <select
          value={filter.environment}
          onChange={(e) => setEnvironment(e.target.value as Environment)}
          className="bg-transparent text-slate-800 dark:text-white font-medium focus:outline-none cursor-pointer"
        >
          <option value="production" className="dark:bg-slate-900">Production</option>
          <option value="staging" className="dark:bg-slate-900">Staging</option>
          <option value="development" className="dark:bg-slate-900">Development</option>
          <option value="all" className="dark:bg-slate-900">All</option>
        </select>
      </div>

      {/* Server Dropdown */}
      <div className="flex items-center bg-slate-100 dark:bg-slate-800/90 rounded-lg px-2.5 py-1 border border-slate-200 dark:border-slate-700 text-xs shadow-sm">
        <span className="text-slate-500 dark:text-slate-400 mr-2 font-medium">Server:</span>
        <select
          value={filter.serverId}
          onChange={(e) => setServerId(e.target.value)}
          className="bg-transparent text-slate-800 dark:text-white font-medium focus:outline-none cursor-pointer"
        >
          <option value="all" className="dark:bg-slate-900">All Servers (4 Nodes)</option>
          <option value="prod-web-01" className="dark:bg-slate-900">prod-web-01 (jakarta-idc)</option>
          <option value="prod-web-02" className="dark:bg-slate-900">prod-web-02 (jakarta-idc)</option>
          <option value="staging-web-01" className="dark:bg-slate-900">staging-web-01 (surabaya-dr)</option>
          <option value="prod-db-01" className="dark:bg-slate-900">prod-db-01 (jakarta-idc)</option>
        </select>
      </div>

      {/* Service Dropdown */}
      <div className="flex items-center bg-slate-100 dark:bg-slate-800/90 rounded-lg px-2.5 py-1 border border-slate-200 dark:border-slate-700 text-xs shadow-sm">
        <span className="text-slate-500 dark:text-slate-400 mr-2 font-medium">Service:</span>
        <select
          value={filter.serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          className="bg-transparent text-slate-800 dark:text-white font-medium focus:outline-none cursor-pointer"
        >
          <option value="all" className="dark:bg-slate-900">All Services (7 Services)</option>
          <option value="identity-service" className="dark:bg-slate-900">Identity Service (srv-01)</option>
          <option value="audit-service" className="dark:bg-slate-900">Audit Service (srv-01)</option>
          <option value="medical-record-service" className="dark:bg-slate-900">Medical Record Service (srv-02)</option>
          <option value="health-profile-service" className="dark:bg-slate-900">Health Profile Service (srv-02)</option>
          <option value="live-consult-service" className="dark:bg-slate-900">Live Consult Service (srv-03)</option>
          <option value="lifestyle-service" className="dark:bg-slate-900">Lifestyle Service (srv-03)</option>
          <option value="ai-consultation-service" className="dark:bg-slate-900">AI Consultation Service (srv-04)</option>
        </select>
      </div>
    </div>
  );
};
