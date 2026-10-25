import { useMemo, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createColumnHelper, type OnChangeFn, type SortingState } from '@tanstack/react-table'
import {
  Archive,
  ArchiveRestore,
  HandCoins,
  Pencil,
  Phone,
  Plus,
  ShoppingCart,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { StatCard, StatCardSkeleton } from '../components/dashboard/StatCard'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { DataTable } from '../components/ui/data-table'
import type { DataTableFeatures } from '../components/ui/data-table-features'
import { EmptyState, ErrorState } from '../components/ui/states'
import { ActiveFilters, FilterChip } from '../components/ui/filter-chip'
import { ListSkeleton } from '../components/ui/list-skeleton'
import { Pagination } from '../components/ui/pagination'
import { SearchInput } from '../components/ui/search-input'
import { SegmentedTabs, type SegmentedOption } from '../components/ui/segmented'
import { Select } from '../components/ui/select'
import { useToast } from '../components/ui/toast'
import { ClientAvatar } from '../components/clients/ClientAvatar'
import { ClientDetailsDialog } from '../components/clients/ClientDetailsDialog'
import { ClientFormDialog } from '../components/clients/ClientFormDialog'
import { PaymentProgress } from '../components/sales/status-badges'
import { useClientMutations, useClientSummary, useClients } from '../hooks/useClients'
import { useDebounce } from '../hooks/useDebounce'
import { supabaseErrorMessage } from '../lib/supabase'
import { cn, formatAmount } from '../lib/utils'
import {
  EMPTY_CLIENT_FILTERS,
  type Client,
  type ClientBalance,
  type ClientFilters,
  type ClientSortKey,
} from '../types/database'

type ClientTab = 'all' | 'active' | 'with_balance' | 'archived'

const TAB_LABELS: Record<ClientTab, string> = {
  all: 'Tous',
  active: 'Actifs',
  with_balance: 'Avec créance',
  archived: 'Archivés',
}

function tabFilters(tab: ClientTab): Pick<ClientFilters, 'status' | 'balance'> {
  if (tab === 'with_balance') return { status: 'all', balance: 'with_balance' }
  if (tab === 'active' || tab === 'archived') return { status: tab, balance: 'all' }
  return { status: 'all', balance: 'all' }
}

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'created_at:desc', label: 'Plus récents' },
  { value: 'name:asc', label: 'Nom (A → Z)' },
  { value: 'name:desc', label: 'Nom (Z → A)' },
  { value: 'code:asc', label: 'Code client' },
  { value: 'balance_due:desc', label: 'Créance décroissante' },
  { value: 'total_sales:desc', label: 'Meilleurs clients' },
]

const NO_CLIENTS: ClientBalance[] = []
const numberFormat = new Intl.NumberFormat('fr-FR')
const column = createColumnHelper<DataTableFeatures, ClientBalance>()

const stopPropagation = (event: MouseEvent) => event.stopPropagation()

interface ClientActions {
  onView: (client: ClientBalance) => void
  onNewSale: (client: Client) => void
  onEdit: (client: Client) => void
  onArchive: (client: Client) => void
  onDelete: (client: Client) => void
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? <Badge variant="success">Actif</Badge> : <Badge variant="neutral">Archivé</Badge>
}

function BalanceAmount({ value }: { value: number }) {
  if (value <= 0) return <span className="text-sm text-muted-foreground">À jour</span>
  return <span className="font-semibold tabular-nums text-danger">{formatAmount(value)}</span>
}

function RowActions({ client, actions, compact = false }: { client: ClientBalance; actions: ClientActions; compact?: boolean }) {
  return (
    <div className="flex items-center justify-end gap-0.5" onClick={stopPropagation}>
      {compact ? null : (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title="Nouvelle vente"
          aria-label={`Nouvelle vente pour ${client.name}`}
          disabled={!client.is_active}
          onClick={() => actions.onNewSale(client)}
        >
          <ShoppingCart className="size-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        title="Modifier"
        aria-label={`Modifier ${client.name}`}
        onClick={() => actions.onEdit(client)}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        title={client.is_active ? 'Archiver' : 'Réactiver'}
        aria-label={client.is_active ? `Archiver ${client.name}` : `Réactiver ${client.name}`}
        onClick={() => actions.onArchive(client)}
      >
        {client.is_active ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-danger hover:bg-danger-soft hover:text-danger"
        title="Supprimer"
        aria-label={`Supprimer ${client.name}`}
        disabled={client.sales_count > 0}
        onClick={() => actions.onDelete(client)}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

function buildClientColumns(actions: ClientActions) {
  return column.columns([
    column.accessor('name', {
      header: 'Client',
      cell: ({ row }) => {
        const client = row.original
        return (
          <div className="flex min-w-0 items-center gap-3">
            <ClientAvatar name={client.name} seed={client.id} archived={!client.is_active} />
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground" title={client.name}>
                {client.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{client.code}</span>
                {client.phone ? <span className="@5xl:hidden"> · {client.phone}</span> : null}
              </p>
            </div>
          </div>
        )
      },
      meta: { cellClassName: 'w-full max-w-0' },
    }),
    column.accessor('phone', {
      header: 'Contact',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="max-w-52 min-w-0 text-xs">
          <p className="truncate text-foreground">{row.original.phone || '—'}</p>
          {row.original.email ? <p className="truncate text-muted-foreground">{row.original.email}</p> : null}
        </div>
      ),
      meta: { headerClassName: 'hidden @5xl:table-cell', cellClassName: 'hidden @5xl:table-cell' },
    }),
    column.accessor('total_sales', {
      header: 'Ventes',
      cell: ({ row }) => (
        <div className="whitespace-nowrap">
          <p className="tabular-nums text-foreground">{formatAmount(row.original.total_sales)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {row.original.sales_count} vente{row.original.sales_count > 1 ? 's' : ''}
          </p>
        </div>
      ),
      meta: { headerClassName: 'hidden @4xl:table-cell', cellClassName: 'hidden @4xl:table-cell' },
    }),
    column.accessor('balance_due', {
      header: 'Créance',
      cell: ({ row }) => {
        const client = row.original
        return (
          <div className="w-36">
            <BalanceAmount value={Number(client.balance_due)} />
            {Number(client.total_sales) > 0 ? (
              <PaymentProgress
                className="mt-1.5"
                paid={Number(client.total_paid)}
                total={Number(client.total_sales)}
              />
            ) : null}
          </div>
        )
      },
    }),
    column.accessor('is_active', {
      header: 'Statut',
      enableSorting: false,
      cell: (info) => <StatusBadge active={info.getValue()} />,
      meta: { headerClassName: 'hidden @6xl:table-cell', cellClassName: 'hidden @6xl:table-cell' },
    }),
    column.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <RowActions client={row.original} actions={actions} />,
      meta: { headerClassName: 'w-px', cellClassName: 'py-2' },
    }),
  ])
}

function ClientCard({ client, actions }: { client: ClientBalance; actions: ClientActions }) {
  const balance = Number(client.balance_due)

  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-border bg-card transition-all hover:border-primary/25 hover:shadow-sm">
      <button
        type="button"
        onClick={() => actions.onView(client)}
        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-3 rounded-t-xl p-4 text-start outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        aria-label={`Voir la fiche de ${client.name}`}
      >
        <div className="flex w-full min-w-0 items-start gap-3">
          <ClientAvatar name={client.name} seed={client.id} archived={!client.is_active} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{client.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              <span className="font-mono">{client.code}</span>
              {client.phone ? <span> · {client.phone}</span> : null}
            </p>
          </div>
          <StatusBadge active={client.is_active} />
        </div>
        <div className="grid w-full grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-muted-foreground">Ventes</p>
            <p className="mt-0.5 font-semibold tabular-nums text-foreground">{formatAmount(client.total_sales)}</p>
          </div>
          <div className={cn('rounded-lg px-3 py-2', balance > 0 ? 'bg-danger-soft' : 'bg-muted/50')}>
            <p className="text-muted-foreground">Reste dû</p>
            <p className={cn('mt-0.5 font-semibold tabular-nums', balance > 0 ? 'text-danger' : 'text-foreground')}>
              {formatAmount(balance)}
            </p>
          </div>
        </div>
      </button>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-primary"
            disabled={!client.is_active}
            onClick={() => actions.onNewSale(client)}
          >
            <ShoppingCart className="size-3.5" />
            Vendre
          </Button>
          {client.phone ? (
            <a
              href={`tel:${client.phone.replace(/\s+/g, '')}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Phone className="size-3.5" />
              Appeler
            </a>
          ) : null}
        </div>
        <RowActions client={client} actions={actions} compact />
      </div>
    </li>
  )
}

export function ClientsPage() {
  const toast = useToast()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<ClientTab>('all')
  const [sort, setSort] = useState<ClientSortKey>('created_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const [formOpen, setFormOpen] = useState(false)
  const [formClient, setFormClient] = useState<Client | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [viewingFallback, setViewingFallback] = useState<ClientBalance | null>(null)
  const [archiving, setArchiving] = useState<Client | null>(null)
  const [deleting, setDeleting] = useState<Client | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  const filters = useMemo<ClientFilters>(
    () => ({
      ...EMPTY_CLIENT_FILTERS,
      ...tabFilters(tab),
      search: debouncedSearch,
      sort,
      order,
      page,
    }),
    [debouncedSearch, tab, sort, order, page],
  )

  const clients = useClients(filters)
  const summary = useClientSummary()
  const { update: updateClient, remove } = useClientMutations()

  const rows = clients.data?.data ?? NO_CLIENTS
  const total = clients.data?.total ?? 0
  const viewing = viewingId ? (rows.find((row) => row.id === viewingId) ?? viewingFallback) : null

  const sorting = useMemo<SortingState>(() => [{ id: sort, desc: order === 'desc' }], [sort, order])
  const sortValue = `${sort}:${order}`

  const applySort = (key: ClientSortKey, direction: 'asc' | 'desc') => {
    setSort(key)
    setOrder(direction)
    setPage(1)
  }

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    const first = next[0]
    if (!first) return
    applySort(first.id as ClientSortKey, first.desc ? 'desc' : 'asc')
  }

  const openEdit = (client: Client | null) => {
    setFormClient(client)
    setFormOpen(true)
  }

  const actions = useMemo<ClientActions>(
    () => ({
      onView: (client) => {
        setViewingId(client.id)
        setViewingFallback(client)
      },
      onNewSale: (client) => navigate(`/ventes?client=${client.id}&nouvelle=1`),
      onEdit: (client) => {
        setFormClient(client)
        setFormOpen(true)
      },
      onArchive: setArchiving,
      onDelete: setDeleting,
    }),
    [navigate],
  )

  const columns = useMemo(() => buildClientColumns(actions), [actions])

  const hasFilters = Boolean(debouncedSearch) || tab !== 'all'

  const update = (apply: () => void) => {
    apply()
    setPage(1)
  }

  const resetFilters = () =>
    update(() => {
      setSearch('')
      setTab('all')
    })

  const handleArchive = async () => {
    if (!archiving) return
    try {
      await updateClient.mutateAsync({
        clientId: archiving.id,
        input: {
          code: archiving.code,
          name: archiving.name,
          phone: archiving.phone ?? '',
          email: archiving.email ?? '',
          address: archiving.address ?? '',
          is_active: !archiving.is_active,
        },
      })
      toast.success(archiving.is_active ? 'Client archivé.' : 'Client réactivé.')
      setArchiving(null)
    } catch (error) {
      toast.error(supabaseErrorMessage(error))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      toast.success('Client supprimé.')
      setDeleting(null)
    } catch {
      setDeleting(null)
      toast.error('Ce client possède des ventes ou des paiements : archivez-le pour préserver l’historique.')
    }
  }

  const counts = summary.data?.counts
  const tabs: SegmentedOption<ClientTab>[] = (Object.keys(TAB_LABELS) as ClientTab[]).map((value) => ({
    value,
    label: TAB_LABELS[value],
    count: counts ? counts[value] : null,
  }))

  return (
    <div className="w-full">
      <PageHeader
        title="Clients"
        description="Répertoire des clients, coordonnées, historique d’achat et encours à percevoir."
        actions={
          <Button onClick={() => openEdit(null)} className="w-full sm:w-auto">
            <Plus className="size-4" />
            Ajouter un client
          </Button>
        }
      />

      <section aria-label="Synthèse clients" className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {summary.isLoading || !summary.data ? (
          Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Clients actifs"
              value={numberFormat.format(summary.data.counts.active)}
              icon={UserCheck}
              tone="primary"
              footer={`${summary.data.counts.all} client${summary.data.counts.all > 1 ? 's' : ''} au total`}
            />
            <StatCard
              label="Avec une créance"
              value={numberFormat.format(summary.data.counts.with_balance)}
              icon={Users}
              tone={summary.data.counts.with_balance > 0 ? 'warning' : 'success'}
              footer={summary.data.counts.with_balance > 0 ? 'Doivent encore de l’argent' : 'Tous à jour'}
            />
            <StatCard
              label="Créances totales"
              value={formatAmount(summary.data.balanceDue)}
              icon={HandCoins}
              tone={summary.data.balanceDue > 0 ? 'danger' : 'success'}
              to="/creances"
              footer="Reste à encaisser"
            />
            <StatCard
              label="Chiffre d’affaires"
              value={formatAmount(summary.data.totalSales)}
              icon={TrendingUp}
              tone="violet"
              footer={`${formatAmount(summary.data.totalPaid)} encaissés`}
            />
          </>
        )}
      </section>

      <Card className="@container mb-4 rounded-xl">
        <div className="space-y-4 p-4">
          <SegmentedTabs label="Filtrer les clients" options={tabs} value={tab} onChange={(value) => update(() => setTab(value))} />
          <div className="flex flex-col gap-2 @2xl:flex-row">
            <SearchInput
              value={search}
              onChange={(event) => update(() => setSearch(event.target.value))}
              onClear={() => update(() => setSearch(''))}
              placeholder="Rechercher par nom, code ou téléphone…"
              className="min-w-0 @2xl:flex-1"
              aria-label="Rechercher un client"
            />
            <Select
              value={sortValue}
              onChange={(event) => {
                const [key, direction] = event.target.value.split(':')
                applySort(key as ClientSortKey, direction as 'asc' | 'desc')
              }}
              aria-label="Trier les clients"
              className="min-w-0 @2xl:w-56"
            >
              {SORT_OPTIONS.some((option) => option.value === sortValue) ? null : (
                <option value={sortValue}>Tri personnalisé</option>
              )}
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {hasFilters ? (
          <ActiveFilters onClearAll={resetFilters}>
            {debouncedSearch ? (
              <FilterChip label={`« ${debouncedSearch} »`} onRemove={() => update(() => setSearch(''))} />
            ) : null}
            {tab !== 'all' ? <FilterChip label={TAB_LABELS[tab]} onRemove={() => update(() => setTab('all'))} /> : null}
          </ActiveFilters>
        ) : null}
      </Card>

      <Card className="@container overflow-hidden rounded-xl">
        {clients.isLoading ? (
          <ListSkeleton label="Chargement des clients…" />
        ) : clients.isError ? (
          <ErrorState message={supabaseErrorMessage(clients.error)} onRetry={() => void clients.refetch()} />
        ) : rows.length === 0 ? (
          hasFilters ? (
            <EmptyState
              title="Aucun client ne correspond à vos filtres."
              description="Modifiez la recherche ou réinitialisez les filtres."
              action={
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Réinitialiser les filtres
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Aucun client enregistré."
              description="Ajoutez vos clients pour créer des ventes et suivre leurs créances."
              icon={<Users className="size-5" />}
              action={
                <Button size="sm" onClick={() => openEdit(null)}>
                  <Plus className="size-4" />
                  Ajouter un client
                </Button>
              }
            />
          )
        ) : (
          <>
            <div
              className={cn('transition-opacity', clients.isPlaceholderData && 'pointer-events-none opacity-60')}
              aria-busy={clients.isFetching}
            >
              <ul className="grid grid-cols-1 gap-3 p-4 @xl:grid-cols-2 @3xl:hidden">
                {rows.map((client) => (
                  <ClientCard key={client.id} client={client} actions={actions} />
                ))}
              </ul>
              <div className="hidden @3xl:block">
                <DataTable
                  columns={columns}
                  data={rows}
                  getRowId={(client) => client.id}
                  sorting={sorting}
                  onSortingChange={handleSortingChange}
                  onRowClick={actions.onView}
                />
              </div>
            </div>
            <Pagination page={page} pageSize={filters.pageSize} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      {formOpen ? <ClientFormDialog client={formClient} onClose={() => setFormOpen(false)} /> : null}

      <ClientDetailsDialog
        client={formOpen ? null : viewing}
        onClose={() => setViewingId(null)}
        onEdit={(client) => openEdit(client)}
        onNewSale={actions.onNewSale}
      />

      <ConfirmDialog
        open={Boolean(archiving)}
        title={archiving?.is_active ? 'Archiver le client ?' : 'Réactiver le client ?'}
        icon={archiving?.is_active ? <Archive className="size-5" /> : <ArchiveRestore className="size-5" />}
        message={
          archiving?.is_active ? (
            <>
              <strong className="text-foreground">{archiving?.name}</strong> ne sera plus proposé dans les
              formulaires de vente. Ses ventes et ses paiements sont conservés.
            </>
          ) : (
            <>
              <strong className="text-foreground">{archiving?.name}</strong> redeviendra disponible dans les
              formulaires de vente.
            </>
          )
        }
        confirmLabel={archiving?.is_active ? 'Archiver' : 'Réactiver'}
        destructive={Boolean(archiving?.is_active)}
        loading={updateClient.isPending}
        onConfirm={() => void handleArchive()}
        onCancel={() => setArchiving(null)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Supprimer le client ?"
        icon={<Trash2 className="size-5" />}
        message={
          <>
            <strong className="text-foreground">{deleting?.name}</strong> sera supprimé définitivement. Cette
            action est irréversible.
            <span className="mt-3 block rounded-lg bg-muted p-3 text-xs">
              Un client ayant déjà des ventes ou des paiements ne peut pas être supprimé : archivez-le pour
              conserver son historique.
            </span>
          </>
        }
        confirmLabel="Supprimer"
        destructive
        loading={remove.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
