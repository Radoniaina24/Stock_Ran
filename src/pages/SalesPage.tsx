import { useMemo, useState, type MouseEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createColumnHelper } from '@tanstack/react-table'
import {
  Banknote,
  ChevronRight,
  Download,
  HandCoins,
  Loader2,
  Plus,
  ReceiptText,
  ShoppingBasket,
  TrendingUp,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { StatCard, StatCardSkeleton } from '../components/dashboard/StatCard'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { DataTable } from '../components/ui/data-table'
import type { DataTableFeatures } from '../components/ui/data-table-features'
import { EmptyState, ErrorState } from '../components/ui/states'
import { ActiveFilters, FilterChip } from '../components/ui/filter-chip'
import { ListSkeleton } from '../components/ui/list-skeleton'
import { Pagination } from '../components/ui/pagination'
import { PeriodFilter, periodLabel } from '../components/ui/period-filter'
import { SearchInput } from '../components/ui/search-input'
import { SegmentedTabs, type SegmentedOption } from '../components/ui/segmented'
import { useToast } from '../components/ui/toast'
import { ClientAvatar } from '../components/clients/ClientAvatar'
import { PaymentFormDialog } from '../components/sales/PaymentFormDialog'
import { SaleDetailsDialog } from '../components/sales/SaleDetailsDialog'
import { SaleFormDialog } from '../components/sales/SaleFormDialog'
import { PaymentProgress, PaymentStatusBadge } from '../components/sales/status-badges'
import { useAuth } from '../hooks/useAuth'
import { useClient } from '../hooks/useClients'
import { useSaleSummary, useSales } from '../hooks/useSales'
import { useDebounce } from '../hooks/useDebounce'
import { useUserLabel } from '../hooks/useWorkspaceUsers'
import { exportSalesCsv } from '../lib/csv'
import { paidRatio, type SaleTab } from '../lib/sales'
import { supabaseErrorMessage } from '../lib/supabase'
import { cn, formatAmount, formatDay } from '../lib/utils'
import { fetchSalesForExport } from '../services/sales'
import { EMPTY_SALE_FILTERS, type SaleBalance, type SaleFilters } from '../types/database'

const PAGE_SIZE = 20
const NO_SALES: SaleBalance[] = []
const numberFormat = new Intl.NumberFormat('fr-FR')

const TAB_LABELS: Record<SaleTab, string> = {
  all: 'Toutes',
  unpaid: 'Non payées',
  partial: 'Partielles',
  paid: 'Payées',
  cancelled: 'Annulées',
}

function tabFilters(tab: SaleTab): Pick<SaleFilters, 'status' | 'paymentStatus'> {
  if (tab === 'all') return { status: 'all', paymentStatus: 'all' }
  if (tab === 'cancelled') return { status: 'cancelled', paymentStatus: 'all' }
  return { status: 'validated', paymentStatus: tab }
}

const column = createColumnHelper<DataTableFeatures, SaleBalance>()

const stopPropagation = (event: MouseEvent) => event.stopPropagation()

function canCollect(sale: SaleBalance) {
  return sale.status !== 'cancelled' && Number(sale.balance_due) > 0
}

function BalanceCell({ sale }: { sale: SaleBalance }) {
  if (sale.status === 'cancelled') return <span className="text-muted-foreground">—</span>
  const due = Number(sale.balance_due)
  if (due <= 0) return <span className="text-sm font-medium text-success">Soldée</span>
  return <span className="font-semibold tabular-nums text-danger">{formatAmount(due)}</span>
}

function buildColumns(onView: (sale: SaleBalance) => void, onCollect: (sale: SaleBalance) => void) {
  return column.columns([
    column.accessor('reference', {
      header: 'Vente',
      cell: ({ row }) => {
        const sale = row.original
        const clientName = sale.client_name ?? 'Client supprimé'
        return (
          <div className="flex min-w-0 items-center gap-3">
            <ClientAvatar name={clientName} seed={sale.client_id} archived={sale.status === 'cancelled'} />
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground" title={clientName}>
                {clientName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{sale.reference}</span>
                <span className="@4xl:hidden"> · {formatDay(sale.sale_date)}</span>
              </p>
            </div>
          </div>
        )
      },
      meta: { cellClassName: 'w-full max-w-0' },
    }),
    column.accessor('sale_date', {
      header: 'Date',
      cell: (info) => <span className="whitespace-nowrap tabular-nums">{formatDay(info.getValue())}</span>,
      meta: { headerClassName: 'hidden @4xl:table-cell', cellClassName: 'hidden @4xl:table-cell' },
    }),
    column.accessor('total_amount', {
      header: 'Montant',
      cell: ({ row }) => (
        <span
          className={cn(
            'whitespace-nowrap font-medium tabular-nums',
            row.original.status === 'cancelled' ? 'text-muted-foreground line-through' : 'text-foreground',
          )}
        >
          {formatAmount(row.original.total_amount)}
        </span>
      ),
      meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
    }),
    column.accessor('paid_amount', {
      header: 'Encaissement',
      cell: ({ row }) => {
        const sale = row.original
        const ratio = paidRatio(Number(sale.paid_amount), Number(sale.total_amount))
        return (
          <div className="w-36">
            <p className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
              <span className="text-foreground">{formatAmount(sale.paid_amount)}</span>
              <span className="text-muted-foreground">{Math.round(ratio)} %</span>
            </p>
            <PaymentProgress
              className="mt-1.5"
              paid={Number(sale.paid_amount)}
              total={Number(sale.total_amount)}
              cancelled={sale.status === 'cancelled'}
            />
          </div>
        )
      },
      meta: { headerClassName: 'hidden @3xl:table-cell', cellClassName: 'hidden @3xl:table-cell' },
    }),
    column.accessor('balance_due', {
      header: 'Reste dû',
      cell: ({ row }) => <BalanceCell sale={row.original} />,
      meta: { headerClassName: 'text-end', cellClassName: 'whitespace-nowrap text-end' },
    }),
    column.accessor('payment_status', {
      header: 'Statut',
      cell: (info) => <PaymentStatusBadge status={info.getValue()} />,
      meta: { headerClassName: 'hidden @5xl:table-cell', cellClassName: 'hidden @5xl:table-cell' },
    }),
    column.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-0.5" onClick={stopPropagation}>
          {canCollect(row.original) ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-success hover:bg-success-soft hover:text-success"
              title="Encaisser"
              aria-label={`Encaisser la vente ${row.original.reference}`}
              onClick={() => onCollect(row.original)}
            >
              <Banknote className="size-4" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            title="Voir les détails"
            aria-label={`Voir les détails de la vente ${row.original.reference}`}
            onClick={() => onView(row.original)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ),
      meta: { headerClassName: 'w-px', cellClassName: 'py-2 pe-3' },
    }),
  ])
}

function SaleCard({
  sale,
  onView,
  onCollect,
}: {
  sale: SaleBalance
  onView: (sale: SaleBalance) => void
  onCollect: (sale: SaleBalance) => void
}) {
  const clientName = sale.client_name ?? 'Client supprimé'
  const cancelled = sale.status === 'cancelled'

  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-border bg-card transition-all hover:border-primary/25 hover:shadow-sm">
      <button
        type="button"
        onClick={() => onView(sale)}
        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-3 rounded-t-xl p-4 text-start outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        aria-label={`Voir la vente ${sale.reference}`}
      >
        <div className="flex w-full min-w-0 items-start gap-3">
          <ClientAvatar name={clientName} seed={sale.client_id} archived={cancelled} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{clientName}</p>
            <p className="truncate text-xs text-muted-foreground">
              <span className="font-mono">{sale.reference}</span> · {formatDay(sale.sale_date)}
            </p>
          </div>
          <p
            className={cn(
              'shrink-0 text-sm font-semibold tabular-nums',
              cancelled ? 'text-muted-foreground line-through' : 'text-foreground',
            )}
          >
            {formatAmount(sale.total_amount)}
          </p>
        </div>
        <PaymentProgress
          className="w-full"
          paid={Number(sale.paid_amount)}
          total={Number(sale.total_amount)}
          cancelled={cancelled}
        />
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <PaymentStatusBadge status={sale.payment_status} />
          <span className="text-xs text-muted-foreground">
            {cancelled ? (
              'Stock réintégré'
            ) : Number(sale.balance_due) > 0 ? (
              <>
                Reste dû{' '}
                <span className="font-semibold tabular-nums text-danger">{formatAmount(sale.balance_due)}</span>
              </>
            ) : (
              <span className="font-medium text-success">Soldée</span>
            )}
          </span>
        </div>
      </button>
      {canCollect(sale) ? (
        <div className="border-t border-border px-2 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-success hover:bg-success-soft hover:text-success"
            onClick={() => onCollect(sale)}
          >
            <Banknote className="size-3.5" />
            Encaisser
          </Button>
        </div>
      ) : null}
    </li>
  )
}

export function SalesPage() {
  const toast = useToast()
  const { workspaceId } = useAuth()
  const userLabel = useUserLabel()
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<SaleTab>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  const [formOpen, setFormOpen] = useState(() => searchParams.get('nouvelle') === '1')
  const [details, setDetails] = useState<SaleBalance | null>(null)
  const [collecting, setCollecting] = useState<SaleBalance | null>(null)

  const clientId = searchParams.get('client') ?? ''
  const client = useClient(clientId || undefined)

  const debouncedSearch = useDebounce(search, 300)

  const filters = useMemo<SaleFilters>(
    () => ({
      ...EMPTY_SALE_FILTERS,
      ...tabFilters(tab),
      search: debouncedSearch,
      clientId,
      from,
      to,
    }),
    [debouncedSearch, tab, clientId, from, to],
  )

  const sales = useSales(filters, page, PAGE_SIZE)
  const summary = useSaleSummary(filters)

  const rows = sales.data?.data ?? NO_SALES
  const total = sales.data?.total ?? 0
  const columns = useMemo(() => buildColumns(setDetails, setCollecting), [])

  const update = (apply: () => void) => {
    apply()
    setPage(1)
  }

  const clearClient = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('client')
    setSearchParams(next, { replace: true })
    setPage(1)
  }

  const period = periodLabel(from, to)
  const hasFilters = Boolean(debouncedSearch) || tab !== 'all' || Boolean(period) || Boolean(clientId)

  const resetFilters = () => {
    update(() => {
      setSearch('')
      setTab('all')
      setFrom('')
      setTo('')
    })
    if (clientId) clearClient()
  }

  const openCreate = () => setFormOpen(true)

  const closeCreate = () => {
    setFormOpen(false)
    if (searchParams.has('nouvelle')) {
      const next = new URLSearchParams(searchParams)
      next.delete('nouvelle')
      setSearchParams(next, { replace: true })
    }
  }

  const handleExport = async () => {
    if (!workspaceId) return
    setExporting(true)
    try {
      const data = await fetchSalesForExport(workspaceId, filters)
      if (data.length === 0) {
        toast.info('Aucune vente à exporter avec ces filtres.')
        return
      }
      exportSalesCsv(data, userLabel)
      toast.success(`${data.length} vente${data.length > 1 ? 's' : ''} exportée${data.length > 1 ? 's' : ''}.`)
    } catch (error) {
      toast.error(supabaseErrorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  const counts = summary.data?.counts
  const tabs: SegmentedOption<SaleTab>[] = (Object.keys(TAB_LABELS) as SaleTab[]).map((value) => ({
    value,
    label: TAB_LABELS[value],
    count: counts ? counts[value] : null,
  }))

  const validatedCount = counts ? counts.all - counts.cancelled : 0
  const scopeLabel = period ? period.toLowerCase() : clientId ? 'pour ce client' : 'toutes périodes'

  return (
    <div className="w-full">
      <PageHeader
        title="Ventes"
        description="Enregistrez vos ventes, suivez les encaissements et ce qu’il reste à percevoir."
        actions={
          <>
            <Button variant="outline" onClick={() => void handleExport()} disabled={exporting}>
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              <span className="hidden sm:inline">Exporter</span>
            </Button>
            <Button onClick={openCreate} className="flex-1 sm:flex-none">
              <Plus className="size-4" />
              Nouvelle vente
            </Button>
          </>
        }
      />

      <section aria-label="Synthèse des ventes" className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {summary.isLoading || !summary.data ? (
          Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Chiffre d’affaires"
              value={formatAmount(summary.data.totalAmount)}
              icon={TrendingUp}
              tone="primary"
              footer={`${numberFormat.format(validatedCount)} vente${validatedCount > 1 ? 's' : ''} · ${scopeLabel}`}
            />
            <StatCard
              label="Encaissé"
              value={formatAmount(summary.data.paidAmount)}
              icon={Banknote}
              tone="success"
              footer={`${Math.round(paidRatio(summary.data.paidAmount, summary.data.totalAmount))} % du chiffre d’affaires`}
            />
            <StatCard
              label="Reste à encaisser"
              value={formatAmount(summary.data.balanceDue)}
              icon={HandCoins}
              tone={summary.data.balanceDue > 0 ? 'danger' : 'success'}
              to="/creances"
              footer={
                summary.data.balanceDue > 0 ? (
                  `${summary.data.counts.unpaid + summary.data.counts.partial} vente${summary.data.counts.unpaid + summary.data.counts.partial > 1 ? 's' : ''} ouverte${summary.data.counts.unpaid + summary.data.counts.partial > 1 ? 's' : ''}`
                ) : (
                  <span className="text-success">Tout est encaissé</span>
                )
              }
            />
            <StatCard
              label="Panier moyen"
              value={formatAmount(validatedCount > 0 ? Math.round(summary.data.totalAmount / validatedCount) : 0)}
              icon={ShoppingBasket}
              tone="violet"
              footer="Montant net moyen par vente"
            />
          </>
        )}
      </section>

      <Card className="@container mb-4 rounded-xl">
        <div className="space-y-4 p-4">
          <SegmentedTabs label="Filtrer par statut de paiement" options={tabs} value={tab} onChange={(value) => update(() => setTab(value))} />
          <SearchInput
            value={search}
            onChange={(event) => update(() => setSearch(event.target.value))}
            onClear={() => update(() => setSearch(''))}
            placeholder="Rechercher une référence ou un client…"
            aria-label="Rechercher une vente"
          />
          <div className="border-t border-border pt-4">
            <PeriodFilter
              idPrefix="sales"
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
            {clientId ? (
              <FilterChip label={`Client : ${client.data?.name ?? '…'}`} onRemove={clearClient} />
            ) : null}
            {debouncedSearch ? (
              <FilterChip label={`« ${debouncedSearch} »`} onRemove={() => update(() => setSearch(''))} />
            ) : null}
            {tab !== 'all' ? <FilterChip label={TAB_LABELS[tab]} onRemove={() => update(() => setTab('all'))} /> : null}
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

      <Card className="@container overflow-hidden rounded-xl">
        {sales.isLoading ? (
          <ListSkeleton label="Chargement des ventes…" />
        ) : sales.isError ? (
          <ErrorState message={supabaseErrorMessage(sales.error)} onRetry={() => void sales.refetch()} />
        ) : rows.length === 0 ? (
          hasFilters ? (
            <EmptyState
              title="Aucune vente ne correspond à vos filtres."
              description="Élargissez la période ou retirez certains critères."
              action={
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Réinitialiser les filtres
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Aucune vente enregistrée."
              description="Créez votre première vente : le stock et les créances sont mis à jour automatiquement."
              icon={<ReceiptText className="size-5" />}
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
              <ul className="grid grid-cols-1 gap-3 p-4 @xl:grid-cols-2 @3xl:hidden">
                {rows.map((sale) => (
                  <SaleCard key={sale.id} sale={sale} onView={setDetails} onCollect={setCollecting} />
                ))}
              </ul>
              <div className="hidden @3xl:block">
                <DataTable columns={columns} data={rows} getRowId={(sale) => sale.id} onRowClick={setDetails} />
              </div>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      {formOpen ? <SaleFormDialog initialClientId={clientId || undefined} onClose={closeCreate} /> : null}

      <SaleDetailsDialog sale={details} onClose={() => setDetails(null)} />

      {collecting ? <PaymentFormDialog sale={collecting} onClose={() => setCollecting(null)} /> : null}
    </div>
  )
}
