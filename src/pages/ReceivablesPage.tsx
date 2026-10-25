import { useCallback, useMemo, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createColumnHelper } from '@tanstack/react-table'
import { Banknote, CalendarClock, ChevronRight, HandCoins, Hourglass, ReceiptText, Users } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { StatCard, StatCardSkeleton } from '../components/dashboard/StatCard'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { DataTable } from '../components/ui/data-table'
import type { DataTableFeatures } from '../components/ui/data-table-features'
import { EmptyState, ErrorState } from '../components/ui/states'
import { ActiveFilters, FilterChip } from '../components/ui/filter-chip'
import { ListSkeleton } from '../components/ui/list-skeleton'
import { SearchInput } from '../components/ui/search-input'
import { SegmentedTabs } from '../components/ui/segmented'
import { Select } from '../components/ui/select'
import { Skeleton } from '../components/ui/skeleton'
import { ClientAvatar } from '../components/clients/ClientAvatar'
import { PaymentFormDialog } from '../components/sales/PaymentFormDialog'
import { SaleDetailsDialog } from '../components/sales/SaleDetailsDialog'
import { AgingBadge, PaymentProgress } from '../components/sales/status-badges'
import { useOpenSales } from '../hooks/useSales'
import { useDebounce } from '../hooks/useDebounce'
import {
  AGING_BUCKETS,
  agingBreakdown,
  agingBucket,
  daysSince,
  groupReceivablesByClient,
  type AgingBucket,
  type ClientReceivable,
} from '../lib/sales'
import { supabaseErrorMessage } from '../lib/supabase'
import { cn, formatAmount, formatDay } from '../lib/utils'
import type { SaleBalance } from '../types/database'

type View = 'sales' | 'clients'
type Sort = 'oldest' | 'amount'

const NO_SALES: SaleBalance[] = []
const numberFormat = new Intl.NumberFormat('fr-FR')

const BUCKET_COLORS: Record<AgingBucket, { bar: string; dot: string }> = {
  '0-30': { bar: 'bg-primary', dot: 'bg-primary' },
  '31-60': { bar: 'bg-warning', dot: 'bg-warning' },
  '61-90': { bar: 'bg-orange-600', dot: 'bg-orange-600' },
  '90+': { bar: 'bg-danger', dot: 'bg-danger' },
}

const stopPropagation = (event: MouseEvent) => event.stopPropagation()

const saleColumn = createColumnHelper<DataTableFeatures, SaleBalance>()
const clientColumn = createColumnHelper<DataTableFeatures, ClientReceivable>()

function buildSaleColumns(onView: (sale: SaleBalance) => void, onCollect: (sale: SaleBalance) => void) {
  return saleColumn.columns([
    saleColumn.accessor('client_name', {
      header: 'Client',
      cell: ({ row }) => {
        const sale = row.original
        const name = sale.client_name ?? 'Client supprimé'
        return (
          <div className="flex min-w-0 items-center gap-3">
            <ClientAvatar name={name} seed={sale.client_id} />
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{name}</p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{sale.reference}</span> · {formatDay(sale.sale_date)}
              </p>
            </div>
          </div>
        )
      },
      meta: { cellClassName: 'w-full max-w-0' },
    }),
    saleColumn.accessor('sale_date', {
      header: 'Ancienneté',
      cell: (info) => <AgingBadge saleDate={info.getValue()} />,
    }),
    saleColumn.accessor('paid_amount', {
      header: 'Encaissé',
      cell: ({ row }) => (
        <div className="w-36">
          <p className="text-xs tabular-nums text-muted-foreground">
            <span className="text-foreground">{formatAmount(row.original.paid_amount)}</span> /{' '}
            {formatAmount(row.original.total_amount)}
          </p>
          <PaymentProgress
            className="mt-1.5"
            paid={Number(row.original.paid_amount)}
            total={Number(row.original.total_amount)}
          />
        </div>
      ),
      meta: { headerClassName: 'hidden @4xl:table-cell', cellClassName: 'hidden @4xl:table-cell' },
    }),
    saleColumn.accessor('balance_due', {
      header: 'Reste dû',
      cell: (info) => (
        <span className="whitespace-nowrap font-semibold tabular-nums text-danger">{formatAmount(info.getValue())}</span>
      ),
      meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
    }),
    saleColumn.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1" onClick={stopPropagation}>
          <Button
            variant="outline"
            size="sm"
            className="text-success hover:bg-success-soft hover:text-success"
            onClick={() => onCollect(row.original)}
            aria-label={`Encaisser la vente ${row.original.reference}`}
          >
            <Banknote className="size-3.5" />
            Encaisser
          </Button>
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

function buildClientColumns(onOpen: (group: ClientReceivable) => void) {
  return clientColumn.columns([
    clientColumn.accessor('clientName', {
      header: 'Client',
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <ClientAvatar name={row.original.clientName} seed={row.original.clientId} />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.clientName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.clientCode ? <span className="font-mono">{row.original.clientCode}</span> : null}
              {row.original.clientCode ? ' · ' : ''}
              {row.original.salesCount} vente{row.original.salesCount > 1 ? 's' : ''} ouverte
              {row.original.salesCount > 1 ? 's' : ''}
            </p>
          </div>
        </div>
      ),
      meta: { cellClassName: 'w-full max-w-0' },
    }),
    clientColumn.accessor('oldestSaleDate', {
      header: 'Plus ancienne',
      cell: (info) => <AgingBadge saleDate={info.getValue()} />,
    }),
    clientColumn.accessor('paidAmount', {
      header: 'Encaissé',
      cell: ({ row }) => (
        <div className="w-36">
          <p className="text-xs tabular-nums text-muted-foreground">
            <span className="text-foreground">{formatAmount(row.original.paidAmount)}</span> /{' '}
            {formatAmount(row.original.totalAmount)}
          </p>
          <PaymentProgress className="mt-1.5" paid={row.original.paidAmount} total={row.original.totalAmount} />
        </div>
      ),
      meta: { headerClassName: 'hidden @4xl:table-cell', cellClassName: 'hidden @4xl:table-cell' },
    }),
    clientColumn.accessor('balanceDue', {
      header: 'Reste dû',
      cell: (info) => (
        <span className="whitespace-nowrap font-semibold tabular-nums text-danger">{formatAmount(info.getValue())}</span>
      ),
      meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
    }),
    clientColumn.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex justify-end" onClick={stopPropagation}>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            title="Voir les ventes du client"
            aria-label={`Voir les ventes de ${row.original.clientName}`}
            onClick={() => onOpen(row.original)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ),
      meta: { headerClassName: 'w-px', cellClassName: 'py-2 pe-3' },
    }),
  ])
}

function AgingCard({
  sales,
  active,
  onSelect,
}: {
  sales: SaleBalance[]
  active: AgingBucket | null
  onSelect: (bucket: AgingBucket | null) => void
}) {
  const totals = agingBreakdown(sales)
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0)

  return (
    <Card className="rounded-xl p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Ancienneté des créances</h2>
        <span className="text-xs text-muted-foreground">Depuis la date de vente</span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {AGING_BUCKETS.map((bucket) => {
          const ratio = total > 0 ? (totals[bucket.value] / total) * 100 : 0
          return ratio > 0 ? (
            <div
              key={bucket.value}
              className={cn(
                'h-full transition-[width,opacity] duration-500',
                BUCKET_COLORS[bucket.value].bar,
                active && active !== bucket.value && 'opacity-30',
              )}
              style={{ width: `${ratio}%` }}
            />
          ) : null
        })}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {AGING_BUCKETS.map((bucket) => {
          const amount = totals[bucket.value]
          const selected = active === bucket.value
          return (
            <li key={bucket.value}>
              <button
                type="button"
                aria-pressed={selected}
                disabled={amount <= 0}
                onClick={() => onSelect(selected ? null : bucket.value)}
                className={cn(
                  'w-full cursor-pointer rounded-lg border px-3 py-2 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-default disabled:opacity-60',
                  selected ? 'border-primary bg-primary-soft' : 'border-border hover:bg-muted/60',
                )}
              >
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn('size-2 rounded-full', BUCKET_COLORS[bucket.value].dot)} aria-hidden="true" />
                  {bucket.label}
                </span>
                <span className="mt-1 block truncate text-sm font-semibold tabular-nums text-foreground">
                  {formatAmount(amount)}
                </span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {total > 0 ? Math.round((amount / total) * 100) : 0} %
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
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
  const name = sale.client_name ?? 'Client supprimé'
  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-border bg-card transition-all hover:border-primary/25 hover:shadow-sm">
      <button
        type="button"
        onClick={() => onView(sale)}
        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-3 rounded-t-xl p-4 text-start outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        aria-label={`Voir la vente ${sale.reference}`}
      >
        <div className="flex w-full min-w-0 items-start gap-3">
          <ClientAvatar name={name} seed={sale.client_id} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">
              <span className="font-mono">{sale.reference}</span> · {formatDay(sale.sale_date)}
            </p>
          </div>
          <AgingBadge saleDate={sale.sale_date} />
        </div>
        <PaymentProgress className="w-full" paid={Number(sale.paid_amount)} total={Number(sale.total_amount)} />
        <div className="flex w-full items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {formatAmount(sale.paid_amount)} / {formatAmount(sale.total_amount)}
          </span>
          <span className="text-sm font-semibold tabular-nums text-danger">{formatAmount(sale.balance_due)}</span>
        </div>
      </button>
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
    </li>
  )
}

function ClientCard({ group, onOpen }: { group: ClientReceivable; onOpen: (group: ClientReceivable) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(group)}
        className="flex w-full min-w-0 cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 text-start transition-all outline-none hover:border-primary/25 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="flex w-full min-w-0 items-start gap-3">
          <ClientAvatar name={group.clientName} seed={group.clientId} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{group.clientName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {group.salesCount} vente{group.salesCount > 1 ? 's' : ''} ouverte{group.salesCount > 1 ? 's' : ''}
            </p>
          </div>
          <AgingBadge saleDate={group.oldestSaleDate} />
        </div>
        <PaymentProgress className="w-full" paid={group.paidAmount} total={group.totalAmount} />
        <div className="flex w-full items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span>Reste dû</span>
          <span className="text-sm font-semibold tabular-nums text-danger">{formatAmount(group.balanceDue)}</span>
        </div>
      </button>
    </li>
  )
}

export function ReceivablesPage() {
  const navigate = useNavigate()
  const openSales = useOpenSales()

  const [view, setView] = useState<View>('sales')
  const [sort, setSort] = useState<Sort>('oldest')
  const [bucket, setBucket] = useState<AgingBucket | null>(null)
  const [search, setSearch] = useState('')
  const [details, setDetails] = useState<SaleBalance | null>(null)
  const [collecting, setCollecting] = useState<SaleBalance | null>(null)

  const debouncedSearch = useDebounce(search, 200)
  const allSales = openSales.data ?? NO_SALES

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase()
    const list = allSales.filter((sale) => {
      if (bucket && agingBucket(daysSince(sale.sale_date)) !== bucket) return false
      if (!term) return true
      return (
        sale.reference.toLowerCase().includes(term) ||
        (sale.client_name ?? '').toLowerCase().includes(term) ||
        (sale.client_code ?? '').toLowerCase().includes(term)
      )
    })
    return sort === 'amount' ? [...list].sort((a, b) => Number(b.balance_due) - Number(a.balance_due)) : list
  }, [allSales, bucket, debouncedSearch, sort])

  const groups = useMemo(() => {
    const list = groupReceivablesByClient(filtered)
    return sort === 'oldest' ? [...list].sort((a, b) => a.oldestSaleDate.localeCompare(b.oldestSaleDate)) : list
  }, [filtered, sort])

  const totals = useMemo(() => {
    const balance = allSales.reduce((sum, sale) => sum + Number(sale.balance_due), 0)
    const overdue = allSales
      .filter((sale) => daysSince(sale.sale_date) > 30)
      .reduce((sum, sale) => sum + Number(sale.balance_due), 0)
    const clients = new Set(allSales.map((sale) => sale.client_id)).size
    const oldest = allSales.reduce<string | null>(
      (min, sale) => (min === null || sale.sale_date < min ? sale.sale_date : min),
      null,
    )
    return { balance, overdue, clients, oldestDays: oldest ? daysSince(oldest) : 0, count: allSales.length }
  }, [allSales])

  const saleColumns = useMemo(() => buildSaleColumns(setDetails, setCollecting), [])
  const openClient = useCallback(
    (group: ClientReceivable) => navigate(`/ventes?client=${group.clientId}`),
    [navigate],
  )
  const clientColumns = useMemo(() => buildClientColumns(openClient), [openClient])

  const bucketLabel = bucket ? AGING_BUCKETS.find((item) => item.value === bucket)!.label : ''
  const hasFilters = Boolean(debouncedSearch) || Boolean(bucket)
  const resetFilters = () => {
    setSearch('')
    setBucket(null)
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Créances clients"
        description="Ventes réglées partiellement ou pas encore : priorisez les relances selon l’ancienneté et le montant."
      />

      <section aria-label="Synthèse des créances" className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {openSales.isLoading ? (
          Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Total à recouvrer"
              value={formatAmount(totals.balance)}
              icon={HandCoins}
              tone={totals.balance > 0 ? 'danger' : 'success'}
              footer={`${totals.count} vente${totals.count > 1 ? 's' : ''} ouverte${totals.count > 1 ? 's' : ''}`}
            />
            <StatCard
              label="Clients débiteurs"
              value={numberFormat.format(totals.clients)}
              icon={Users}
              tone="warning"
              footer="Ayant au moins une vente ouverte"
            />
            <StatCard
              label="En retard (> 30 jours)"
              value={formatAmount(totals.overdue)}
              icon={Hourglass}
              tone={totals.overdue > 0 ? 'danger' : 'success'}
              footer={
                totals.balance > 0
                  ? `${Math.round((totals.overdue / totals.balance) * 100)} % du total dû`
                  : 'Aucun retard'
              }
            />
            <StatCard
              label="Plus ancienne créance"
              value={totals.count > 0 ? `${totals.oldestDays} j` : '—'}
              icon={CalendarClock}
              tone={totals.oldestDays > 60 ? 'danger' : totals.oldestDays > 30 ? 'warning' : 'primary'}
              footer="Jours depuis la vente"
            />
          </>
        )}
      </section>

      <div className="mb-4">
        {openSales.isLoading ? (
          <Card className="space-y-3 rounded-xl p-4 sm:p-5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full rounded-full" />
          </Card>
        ) : allSales.length > 0 ? (
          <AgingCard sales={allSales} active={bucket} onSelect={setBucket} />
        ) : null}
      </div>

      <Card className="@container mb-4 rounded-xl">
        <div className="space-y-4 p-4">
          <SegmentedTabs<View>
            label="Mode d’affichage"
            value={view}
            onChange={setView}
            options={[
              { value: 'sales', label: 'Par vente', icon: <ReceiptText className="size-4" />, count: filtered.length },
              { value: 'clients', label: 'Par client', icon: <Users className="size-4" />, count: groups.length },
            ]}
          />
          <div className="flex flex-col gap-2 @2xl:flex-row">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onClear={() => setSearch('')}
              placeholder="Rechercher un client ou une référence…"
              className="min-w-0 @2xl:flex-1"
              aria-label="Rechercher une créance"
            />
            <Select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              aria-label="Trier les créances"
              className="min-w-0 @2xl:w-56"
            >
              <option value="oldest">Plus anciennes d’abord</option>
              <option value="amount">Montant dû décroissant</option>
            </Select>
          </div>
        </div>
        {hasFilters ? (
          <ActiveFilters onClearAll={resetFilters}>
            {debouncedSearch ? <FilterChip label={`« ${debouncedSearch} »`} onRemove={() => setSearch('')} /> : null}
            {bucket ? <FilterChip label={bucketLabel} onRemove={() => setBucket(null)} /> : null}
          </ActiveFilters>
        ) : null}
      </Card>

      <Card className="@container overflow-hidden rounded-xl">
        {openSales.isLoading ? (
          <ListSkeleton label="Chargement des créances…" />
        ) : openSales.isError ? (
          <ErrorState message={supabaseErrorMessage(openSales.error)} onRetry={() => void openSales.refetch()} />
        ) : allSales.length === 0 ? (
          <EmptyState
            title="Aucune créance en cours."
            description="Toutes vos ventes sont réglées : rien à recouvrer pour le moment."
            icon={<HandCoins className="size-5" />}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Aucune créance ne correspond à vos filtres."
            description="Modifiez la recherche ou la tranche d’ancienneté."
            action={
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Réinitialiser les filtres
              </Button>
            }
          />
        ) : view === 'sales' ? (
          <div aria-busy={openSales.isFetching}>
            <ul className="grid grid-cols-1 gap-3 p-4 @xl:grid-cols-2 @3xl:hidden">
              {filtered.map((sale) => (
                <SaleCard key={sale.id} sale={sale} onView={setDetails} onCollect={setCollecting} />
              ))}
            </ul>
            <div className="hidden @3xl:block">
              <DataTable columns={saleColumns} data={filtered} getRowId={(sale) => sale.id} onRowClick={setDetails} />
            </div>
          </div>
        ) : (
          <div aria-busy={openSales.isFetching}>
            <ul className="grid grid-cols-1 gap-3 p-4 @xl:grid-cols-2 @3xl:hidden">
              {groups.map((group) => (
                <ClientCard key={group.clientId} group={group} onOpen={openClient} />
              ))}
            </ul>
            <div className="hidden @3xl:block">
              <DataTable
                columns={clientColumns}
                data={groups}
                getRowId={(group) => group.clientId}
                onRowClick={openClient}
              />
            </div>
          </div>
        )}
      </Card>

      <SaleDetailsDialog sale={details} onClose={() => setDetails(null)} />

      {collecting ? <PaymentFormDialog sale={collecting} onClose={() => setCollecting(null)} /> : null}
    </div>
  )
}
