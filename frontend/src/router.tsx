import type { ComponentType } from 'react'
import { createBrowserRouter } from 'react-router'

import { PublicOnly, RequireAuth } from './auth/guards'
import { AppShell } from './components/AppShell'
import { BootScreen as Booting } from './components/ui'
import { RouteError } from './pages/NotFoundPage'

/** Route-level code splitting: each page is fetched the first time it is visited. */
function page<T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) {
  return async () => ({ Component: (await load())[name] as ComponentType })
}

export const router = createBrowserRouter([
  {
    path: '/login',
    HydrateFallback: Booting,
    errorElement: <RouteError />,
    lazy: async () => {
      const { LoginPage } = await import('./pages/AuthPages')
      return { Component: () => <PublicOnly><LoginPage /></PublicOnly> }
    },
  },
  {
    path: '/register',
    HydrateFallback: Booting,
    errorElement: <RouteError />,
    lazy: async () => {
      const { RegisterPage } = await import('./pages/AuthPages')
      return { Component: () => <PublicOnly><RegisterPage /></PublicOnly> }
    },
  },
  {
    path: '/',
    element: <RequireAuth><AppShell /></RequireAuth>,
    HydrateFallback: Booting,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: page(() => import('./pages/OverviewPage'), 'OverviewPage') },
      { path: 'bills', lazy: page(() => import('./pages/BillsPage'), 'BillsPage') },
      { path: 'bills/new', lazy: page(() => import('./pages/BillFormPage'), 'BillFormPage') },
      { path: 'bills/:id', lazy: page(() => import('./pages/BillDetailPage'), 'BillDetailPage') },
      { path: 'bills/:id/edit', lazy: page(() => import('./pages/BillFormPage'), 'BillFormPage') },
      { path: 'recurring', lazy: page(() => import('./pages/SchedulePages'), 'SchedulesPage') },
      { path: 'recurring/new', lazy: page(() => import('./pages/SchedulePages'), 'ScheduleFormPage') },
      { path: 'recurring/:id', lazy: page(() => import('./pages/SchedulePages'), 'ScheduleDetailPage') },
      { path: 'recurring/:id/edit', lazy: page(() => import('./pages/SchedulePages'), 'ScheduleFormPage') },
      { path: 'documents', lazy: page(() => import('./pages/DocumentsPage'), 'DocumentsPage') },
      { path: 'analytics', lazy: page(() => import('./pages/AnalyticsPage'), 'AnalyticsPage') },
      { path: 'providers', lazy: page(() => import('./pages/ReferenceDataPage'), 'ReferenceDataPage') },
      { path: 'notifications', lazy: page(() => import('./pages/NotificationsPage'), 'NotificationsPage') },
      { path: 'settings', lazy: page(() => import('./pages/SettingsPage'), 'SettingsPage') },
      { path: '*', lazy: page(() => import('./pages/NotFoundPage'), 'NotFoundPage') },
    ],
  },
], { basename: import.meta.env.BASE_URL })
