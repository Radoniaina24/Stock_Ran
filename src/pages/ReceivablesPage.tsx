import { useMemo, useState, type MouseEvent } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Banknote, Eye, HandCoins, Users } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { StatCard, StatCardSkeleton } from '../components/dashboard/StatCard'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { DataTable } from '../components/ui/data-table'
import type { DataTableFeatures } from '../components/ui/data-table-features'
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/states'
import { PaymentFormDialog } from '../components/sales/PaymentFormDialog'
import { SaleDetailsDialog } from '../components/sales/SaleDetailsDialog'
import { PaymentStatusBadge } from '../components/sales/status-badges'
import { useOpenSales } from '../hooks/useSales'
import { supabaseErrorMessage } from '../lib/supabase'
import { cn, formatAmount, formatDate, formatQuantity } from '../lib/utils'
import type { SaleBalance } from '../types/database'

const NO_SALES: SaleBalance[] = []
const column = createColumnHelper<DataTableFeatures, SaleBalance>()

const stopPropagation = (event: MouseEvent) => event.stopPropagation()

function buildColumns(
  onView: (sale: SaleBalance) => void,
  onCollect: (sale: SaleBalance) => void,
) {
  return column.columns([
    column.accessor('client_name', {
      header: 'Client',
      cell: ({ row }) => {
        const sale = row.original
        return (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {sale.client_name ?? 'Client supprimé'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {sale.client_code ? <span className="font-mono">{sale.client_code}</span> : null}
            </p>
          </div>
        )
      },
      meta: { cellClassName: 'w-full max-w-0' },
    }),
    column.accessor('reference', {
      header: 'Vente',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-foreground">{row.original.reference}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatDate(row.original.sale_date)}
          </p>
        </div>
      ),
    }),
    column.accessor('total_amount', {
      header: 'Montant',
      cell: (info) => (
        <span className="tabular-nums text-muted-foreground">{formatAmount(info.getValue())}</span>
      ),
      meta: {
        headerClassName: 'hidden @3xl:table-cell',
        cellClassName: 'hidden tabular-nums @3xl:table-cell',
      },
    }),
    column.accessor('paid_amount', {
      header: 'Encaissé',
      cell: (info) => (
        <span className="tabular-nums text-muted-foreground">{formatAmount(info.getValue())}</span>
      ),
      meta: {
        headerClassName: 'hidden @4xl:table-cell',
        cellClassName: 'hidden tabular-nums @4xl:table-cell',
      },
    }),
    column.accessor('balance_due', {
      header: 'Reste dû',
      cell: (info) => (
        <span className="font-semibold tabular-nums text-danger">{formatAmount(info.getValue())}</span>
      ),
    }),
    column.accessor('payments_count', {
      header: 'Paiements',
      cell: (info) => (
        <span className="tabular-nums text-muted-foreground">{formatQuantity(info.getValue())}</span>
      ),
      meta: {
        headerClassName: 'hidden @5xl:table-cell',
        cellClassName: 'hidden tabular-nums @5xl:table-cell',
      },
    }),
    column.display({
      id: 'status',
      header: 'Statut',
      cell: ({ row }) => <PaymentStatusBadge status={row.original.payment_status} />,
      meta: { headerClassName: 'hidden @2xl:table-cell', cellClassName: 'hidden @2xl:table-cell' },
    }),
    column.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-0.5" onClick={stopPropagation}>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title="Voir les détails"
            aria-label={`Voir les détails de la vente ${row.original.reference}`}
            onClick={() => onView(row.original)}
          >
            <Eye className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title="Encaisser"
            aria-label={`Encaisser la vente ${row.original.reference}`}
            onClick={() => onCollect(row.original)}
          >
            <Banknote className="size-4" />
          </Button>
        </div>
      ),
      meta: { headerClassName: 'w-px', cellClassName: 'py-2' },
    }),
  ])
}

export function ReceivablesPage() {
  const openSales = useOpenSales()
  const [details, setDetails] = useState<SaleBalance | null>(null)
  const [collecting, setCollecting] = useState<SaleBalance | null>(null)

  const rows = openSales.data ?? NO_SALES
  const columns = useMemo(() => buildColumns(setDetails, setCollecting), [])

  const totals = useMemo(() => {
    const balance = rows.reduce((sum, sale) => sum + Number(sale.balance_due ?? 0), 0)
    const clients = new Set(rows.map((sale) => sale.client_id))
    const paid = rows.reduce((sum, sale) => sum + Number(sale.paid_amount ?? 0), 0)
    return { balance, clients: clients.size, paid, count: rows.length }
  }, [rows])

  return (
    <div className="w-full">
      <PageHeader
        title="Créances clients"
        description="Ventes réglées partiellement ou pas encore : suivez ce qu’il reste à encaisser."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 @md:grid-cols-3">
        {openSales.isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Total à recouvrer"
              value={formatAmount(totals.balance)}
              icon={HandCoins}
              tone="danger"
              footer={`${totals.count} vente${totals.count > 1 ? 's' : ''} ouverte${totals.count > 1 ? 's' : ''}`}
            />
            <StatCard
              label="Clients concernés"
              value={formatQuantity(totals.clients)}
              icon={Users}
              tone="warning"
              footer="Un même client peut avoir plusieurs ventes"
            />
            <StatCard
              label="Déjà encaissé"
              value={formatAmount(totals.paid)}
              icon={Banknote}
              tone="success"
              footer="Sur les ventes encore ouvertes"
            />
          </>
        )}
      </div>

      <Card className="@container overflow-hidden rounded-xl">
        {openSales.isLoading ? (
          <TableSkeleton rows={6} columns={6} />
        ) : openSales.isError ? (
          <ErrorState
            message={supabaseErrorMessage(openSales.error)}
            onRetry={() => void openSales.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Aucune créance en cours."
            description="Toutes vos ventes sont réglées : rien à recouvrer pour le moment."
            icon={<HandCoins className="size-5" />}
          />
        ) : (
          <div className={cn('transition-opacity')} aria-busy={openSales.isFetching}>
            <DataTable
              columns={columns}
              data={rows}
              getRowId={(sale) => sale.id}
              onRowClick={setDetails}
            />
          </div>
        )}
      </Card>

      <SaleDetailsDialog sale={details} onClose={() => setDetails(null)} />

      {collecting ? (
        <PaymentFormDialog sale={collecting} onClose={() => setCollecting(null)} />
      ) : null}
    </div>
  )
}
