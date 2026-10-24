import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { LoginPage } from '../pages/LoginPage'
import { ProtectedRoute } from './guards'

const DashboardPage = lazy(() =>
  import('../pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
)
const ProductsPage = lazy(() =>
  import('../pages/ProductsPage').then((module) => ({ default: module.ProductsPage })),
)
const MovementsPage = lazy(() =>
  import('../pages/MovementsPage').then((module) => ({ default: module.MovementsPage })),
)
const HistoryPage = lazy(() =>
  import('../pages/HistoryPage').then((module) => ({ default: module.HistoryPage })),
)
const SettingsPage = lazy(() =>
  import('../pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'produits', element: <ProductsPage /> },
          { path: 'mouvements', element: <MovementsPage /> },
          { path: 'historique', element: <HistoryPage /> },
          { path: 'parametres', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
