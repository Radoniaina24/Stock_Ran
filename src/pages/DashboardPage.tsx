import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Boxes,
  Package,
  Plus,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { SkeletonGroup } from '../components/ui/skeleton'
import { ErrorState } from '../components/ui/states'
import { ActivityChart, ActivityChartSkeleton } from '../components/dashboard/ActivityChart'
import { StatCard, StatCardSkeleton } from '../components/dashboard/StatCard'
import { StockAlertsCard, StockAlertsSkeleton } from '../components/dashboard/StockAlertsCard'
import { RecentMovementsCard } from '../components/stock/RecentMovementsCard'
import { useDashboard } from '../hooks/useDashboard'
import { ACTIVITY_DAYS } from '../services/dashboard'
import { supabaseErrorMessage } from '../lib/supabase'
import { cn } from '../lib/utils'

const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 })
const todayFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' })
const timeFormat = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' })

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function DashboardSkeleton() {
  return (
    <SkeletonGroup label="Chargement du tableau de bord…" className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActivityChartSkeleton />
        </div>
        <StockAlertsSkeleton />
      </div>
    </SkeletonGroup>
  )
}

export function DashboardPage() {
  const dashboard = useDashboard()
  const navigate = useNavigate()
  const [today] = useState(() => capitalize(todayFormat.format(new Date())))
  const data = dashboard.data
  const stats = data?.stats
  const isRefreshing = dashboard.isFetching && !dashboard.isLoading

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Tableau de bord"
        description={`${today} · Vue d’ensemble de votre stock.`}
        actions={
          <>
            {dashboard.dataUpdatedAt ? (
              <span className="hidden text-xs text-muted-foreground lg:inline" aria-live="polite">
                {isRefreshing
                  ? 'Mise à jour…'
                  : `Mis à jour à ${timeFormat.format(dashboard.dataUpdatedAt)}`}
              </span>
            ) : null}
            <Button
              variant="outline"
              onClick={() => void dashboard.refetch()}
              disabled={dashboard.isFetching}
              aria-label="Actualiser le tableau de bord"
            >
              <RefreshCw className={cn('size-4', dashboard.isFetching && 'animate-spin')} />
              <span className="hidden sm:inline">Actualiser</span>
            </Button>
            <Button onClick={() => navigate('/mouvements')} className="flex-1 sm:flex-none">
              <Plus className="size-4" />
              Nouveau mouvement
            </Button>
          </>
        }
      />

      {dashboard.isLoading ? (
        <DashboardSkeleton />
      ) : dashboard.isError ? (
        <Card className="rounded-xl">
          <ErrorState
            message={supabaseErrorMessage(dashboard.error)}
            onRetry={() => void dashboard.refetch()}
          />
        </Card>
      ) : stats && data ? (
        <div
          className={cn(
            'animate-fade-in space-y-4 transition-opacity sm:space-y-6',
            isRefreshing && 'opacity-70',
          )}
        >
          <section aria-label="Indicateurs clés" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard
              label="Produits actifs"
              value={numberFormat.format(stats.activeProducts)}
              icon={Package}
              tone="primary"
              to="/produits"
              footer="Références non archivées"
            />
            <StatCard
              label="Quantité en stock"
              value={numberFormat.format(stats.totalQuantity)}
              icon={Boxes}
              tone="violet"
              to="/produits"
              footer="Toutes références confondues"
            />
            <StatCard
              label="Alertes de stock"
              value={numberFormat.format(stats.lowStockProducts)}
              icon={TriangleAlert}
              tone={stats.outOfStockProducts > 0 ? 'danger' : stats.lowStockProducts > 0 ? 'warning' : 'success'}
              to="/produits?stock=faible"
              footer={
                stats.outOfStockProducts > 0 ? (
                  <span className="font-medium text-danger">
                    dont {stats.outOfStockProducts} en rupture
                  </span>
                ) : stats.lowStockProducts > 0 ? (
                  'Sous le seuil d’alerte'
                ) : (
                  <span className="text-success">Aucune alerte</span>
                )
              }
            />
            <StatCard
              label="Mouvements du jour"
              value={numberFormat.format(stats.entriesToday + stats.exitsToday)}
              icon={ArrowLeftRight}
              tone="primary"
              to="/historique"
              footer={
                <>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-success-soft px-1.5 py-0.5 font-medium text-success">
                    <ArrowDownLeft className="size-3" aria-hidden="true" />
                    {stats.entriesToday}
                    <span className="sr-only"> entrées</span>
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-danger-soft px-1.5 py-0.5 font-medium text-danger">
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                    {stats.exitsToday}
                    <span className="sr-only"> sorties</span>
                  </span>
                </>
              }
            />
          </section>

          <section aria-label="Activité et alertes" className="grid gap-4 sm:gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <ActivityChart data={data.activity} days={ACTIVITY_DAYS} />
            </div>
            <StockAlertsCard alerts={data.alerts} total={stats.lowStockProducts} />
          </section>
        </div>
      ) : null}

      <div className="mt-4 sm:mt-6">
        <RecentMovementsCard limit={6} />
      </div>
    </div>
  )
}
