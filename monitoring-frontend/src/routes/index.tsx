import { createBrowserRouter, Navigate } from 'react-router-dom';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { OverviewPage } from '../pages/OverviewPage';
import { ServerListPage } from '../pages/servers/ServerListPage';
import { ServerDetailPage } from '../pages/servers/ServerDetailPage';
import { ServiceListPage } from '../pages/services/ServiceListPage';
import { ServiceDetailPage } from '../pages/services/ServiceDetailPage';
import { ServiceOverviewTab } from '../pages/services/ServiceOverviewTab';
import { ServiceRequestsTab } from '../pages/services/ServiceRequestsTab';
import { ServiceErrorsTab } from '../pages/services/ServiceErrorsTab';
import { ServiceLatencyTab } from '../pages/services/ServiceLatencyTab';
import { ServiceLogsTab } from '../pages/services/ServiceLogsTab';
import { ServiceDependenciesTab } from '../pages/services/ServiceDependenciesTab';
import { ServiceAlertsTab } from '../pages/services/ServiceAlertsTab';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      {
        index: true,
        element: <OverviewPage />,
      },
      {
        path: 'servers',
        element: <ServerListPage />,
      },
      {
        path: 'servers/:id',
        element: <ServerDetailPage />,
      },
      {
        path: 'services',
        element: <ServiceListPage />,
      },
      {
        path: 'services/:id',
        element: <ServiceDetailPage />,
        children: [
          {
            index: true,
            element: <ServiceOverviewTab />,
          },
          {
            path: 'requests',
            element: <ServiceRequestsTab />,
          },
          {
            path: 'errors',
            element: <ServiceErrorsTab />,
          },
          {
            path: 'latency',
            element: <ServiceLatencyTab />,
          },
          {
            path: 'logs',
            element: <ServiceLogsTab />,
          },
          {
            path: 'dependencies',
            element: <ServiceDependenciesTab />,
          },
          {
            path: 'alerts',
            element: <ServiceAlertsTab />,
          },
        ],
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
