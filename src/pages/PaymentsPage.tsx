import { useMemo, useState, type MouseEvent } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Ban, Banknote, ChevronRight, Download, Hash, Loader2, Wallet } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { StatCard, StatCardSkeleton } from '../components/dashboard/StatCard'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { DataTable } from '../components/ui/data-table'
import type { DataTableFeatures } from '../components/ui/data-table-features'
import { EmptyState, ErrorState } from '../components/ui/states'
import { ActiveFilters, FilterChip } from '../components/ui/filter-chip'
import { ListSkeleton } from '../components/ui/list-skeleton'
import { Pagination } from '../components/ui/pagination'
import { PeriodFilter, periodLabel } from '../components/ui/period-filter'
import { SearchInput } from '../components/ui/search-input'
import { SegmentedTabs, type SegmentedOption } from '../components/ui/segmented'
import { Skeleton } from '../components/ui/skeleton'
import { useToast } from '../components/ui/toast'
import { SaleDetailsDialog } from '../components/sales/SaleDetailsDialog'
import {
  PaymentMethodBadge,
  PaymentMethodBar,
  PaymentMethodIcon,
  PaymentRecordStatusBadge,
} from '../components/sales/status-badges'
import { useAuth } from '../hooks/useAuth'
import { usePaymentMutations, usePaymentSummary, usePayments } from '../hooks/usePayments'
import { useSale } from '../hooks/useSales'
import { useDebounce } from '../hooks/useDebounce'
import { useUserLabel } from '../hooks/useWorkspaceUsers'
import { exportPaymentsCsv } from '../lib/csv'
import { formatDayLabel, groupByDay } from '../lib/history'
import type { PaymentSummary } from '../lib/sales'
import { supabaseErrorMessage } from '../lib/supabase'
import { cn, formatAmount } from '../lib/utils'
import { fetchPaymentsForExport } from '../services/payments'
import {
  EMPTY_PAYMENT_FILTERS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PaymentFilters,
  type PaymentMethod,
  type PaymentRow,
} from '../types/database'

type MethodView = 'all' | PaymentMethod

const PAGE_SIZE = 20
const NO_PAYMENTS: PaymentRow[] = []
const numberFormat = new Intl.NumberFormat('fr-FR')
const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

const column = createColumnHelper<DataTableFeatures, PaymentRow>()

const stopPropagation = (event: MouseEvent) => event.stopPropagation()

function canCancel(payment: PaymentRow) {
  return payment.status === 'validated' && payment.sale_status !== 'cancelled'
}

function Amount({ payment, className }: { payment: PaymentRow; className?: string }) {
  const cancelled = payment.status === 'cancelled'
  return (
    <span
      className={cn(
        'whitespace-nowrap font-semibold tabular-nums',
        cancelled ? 'text-muted-foreground line-through' : 'text-success',
        className,
      )}
    >
      {cancelled ? '' : '+'}
      {formatAmount(payment.amount)}
    </span>
  )
}

function buildColumns(onView: (payment: PaymentRow) => void, onCancel: (payment: PaymentRow) => void) {
  return column.columns([
    column.accessor('reference', {
      header: 'Paiement',
      cell: ({ row }) => {
        const payment = row.original
        return (
          <div className="flex min-w-0 items-center gap-3">
            <PaymentMethodIcon method={payment.payment_method} />
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{payment.client_name ?? 'Client'}</p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{payment.reference}</span>
                {payment.sale_reference ? (
                  <>
                    {' '}
                    · Vente <span className="font-mono">{payment.sale_reference}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        )
      },
      meta: { cellClassName: 'w-full max-w-0' },
    }),
    column.accessor('paid_at', {
      header: 'Date',
      cell: (info) => {
        const date = new Date(info.getValue())
        return (
          <div className="whitespace-nowrap">
            <p className="text-foreground">{dayFormat.format(date)}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{timeFormat.format(date)}</p>
          </div>
        )
      },
    }),
    column.accessor('payment_method', {
      header: 'Moyen',
      cell: ({ row }) => (
        <div className="min-w-0">
          <PaymentMethodBadge method={row.original.payment_method} />
          {row.original.transaction_reference ? (
            <p className="mt-1 max-w-40 truncate font-mono text-xs text-muted-foreground" title={row.original.transaction_reference}>
              {row.original.transaction_reference}
            </p>
          ) : null}
        </div>
      ),
      meta: { headerClassName: 'hidden @4xl:table-cell', cellClassName: 'hidden @4xl:table-cell' },
    }),
    column.accessor('amount', {
      header: 'Montant',
      cell: ({ row }) => <Amount payment={row.original} />,
      meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
    }),
    column.accessor('status', {
      header: 'Statut',
      cell: (info) => <PaymentRecordStatusBadge status={info.getValue()} />,
      meta: { headerClassName: 'hidden @5xl:table-cell', cellClassName: 'hidden @5xl:table-cell' },
    }),
    column.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const payment = row.original
        return (
          <div className="flex items-center justify-end gap-0.5" onClick={stopPropagation}>
            {canCancel(payment) ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-danger hover:bg-danger-soft hover:text-danger"
                title="Annuler le paiement"
                aria-label={`Annuler le paiement ${payment.reference}`}
                onClick={() => onCancel(payment)}
              >
                <Ban className="size-4" />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              title="Voir la vente"
              aria-label={`Voir la vente ${payment.sale_reference}`}
              onClick={() => onView(payment)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )
      },
      meta: { headerClassName: 'w-px', cellClassName: 'py-2 pe-3' },
    }),
  ])
}

function PaymentTimeline({ rows, onOpen }: { rows: PaymentRow[]; onOpen: (payment: PaymentRow) => void }) {
  const [now] = useState(() => new Date())
  const groups = groupByDay(rows, (row) => row.paid_at)

  return (
    <div>
      {groups.map((group) => {
        const dayTotal = group.items
          .filter((item) => item.status === 'validated')
          .reduce((sum, item) => sum + Number(item.amount), 0)
        return (
          <section key={group.date} aria-label={formatDayLabel(group.date, now)}>
            <h3 className="sticky top-14 z-[5] flex items-center justify-between border-y border-border bg-muted/90 px-4 py-2 text-xs font-semibold text-muted-foreground backdrop-blur first:border-t-0 md:top-0">
              {formatDayLabel(group.date, now)}
              {dayTotal > 0 ? (
                <span className="font-medium text-success tabular-nums">+{formatAmount(dayTotal)}</span>
              ) : null}
            </h3>
            <ul className="divide-y divide-border">
              {group.items.map((payment) => (
                <li key={payment.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(payment)}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-start transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/60"
                  >
                    <PaymentMethodIcon method={payment.payment_method} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {payment.client_name ?? 'Client'}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {timeFormat.format(new Date(payment.paid_at))} · {PAYMENT_METHOD_LABELS[payment.payment_method]}
                        {payment.sale_reference ? ` · ${payment.sale_reference}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-end">
                      <Amount payment={payment} className="block text-sm" />
                      {payment.status === 'cancelled' ? (
                        <span className="block text-xs text-muted-foreground">Annulé</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function MethodBreakdown({
  summary,
  active,
  onSelect,
}: {
  summary: PaymentSummary
  active: MethodView
  onSelect: (method: MethodView) => void
}) {
  const methods = [...PAYMENT_METHODS].sort((a, b) => summary.amounts[b] - summary.amounts[a])

  return (
    <Card className="h-full rounded-xl p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Répartition par moyen</h2>
        <span className="text-xs text-muted-foreground">Paiements encaissés</span>
      </div>
      <ul className="space-y-1">
        {methods.map((method) => {
          const amount = summary.amounts[method]
          const ratio = summary.totalAmount > 0 ? (amount / summary.totalAmount) * 100 : 0
          const selected = active === method
          return (
            <li key={method}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(selected ? 'all' : method)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                  selected ? 'bg-primary-soft' : 'hover:bg-muted/60',
                )}
              >
                <PaymentMethodIcon method={method} className="size-8" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium text-foreground">{PAYMENT_METHOD_LABELS[method]}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-foreground">{formatAmount(amount)}</span>
                  </span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="flex-1">
                      <PaymentMethodBar method={method} ratio={ratio} />
                    </span>
                    <span className="w-9 shrink-0 text-end text-xs text-muted-foreground tabular-nums">
                      {Math.round(ratio)} %
                    </span>
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function BreakdownSkeleton() {
  return (
    <Card className="h-full space-y-3 rounded-xl p-4 sm:p-5">
      <Skeleton className="h-4 w-40" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        </div>
      ))}
    </Card>
  )
}

export function PaymentsPage() {
  const toast = useToast()
  const { workspaceId } = useAuth()
  const userLabel = useUserLabel()

  const [search, setSearch] = useState('')
  const [method, setMethod] = useState<MethodView>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  const [cancelling, setCancelling] = useState<PaymentRow | null>(null)
  const [detailsSaleId, setDetailsSaleId] = useState<string | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  const filters = useMemo<PaymentFilters>(
    () => ({ ...EMPTY_PAYMENT_FILTERS, search: debouncedSearch, method, from, to }),
    [debouncedSearch, method, from, to],
  )

  const payments = usePayments(filters, page, PAGE_SIZE)
  const summary = usePaymentSummary(filters)
  const { cancel } = usePaymentMutations()
  const detailSale = useSale(detailsSaleId ?? undefined)

  const rows = payments.data?.data ?? NO_PAYMENTS
  const total = payments.data?.total ?? 0

  const update = (apply: () => void) => {
    apply()
    setPage(1)
  }

  const period = periodLabel(from, to)
  const hasFilters = Boolean(debouncedSearch) || method !== 'all' || Boolean(period)

  const resetFilters = () =>
    update(() => {
      setSearch('')
      setMethod('all')
      setFrom('')
      setTo('')
    })

  const columns = useMemo(() => buildColumns((payment) => setDetailsSaleId(payment.sale_id), setCancelling), [])

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

  const handleExport = async () => {
    if (!workspaceId) return
    setExporting(true)
    try {
      const data = await fetchPaymentsForExport(workspaceId, filters)
      if (data.length === 0) {
        toast.info('Aucun paiement à exporter avec ces filtres.')
        return
      }
      exportPaymentsCsv(data, userLabel)
      toast.success(`${data.length} paiement${data.length > 1 ? 's' : ''} exporté${data.length > 1 ? 's' : ''}.`)
    } catch (error) {
      toast.error(supabaseErrorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  const counts = summary.data?.counts
  const tabs: SegmentedOption<MethodView>[] = [
    { value: 'all', label: 'Tous', count: counts ? counts.all : null },
    ...PAYMENT_METHODS.map((value) => ({
      value,
      label: PAYMENT_METHOD_LABELS[value],
      count: counts ? counts[value] : null,
    })),
  ]

  const scopeLabel = period ? period.toLowerCase() : 'toutes périodes'

  return (
    <div className="w-full">
      <PageHeader
        title="Paiements"
        description="Historique des encaissements : chaque paiement reste tracé, même annulé."
        actions={
          <Button variant="outline" onClick={() => void handleExport()} disabled={exporting} className="w-full sm:w-auto">
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Exporter en CSV
          </Button>
        }
      />

      <section aria-label="Synthèse des encaissements" className="mb-4 grid gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-1">
          {summary.isLoading || !summary.data ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
              <StatCard
                label="Total encaissé"
                value={formatAmount(summary.data.totalAmount)}
                icon={Wallet}
                tone="success"
                footer={scopeLabel}
              />
              <StatCard
                label="Paiements"
                value={numberFormat.format(summary.data.validatedCount)}
                icon={summary.data.cancelledCount > 0 ? Ban : Hash}
                tone={summary.data.cancelledCount > 0 ? 'warning' : 'primary'}
                footer={
                  summary.data.cancelledCount > 0
                    ? `${summary.data.cancelledCount} annulé${summary.data.cancelledCount > 1 ? 's' : ''} (${formatAmount(summary.data.cancelledAmount)})`
                    : `Moyenne ${formatAmount(summary.data.validatedCount > 0 ? Math.round(summary.data.totalAmount / summary.data.validatedCount) : 0)}`
                }
              />
            </>
          )}
        </div>
        <div className="lg:col-span-2">
          {summary.isLoading || !summary.data ? (
            <BreakdownSkeleton />
          ) : (
            <MethodBreakdown summary={summary.data} active={method} onSelect={(value) => update(() => setMethod(value))} />
          )}
        </div>
      </section>

      <Card className="@container mb-4 rounded-xl">
        <div className="space-y-4 p-4">
          <SegmentedTabs label="Filtrer par moyen de paiement" options={tabs} value={method} onChange={(value) => update(() => setMethod(value))} />
          <SearchInput
            value={search}
            onChange={(event) => update(() => setSearch(event.target.value))}
            onClear={() => update(() => setSearch(''))}
            placeholder="Rechercher une référence de paiement ou un client…"
            aria-label="Rechercher un paiement"
          />
          <div className="border-t border-border pt-4">
            <PeriodFilter
              idPrefix="payments"
              from={from}
              to={to}
              onChange={(range) =>
                update(() => {
                  setFrom(range.from)
                  setTo(range.to)
                })
              }
            />
          </div>
        </div>

        {hasFilters ? (
          <ActiveFilters onClearAll={resetFilters}>
            {debouncedSearch ? (
              <FilterChip label={`« ${debouncedSearch} »`} onRemove={() => update(() => setSearch(''))} />
            ) : null}
            {method !== 'all' ? (
              <FilterChip label={PAYMENT_METHOD_LABELS[method]} onRemove={() => update(() => setMethod('all'))} />
            ) : null}
            {period ? (
              <FilterChip
                label={period}
                onRemove={() =>
                  update(() => {
                    setFrom('')
                    setTo('')
                  })
                }
              />
            ) : null}
          </ActiveFilters>
        ) : null}
      </Card>

      <Card className="@container overflow-clip rounded-xl">
        {payments.isLoading ? (
          <ListSkeleton label="Chargement des paiements…" avatar="rounded-lg" />
        ) : payments.isError ? (
          <ErrorState message={supabaseErrorMessage(payments.error)} onRetry={() => void payments.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'Aucun paiement ne correspond à vos filtres.' : 'Aucun paiement enregistré.'}
            description={
              hasFilters
                ? 'Élargissez la période ou retirez certains critères.'
                : 'Les encaissements apparaîtront ici dès la première vente réglée.'
            }
            icon={<Banknote className="size-5" />}
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
              <div className="@3xl:hidden">
                <PaymentTimeline rows={rows} onOpen={(payment) => setDetailsSaleId(payment.sale_id)} />
              </div>
              <div className="hidden @3xl:block">
                <DataTable
                  columns={columns}
                  data={rows}
                  getRowId={(payment) => payment.id}
                  onRowClick={(payment) => setDetailsSaleId(payment.sale_id)}
                />
              </div>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
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
            {formatAmount(cancelling?.amount ?? 0)}) sera marqué annulé. Il restera visible dans l’historique et
            le solde de la vente sera recalculé automatiquement.
          </>
        }
        confirmLabel="Annuler le paiement"
        onConfirm={() => void handleCancel()}
        onCancel={() => setCancelling(null)}
      />
    </div>
  )
}
