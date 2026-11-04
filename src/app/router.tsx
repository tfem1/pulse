import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from '@/components/layout/AppLayout';
import { RouteError } from '@/components/RouteError';
import { AlertsPage } from '@/pages/AlertsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { NetworkPage } from '@/pages/NetworkPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PerformancePage } from '@/pages/performance/PerformancePage';
import { ProcessesPage } from '@/pages/processes/ProcessesPage';
import { SensorsPage } from '@/pages/SensorsPage';
import { AboutTab } from '@/pages/settings/AboutTab';
import { AppearanceTab } from '@/pages/settings/AppearanceTab';
import { DataTab } from '@/pages/settings/DataTab';
import { MonitoringTab } from '@/pages/settings/MonitoringTab';
import { NotificationsTab } from '@/pages/settings/NotificationsTab';
import { ProcessesTab } from '@/pages/settings/ProcessesTab';
import { SettingsLayout } from '@/pages/settings/SettingsLayout';
import { StoragePage } from '@/pages/StoragePage';

/**
 * Route map. Every top-level section is its own page; Settings has nested
 * routes, one per sub-tab (/settings/appearance, /settings/monitoring, ...).
 * Tauri serves index.html for unknown asset paths, so deep links and reloads
 * work with real (non-hash) URLs.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'performance', element: <PerformancePage /> },
      { path: 'processes', element: <ProcessesPage /> },
      { path: 'storage', element: <StoragePage /> },
      { path: 'network', element: <NetworkPage /> },
      { path: 'sensors', element: <SensorsPage /> },
      { path: 'alerts', element: <AlertsPage /> },
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="appearance" replace /> },
          { path: 'appearance', element: <AppearanceTab /> },
          { path: 'monitoring', element: <MonitoringTab /> },
          { path: 'processes', element: <ProcessesTab /> },
          { path: 'notifications', element: <NotificationsTab /> },
          { path: 'data', element: <DataTab /> },
          { path: 'about', element: <AboutTab /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
