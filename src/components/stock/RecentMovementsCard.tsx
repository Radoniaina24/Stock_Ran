import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { createColumnHelper } from '@tanstack/react-table'
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Scale } from 'lucide-react'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { DataTable } from '../ui/data-table'
import type { DataTableFeatures } from '../ui/data-table-features'
import { Skeleton, SkeletonGroup } from '../ui/skeleton'
import { EmptyState, ErrorState } from '../ui/states'
import { supabaseErrorMessage } from '../../lib/supabase'
import { cn, formatDate, formatQuantity } from '../../lib/utils'
import { useUserLabel, type UserLabel } from '../../hooks/useWorkspaceUsers'
import { useRecentMovements } from '../../hooks/useMovements'
import type { StockMovement } from '../../types/database'
import { MovementBadge } from './MovementBadge'

const NO_MOVEMENTS: StockMovement[] = []
const column = createColumnHelper<DataTableFeatures, StockMovement>()

function buildRecentColumns(userLabel: UserLabel) {
  return column.columns([
    column.accessor('created_at', {
      header: 'Date et heure',
      cell: (info) => formatDate(info.getValue()),
      meta: { cellClassName: 'whitespace-nowrap text-muted-foreground' },
    }),
    column.accessor('product_name', {
      header: 'Produit',
      cell: ({ row }) => (
        <>
          {row.original.product_name}
          <span className="ms-2 font-mono text-xs text-muted-foreground">
            {row.original.product_reference}
          </span>
        </>
      ),
      meta: { cellClassName: 'font-medium' },
    }),
    column.accessor('type', {
      header: 'Type',
      cell: (info) => <MovementBadge type={info.getValue()} />,
    }),
    column.accessor('quantity', {
      header: 'Quantité',
      cell: (info) => formatQuantity(info.getValue()),
      meta: { headerClassName: 'text-end', cellClassName: 'text-end font-medium' },
    }),
    column.accessor('reason', {
      header: 'Motif',
      meta: { cellClassName: 'text-muted-foreground' },
    }),
    column.accessor('created_by', {
      header: 'Utilisateur',
      cell: (info) => {
        const label = userLabel(info.getValue())
        return <span title={label}>{label}</span>
      },
      meta: {
        headerClassName: 'hidden sm:table-cell',
        cellClassName: 'hidden max-w-40 truncate text-muted-foreground sm:table-cell',
      },
    }),
  ])
}

const DELTA_STYLES = {
  entry: { className: 'bg-success-soft text-success', icon: ArrowDownLeft },
  exit: { className: 'bg-danger-soft text-danger', icon: ArrowUpRight },
  adjustment: { className: 'bg-primary-soft text-primary', icon: Scale },
} as const

function MovementListItem({ movement }: { movement: StockMovement }) {
  const delta = Number(movement.quantity_after) - Number(movement.quantity_before)
  const style = DELTA_STYLES[movement.type]
  const Icon = style.icon

  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', style.className)}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{movement.product_name}</p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-mono">{movement.product_reference}</span>
          <span aria-hidden="true"> · </span>
          {formatDate(movement.created_at)}
        </p>
      </div>
      <div className="shrink-0 text-end">
        <p
          className={cn(
            'text-sm font-semibold tabular-nums',
            delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-foreground',
          )}
        >
          {delta > 0 ? '+' : delta < 0 ? '−' : ''}
          {formatQuantity(Math.abs(delta))}
        </p>
        <p className="max-w-28 truncate text-xs capitalize text-muted-foreground">{movement.reason}</p>
      </div>
    </li>
  )
}

function RecentMovementsSkeleton({ rows }: { rows: number }) {
  return (
    <SkeletonGroup label="Chargement des mouvements…">
      <div className="space-y-4 md:hidden">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
            <div className="space-y-2">
              <Skeleton className="ms-auto h-3.5 w-10" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-lg border border-border md:block">
        <div className="flex gap-4 bg-muted/60 px-3 py-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-3 flex-1 bg-muted" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-border px-3 py-3.5">
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 flex-1" />
            <div className="flex-1">
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 flex-1" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  )
}

export interface RecentMovementsCardProps {
  limit?: number
  showHistoryLink?: boolean
}

export function RecentMovementsCard({ limit = 8, showHistoryLink = true }: RecentMovementsCardProps) {
  const recent = useRecentMovements(limit)
  const navigate = useNavigate()
  const userLabel = useUserLabel()
  const columns = useMemo(() => buildRecentColumns(userLabel), [userLabel])

  return (
    <Card className="rounded-xl">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle>Derniers mouvements</CardTitle>
          <CardDescription>Les {limit} dernières opérations enregistrées.</CardDescription>
        </div>
        {showHistoryLink ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => navigate('/historique')}
          >
            <span className="sm:hidden">Historique</span>
            <span className="hidden sm:inline">Voir l’historique</span>
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {recent.isLoading ? (
          <RecentMovementsSkeleton rows={Math.min(limit, 6)} />
        ) : recent.isError ? (
          <ErrorState
            message={supabaseErrorMessage(recent.error)}
            onRetry={() => void recent.refetch()}
          />
        ) : (recent.data ?? []).length === 0 ? (
          <EmptyState
            title="Aucun mouvement enregistré."
            description="Les entrées et sorties apparaîtront ici."
          />
        ) : (
          <div className="animate-fade-in">
            <ul className="divide-y divide-border md:hidden">
              {(recent.data ?? NO_MOVEMENTS).map((movement) => (
                <MovementListItem key={movement.id} movement={movement} />
              ))}
            </ul>
            <div className="hidden overflow-hidden rounded-lg border border-border md:block">
              <DataTable
                columns={columns}
                data={recent.data ?? NO_MOVEMENTS}
                getRowId={(movement) => movement.id}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
