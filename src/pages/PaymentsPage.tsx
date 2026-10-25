import { useMemo, useState, type MouseEvent } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Ban, Eye, RotateCcw } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { DataTable } from '../components/ui/data-table'
import type { DataTableFeatures } from '../components/ui/data-table-features'
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/states'
import { Input } from '../components/ui/input'
import { Pagination } from '../components/ui/pagination'
import { SearchInput } from '../components/ui/search-input'
import { Select } from '../components/ui/select'
import { useToast } from '../components/ui/toast'
import { SaleDetailsDialog } from '../components/sales/SaleDetailsDialog'
import {
  PaymentMethodBadge,
  PaymentRecordStatusBadge,
} from '../components/sales/status-badges'
import { usePaymentMutations, usePayments } from '../hooks/usePayments'
import { useSale } from '../hooks/useSales'
import { useDebounce } from '../hooks/useDebounce'
import { supabaseErrorMessage } from '../lib/supabase'
import { cn, formatAmount, formatDate } from '../lib/utils'
import {
  EMPTY_PAYMENT_FILTERS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PaymentFilters,
  type PaymentRow,
} from '../types/database'

type MethodView = 'all' | (typeof PAYMENT_METHODS)[number]

const METHOD_OPTIONS: { value: MethodView; label: string }[] = [
  { value: 'all', label: 'Tous les moyens' },
  ...PAYMENT_METHODS.map((method) => ({
    value: method as MethodView,
    label: PAYMENT_METHOD_LABELS[method],
  })),
]

const NO_PAYMENTS: PaymentRow[] = []
const column = createColumnHelper<DataTableFeatures, PaymentRow>()

const stopPropagation = (event: MouseEvent) => event.stopPropagation()

function buildColumns(
  onView: (payment: PaymentRow) => void,
  onCancel: (payment: PaymentRow) => void,
) {
  return column.columns([
    column.accessor('reference', {
      header: 'Paiement',
      cell: ({ row }) => {
        const payment = row.original
        return (
          <div className="min-w-0">
            <p className="truncate font-mono font-medium text-foreground">{payment.reference}</p>
            <p className="truncate text-xs text-muted-foreground">
              {payment.sale_reference ? `Vente ${payment.sale_reference}` : 'Vente annulée'}
              {payment.client_name ? ` · ${payment.client_name}` : ''}
            </p>
          </div>
        )
      },
      meta: { cellClassName: 'w-full max-w-0' },
    }),
    column.accessor('paid_at', {
      header: 'Date',
      cell: (info) => <span className="whitespace-nowrap tabular-nums">{formatDate(info.getValue())}</span>,
    }),
    column.accessor('payment_method', {
      header: 'Moyen',
      cell: (info) => <PaymentMethodBadge method={info.getValue()} />,
      meta: {
        headerClassName: 'hidden @4xl:table-cell',
        cellClassName: 'hidden @4xl:table-cell',
      },
    }),
    column.accessor('amount', {
      header: 'Montant',
      cell: (info) => (
        <span className="font-medium tabular-nums text-foreground">{formatAmount(info.getValue())}</span>
      ),
    }),
    column.accessor('status', {
      header: 'Statut',
      cell: (info) => <PaymentRecordStatusBadge status={info.getValue()} />,
    }),
    column.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const payment = row.original
        return (
          <div className="flex items-center justify-end gap-0.5" onClick={stopPropagation}>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title="Voir la vente"
              aria-label={`Voir la vente ${payment.sale_reference}`}
              onClick={() => onView(payment)}
            >
              <Eye className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-danger hover:bg-danger-soft hover:text-danger"
              title="Annuler le paiement"
              aria-label={`Annuler le paiement ${payment.reference}`}
              disabled={payment.status !== 'validated' || payment.sale_status === 'cancelled'}
              onClick={() => onCancel(payment)}
            >
              <Ban className="size-4" />
            </Button>
          </div>
        )
      },
      meta: { headerClassName: 'w-px', cellClassName: 'py-2' },
    }),
  ])
}

export function PaymentsPage() {
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [method, setMethod] = useState<MethodView>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const [cancelling, setCancelling] = useState<PaymentRow | null>(null)
  const [detailsSaleId, setDetailsSaleId] = useState<string | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  const filters = useMemo<PaymentFilters>(
    () => ({ ...EMPTY_PAYMENT_FILTERS, search: debouncedSearch, method, from, to }),
    [debouncedSearch, method, from, to],
  )

  const payments = usePayments(filters, page, pageSize)
  const { cancel } = usePaymentMutations()
  const detailSale = useSale(detailsSaleId ?? undefined)

  const rows = payments.data?.data ?? NO_PAYMENTS
  const total = payments.data?.total ?? 0

  const hasFilters = Boolean(debouncedSearch) || method !== 'all' || Boolean(from) || Boolean(to)

  const resetFilters = () => {
    setSearch('')
    setMethod('all')
    setFrom('')
    setTo('')
    setPage(1)
  }

  const columns = useMemo(
    () => buildColumns((payment) => setDetailsSaleId(payment.sale_id), setCancelling),
    [],
  )

  const handleCancel = async () => {
    if (!cancelling) return
    try {
      await cancel.mutateAsync({ paymentId: cancelling.id, comment: null })
      toast.success('Paiement annulé et solde recalculé.')
      setCancelling(null)
    } catch (error) {
      toast.error(supabaseErrorMessage(error))
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Paiements"
        description="Historique des encaissements : chaque paiement reste tracé, même annulé."
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
              aria-label="Rechercher un paiement"
            />

            <Select
              value={method}
              onChange={(event) => {
                setMethod(event.target.value as MethodView)
                setPage(1)
              }}
              aria-label="Filtrer par moyen de paiement"
              className="min-w-0 @3xl:w-52"
            >
              {METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0">
              <label htmlFor="payment-from" className="mb-1 block text-xs text-muted-foreground">
                Du
              </label>
              <Input
                id="payment-from"
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
              <label htmlFor="payment-to" className="mb-1 block text-xs text-muted-foreground">
                Au
              </label>
              <Input
                id="payment-to"
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

        {payments.isLoading ? (
          <TableSkeleton rows={6} columns={5} />
        ) : payments.isError ? (
          <ErrorState
            message={supabaseErrorMessage(payments.error)}
            onRetry={() => void payments.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'Aucun paiement ne correspond à vos filtres.' : 'Aucun paiement enregistré.'}
            description={
              hasFilters
                ? 'Modifiez la recherche ou réinitialisez les filtres.'
                : 'Les encaissements apparaîtront ici dès la première vente réglée.'
            }
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Réinitialiser les filtres
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div
              className={cn('transition-opacity', payments.isPlaceholderData && 'pointer-events-none opacity-60')}
              aria-busy={payments.isFetching}
            >
              <DataTable
                columns={columns}
                data={rows}
                getRowId={(payment) => payment.id}
                onRowClick={(payment) => setDetailsSaleId(payment.sale_id)}
              />
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <SaleDetailsDialog sale={detailSale.data ?? null} onClose={() => setDetailsSaleId(null)} />

      <ConfirmDialog
        open={Boolean(cancelling)}
        title="Annuler le paiement ?"
        icon={<Ban className="size-5" />}
        destructive
        loading={cancel.isPending}
        message={
          <>
            Le paiement <strong className="font-mono">{cancelling?.reference}</strong> (
            {formatAmount(cancelling?.amount ?? 0)}) sera marqué annulé. Il restera visible dans
            l’historique et le solde de la vente sera recalculé automatiquement.
          </>
        }
        confirmLabel="Annuler le paiement"
        onConfirm={() => void handleCancel()}
        onCancel={() => setCancelling(null)}
      />
    </div>
  )
}
