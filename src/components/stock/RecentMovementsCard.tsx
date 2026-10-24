import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { createColumnHelper } from '@tanstack/react-table'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { DataTable } from '../ui/data-table'
import type { DataTableFeatures } from '../ui/data-table-features'
import { EmptyState, ErrorState, LoadingState } from '../ui/states'
import { supabaseErrorMessage } from '../../lib/supabase'
import { formatDate, formatQuantity } from '../../lib/utils'
import { useAuth } from '../../hooks/useAuth'
import { useRecentMovements } from '../../hooks/useMovements'
import type { StockMovement } from '../../types/database'
import { MovementBadge } from './MovementBadge'

const NO_MOVEMENTS: StockMovement[] = []
const column = createColumnHelper<DataTableFeatures, StockMovement>()

function buildRecentColumns(userEmail: string) {
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
    column.display({
      id: 'user',
      header: 'Utilisateur',
      cell: () => <span title={userEmail}>{userEmail}</span>,
      meta: {
        headerClassName: 'hidden sm:table-cell',
        cellClassName: 'hidden max-w-40 truncate text-muted-foreground sm:table-cell',
      },
    }),
  ])
}

export interface RecentMovementsCardProps {
  limit?: number
  showHistoryLink?: boolean
}

export function RecentMovementsCard({ limit = 8, showHistoryLink = true }: RecentMovementsCardProps) {
  const recent = useRecentMovements(limit)
  const navigate = useNavigate()
  const { user } = useAuth()
  const userEmail = user?.email ?? '—'
  const columns = useMemo(() => buildRecentColumns(userEmail), [userEmail])

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Derniers mouvements</CardTitle>
          <CardDescription>Les {limit} dernières opérations enregistrées.</CardDescription>
        </div>
        {showHistoryLink ? (
          <Button variant="outline" size="sm" onClick={() => navigate('/historique')}>
            Voir l’historique
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {recent.isLoading ? (
          <LoadingState />
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
          <DataTable
            columns={columns}
            data={recent.data ?? NO_MOVEMENTS}
            getRowId={(movement) => movement.id}
          />
        )}
      </CardContent>
    </Card>
  )
}
