import { useMemo, useState, type MouseEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createColumnHelper } from '@tanstack/react-table'
import { Eye, Plus, RotateCcw } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { DataTable } from '../components/ui/data-table'
import type { DataTableFeatures } from '../components/ui/data-table-features'
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/states'
import { Input } from '../components/ui/input'
import { Pagination } from '../components/ui/pagination'
import { SearchInput } from '../components/ui/search-input'
import { Select } from '../components/ui/select'
import { SaleDetailsDialog } from '../components/sales/SaleDetailsDialog'
import { SaleFormDialog } from '../components/sales/SaleFormDialog'
import { PaymentStatusBadge, SaleStatusBadge } from '../components/sales/status-badges'
import { useSales } from '../hooks/useSales'
import { useDebounce } from '../hooks/useDebounce'
import { supabaseErrorMessage } from '../lib/supabase'
import { cn, formatAmount, formatDate } from '../lib/utils'
import { EMPTY_SALE_FILTERS, type SaleBalance, type SaleFilters } from '../types/database'

type StatusView = 'all' | 'validated' | 'cancelled'
type PaymentView = 'all' | 'unpaid' | 'partial' | 'paid'

const STATUS_OPTIONS: { value: StatusView; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'validated', label: 'Validées' },
  { value: 'cancelled', label: 'Annulées' },
]

const PAYMENT_OPTIONS: { value: PaymentView; label: string }[] = [
  { value: 'all', label: 'Tous paiements' },
  { value: 'unpaid', label: 'Non payées' },
  { value: 'partial', label: 'Partielles' },
  { value: 'paid', label: 'Payées' },
]

const NO_SALES: SaleBalance[] = []
const column = createColumnHelper<DataTableFeatures, SaleBalance>()

const stopPropagation = (event: MouseEvent) => event.stopPropagation()

function buildColumns(onView: (sale: SaleBalance) => void) {
  return column.columns([
    column.accessor('reference', {
      header: 'Vente',
      cell: ({ row }) => {
        const sale = row.original
        return (
          <div className="min-w-0">
            <p className="truncate font-mono font-medium text-foreground">{sale.reference}</p>
            <p className="truncate text-xs text-muted-foreground">
              {sale.client_name ?? 'Client supprimé'}
              {sale.client_code ? ` · ${sale.client_code}` : ''}
            </p>
          </div>
        )
      },
      meta: { cellClassName: 'w-full max-w-0' },
    }),
    column.accessor('sale_date', {
      header: 'Date',
      cell: (info) => <span className="whitespace-nowrap tabular-nums">{formatDate(info.getValue())}</span>,
    }),
    column.accessor('total_amount', {
      header: 'Montant',
      cell: (info) => (
        <span className="font-medium tabular-nums text-foreground">{formatAmount(info.getValue())}</span>
      ),
    }),
    column.accessor('paid_amount', {
      header: 'Encaissé',
      cell: (info) => (
        <span className="tabular-nums text-muted-foreground">{formatAmount(info.getValue())}</span>
      ),
      meta: {
        headerClassName: 'hidden @3xl:table-cell',
        cellClassName: 'hidden tabular-nums @3xl:table-cell',
      },
    }),
    column.accessor('balance_due', {
      header: 'Reste dû',
      cell: (info) => {
        const value = Number(info.getValue())
        if (value <= 0) return <span className="text-muted-foreground">—</span>
        return <span className="font-medium tabular-nums text-danger">{formatAmount(value)}</span>
      },
    }),
    column.accessor('payment_status', {
      header: 'Paiement',
      cell: (info) => <PaymentStatusBadge status={info.getValue()} />,
      meta: {
        headerClassName: 'hidden @4xl:table-cell',
        cellClassName: 'hidden @4xl:table-cell',
      },
    }),
    column.accessor('status', {
      header: 'Statut',
      cell: (info) => <SaleStatusBadge status={info.getValue()} />,
      meta: {
        headerClassName: 'hidden @5xl:table-cell',
        cellClassName: 'hidden @5xl:table-cell',
      },
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
        </div>
      ),
      meta: { headerClassName: 'w-px', cellClassName: 'py-2' },
    }),
  ])
}

export function SalesPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusView>('all')
  const [paymentStatus, setPaymentStatus] = useState<PaymentView>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const [formOpen, setFormOpen] = useState(false)
  const [details, setDetails] = useState<SaleBalance | null>(null)

  const initialClientId = searchParams.get('client') ?? ''

  const debouncedSearch = useDebounce(search, 300)

  const filters = useMemo<SaleFilters>(
    () => ({
      ...EMPTY_SALE_FILTERS,
      search: debouncedSearch,
      status,
      paymentStatus,
      clientId: initialClientId,
      from,
      to,
    }),
    [debouncedSearch, status, paymentStatus, initialClientId, from, to],
  )

  const sales = useSales(filters, page, pageSize)

  const rows = sales.data?.data ?? NO_SALES
  const total = sales.data?.total ?? 0

  const columns = useMemo(() => buildColumns(setDetails), [])

  const hasFilters =
    Boolean(debouncedSearch) ||
    status !== 'all' ||
    paymentStatus !== 'all' ||
    Boolean(from) ||
    Boolean(to) ||
    Boolean(initialClientId)

  const resetFilters = () => {
    setSearch('')
    setStatus('all')
    setPaymentStatus('all')
    setFrom('')
    setTo('')
    setPage(1)
    if (initialClientId) {
      const next = new URLSearchParams(searchParams)
      next.delete('client')
      setSearchParams(next, { replace: true })
    }
  }

  const openCreate = () => setFormOpen(true)

  return (
    <div className="w-full">
      <PageHeader
        title="Ventes"
        description="Créez des ventes, suivez les encaissements et le stock restant dû."
        actions={
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="size-4" />
            Nouvelle vente
          </Button>
        }
      />

      <Card className="@container overflow-hidden rounded-xl">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex flex-col gap-2 @3xl:flex-row @3xl:items-center">
            <SearchInput
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              onClear={() => {
                setSearch('')
                setPage(1)
              }}
              placeholder="Rechercher une référence ou un client…"
              className="min-w-0 @3xl:flex-1"
              aria-label="Rechercher une vente"
            />

            <div className="grid grid-cols-1 gap-2 @xs:grid-cols-2 @3xl:flex @3xl:shrink-0">
              <Select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as StatusView)
                  setPage(1)
                }}
                aria-label="Filtrer par statut"
                className="min-w-0 @3xl:w-32"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>

              <Select
                value={paymentStatus}
                onChange={(event) => {
                  setPaymentStatus(event.target.value as PaymentView)
                  setPage(1)
                }}
                aria-label="Filtrer par paiement"
                className="min-w-0 @3xl:w-40"
              >
                {PAYMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0">
              <label htmlFor="sale-from" className="mb-1 block text-xs text-muted-foreground">
                Du
              </label>
              <Input
                id="sale-from"
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value)
                  setPage(1)
                }}
                className="w-full @3xl:w-40"
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="sale-to" className="mb-1 block text-xs text-muted-foreground">
                Au
              </label>
              <Input
                id="sale-to"
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value)
                  setPage(1)
                }}
                className="w-full @3xl:w-40"
              />
            </div>
            {hasFilters ? (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <RotateCcw className="size-3.5" />
                Réinitialiser
              </Button>
            ) : null}
          </div>
        </div>

        {sales.isLoading ? (
          <TableSkeleton rows={6} columns={6} />
        ) : sales.isError ? (
          <ErrorState
            message={supabaseErrorMessage(sales.error)}
            onRetry={() => void sales.refetch()}
          />
        ) : rows.length === 0 ? (
          hasFilters ? (
            <EmptyState
              title="Aucune vente ne correspond à vos filtres."
              description="Modifiez la recherche ou réinitialisez les filtres."
              action={
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Réinitialiser les filtres
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Aucune vente enregistrée."
              description="Créez votre première vente : le stock et les créances sont gérés automatiquement."
              icon={<Plus className="size-5" />}
              action={
                <Button size="sm" onClick={openCreate}>
                  <Plus className="size-4" />
                  Nouvelle vente
                </Button>
              }
            />
          )
        ) : (
          <>
            <div
              className={cn('transition-opacity', sales.isPlaceholderData && 'pointer-events-none opacity-60')}
              aria-busy={sales.isFetching}
            >
              <DataTable
                columns={columns}
                data={rows}
                getRowId={(sale) => sale.id}
                onRowClick={setDetails}
              />
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      {formOpen ? (
        <SaleFormDialog
          initialClientId={initialClientId || undefined}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      <SaleDetailsDialog sale={details} onClose={() => setDetails(null)} />
    </div>
  )
}
