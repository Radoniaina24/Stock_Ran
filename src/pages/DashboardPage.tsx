import { ArrowDownToLine, ArrowUpFromLine, Boxes, Package, RefreshCw, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { ErrorState, TableSkeleton } from '../components/ui/states'
import { RecentMovementsCard } from '../components/stock/RecentMovementsCard'
import { useDashboard } from '../hooks/useDashboard'
import { supabaseErrorMessage } from '../lib/supabase'
import { formatQuantity } from '../lib/utils'

interface StatCardProps {
  label: string
  value: string
  hint: string
  icon: LucideIcon
  tone?: 'default' | 'success' | 'danger' | 'warning'
}

const TONES = {
  default: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
} as const

const TONE_TEXT = {
  default: 'text-foreground',
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
} as const

function StatCard({ label, value, hint, icon: Icon, tone = 'default' }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span className={`flex size-7 shrink-0 items-center justify-center rounded-md ${TONES[tone]}`}>
            <Icon className="size-4" />
          </span>
        </div>
        <p className={`mt-3 text-2xl font-semibold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const dashboard = useDashboard()
  const stats = dashboard.data?.stats

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Vue d’ensemble de votre stock et des derniers mouvements."
        actions={
          <Button
            variant="outline"
            onClick={() => void dashboard.refetch()}
            disabled={dashboard.isFetching}
          >
            <RefreshCw className={dashboard.isFetching ? 'size-4 animate-spin' : 'size-4'} />
            Actualiser
          </Button>
        }
      />

      {dashboard.isLoading ? (
        <TableSkeleton rows={3} columns={5} />
      ) : dashboard.isError ? (
        <ErrorState
          message={supabaseErrorMessage(dashboard.error)}
          onRetry={() => void dashboard.refetch()}
        />
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Produits actifs"
            value={String(stats.activeProducts)}
            hint="Produits non archivés"
            icon={Package}
          />
          <StatCard
            label="Quantité totale en stock"
            value={formatQuantity(stats.totalQuantity)}
            hint="Somme des quantités disponibles"
            icon={Boxes}
          />
          <StatCard
            label="Produits en stock faible"
            value={String(stats.lowStockProducts)}
            hint="Quantité ≤ seuil d’alerte"
            icon={TriangleAlert}
            tone={stats.lowStockProducts > 0 ? 'warning' : 'default'}
          />
          <StatCard
            label="Entrées aujourd’hui"
            value={String(stats.entriesToday)}
            hint="Mouvements d’entrée du jour"
            icon={ArrowDownToLine}
            tone="success"
          />
          <StatCard
            label="Sorties aujourd’hui"
            value={String(stats.exitsToday)}
            hint="Mouvements de sortie du jour"
            icon={ArrowUpFromLine}
            tone="danger"
          />
        </div>
      ) : null}

      <div className="mt-4">
        <RecentMovementsCard limit={6} />
      </div>
    </>
  )
}
