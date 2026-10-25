import { useMemo, useState, type MouseEvent } from 'react'
import { createColumnHelper, type OnChangeFn, type SortingState } from '@tanstack/react-table'
import { Archive, ArchiveRestore, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { DataTable } from '../components/ui/data-table'
import type { DataTableFeatures } from '../components/ui/data-table-features'
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/states'
import { Pagination } from '../components/ui/pagination'
import { SearchInput } from '../components/ui/search-input'
import { Select } from '../components/ui/select'
import { useToast } from '../components/ui/toast'
import { ClientFormDialog } from '../components/clients/ClientFormDialog'
import { useClientMutations, useClients } from '../hooks/useClients'
import { useDebounce } from '../hooks/useDebounce'
import { supabaseErrorMessage } from '../lib/supabase'
import { cn, formatAmount, formatQuantity } from '../lib/utils'
import {
  EMPTY_CLIENT_FILTERS,
  type Client,
  type ClientBalance,
  type ClientFilters,
  type ClientSortKey,
} from '../types/database'

type StatusView = 'all' | 'active' | 'archived'
type BalanceView = 'all' | 'with_balance' | 'settled'

const STATUS_VIEWS: { value: StatusView; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actifs' },
  { value: 'archived', label: 'Archivés' },
]

const BALANCE_VIEWS: { value: BalanceView; label: string }[] = [
  { value: 'all', label: 'Toutes créances' },
  { value: 'with_balance', label: 'Avec créance' },
  { value: 'settled', label: 'Soldés' },
]

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'created_at:desc', label: 'Plus récents' },
  { value: 'name:asc', label: 'Nom (A → Z)' },
  { value: 'name:desc', label: 'Nom (Z → A)' },
  { value: 'code:asc', label: 'Code client' },
  { value: 'balance_due:desc', label: 'Créance décroissante' },
  { value: 'total_sales:desc', label: 'Chiffre d’affaires' },
]

const NO_CLIENTS: ClientBalance[] = []
const column = createColumnHelper<DataTableFeatures, ClientBalance>()

const stopPropagation = (event: MouseEvent) => event.stopPropagation()

interface ClientActions {
  onEdit: (client: Client) => void
  onArchive: (client: Client) => void
  onDelete: (client: Client) => void
}

function buildClientColumns(actions: ClientActions) {
  return column.columns([
    column.accessor('name', {
      header: 'Client',
      cell: ({ row }) => {
        const client = row.original
        return (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground" title={client.name}>
              {client.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              <span className="font-mono">{client.code}</span>
              {client.phone ? <span> · {client.phone}</span> : null}
            </p>
          </div>
        )
      },
      meta: { cellClassName: 'w-full max-w-0' },
    }),
    column.accessor('sales_count', {
      header: 'Ventes',
      cell: (info) => (
        <span className="tabular-nums text-muted-foreground">
          {formatQuantity(info.getValue())}
        </span>
      ),
    }),
    column.accessor('balance_due', {
      header: 'Créance',
      cell: (info) => {
        const value = Number(info.getValue())
        if (value <= 0) return <span className="text-muted-foreground">—</span>
        return (
          <span className="font-medium tabular-nums text-danger">{formatAmount(value)}</span>
        )
      },
    }),
    column.accessor('total_sales', {
      header: 'Ventes totales',
      cell: (info) => (
        <span className="tabular-nums text-muted-foreground">{formatAmount(info.getValue())}</span>
      ),
      meta: {
        headerClassName: 'hidden @4xl:table-cell',
        cellClassName: 'hidden tabular-nums @4xl:table-cell',
      },
    }),
    column.accessor('is_active', {
      header: 'Statut',
      cell: (info) =>
        info.getValue() ? (
          <Badge variant="success">Actif</Badge>
        ) : (
          <Badge variant="neutral">Archivé</Badge>
        ),
    }),
    column.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const client = row.original
        return (
          <div className="flex items-center justify-end gap-0.5" onClick={stopPropagation}>
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
              onClick={() => actions.onDelete(client)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )
      },
      meta: { headerClassName: 'w-px', cellClassName: 'py-2' },
    }),
  ])
}

export function ClientsPage() {
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusView>('all')
  const [balance, setBalance] = useState<BalanceView>('all')
  const [sort, setSort] = useState<ClientSortKey>('created_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const [formOpen, setFormOpen] = useState(false)
  const [formClient, setFormClient] = useState<Client | null>(null)
  const [archiving, setArchiving] = useState<Client | null>(null)
  const [deleting, setDeleting] = useState<Client | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  const filters = useMemo<ClientFilters>(
    () => ({
      ...EMPTY_CLIENT_FILTERS,
      search: debouncedSearch,
      status,
      balance,
      sort,
      order,
      page,
    }),
    [debouncedSearch, status, balance, sort, order, page],
  )

  const clients = useClients(filters)
  const { update, remove } = useClientMutations()

  const rows = clients.data?.data ?? NO_CLIENTS
  const total = clients.data?.total ?? 0

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

  const actions = useMemo<ClientActions>(
    () => ({
      onEdit: (client) => {
        setFormClient(client)
        setFormOpen(true)
      },
      onArchive: setArchiving,
      onDelete: setDeleting,
    }),
    [],
  )

  const columns = useMemo(() => buildClientColumns(actions), [actions])

  const hasFilters = Boolean(debouncedSearch) || status !== 'all' || balance !== 'all'

  const resetFilters = () => {
    setSearch('')
    setStatus('all')
    setBalance('all')
    setPage(1)
  }

  const openCreate = () => {
    setFormClient(null)
    setFormOpen(true)
  }

  const handleArchive = async () => {
    if (!archiving) return
    try {
      await update.mutateAsync({
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
      toast.error(
        'Ce client possède des ventes ou des paiements : archivez-le pour préserver l’historique.',
      )
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Clients"
        description="Répertoire des clients, coordonnées et encours à payer."
        actions={
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="size-4" />
            Ajouter un client
          </Button>
        }
      />

      <Card className="@container overflow-hidden rounded-xl">
        <div className="flex flex-col gap-2 border-b border-border p-4 @3xl:flex-row @3xl:items-center">
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
            placeholder="Rechercher par nom, code ou téléphone…"
            className="min-w-0 @3xl:flex-1"
            aria-label="Rechercher un client"
          />

          <div className="grid grid-cols-1 gap-2 @xs:grid-cols-3 @3xl:flex @3xl:shrink-0">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as StatusView)
                setPage(1)
              }}
              aria-label="Filtrer par état"
              className="min-w-0 @3xl:w-36"
            >
              {STATUS_VIEWS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>

            <Select
              value={balance}
              onChange={(event) => {
                setBalance(event.target.value as BalanceView)
                setPage(1)
              }}
              aria-label="Filtrer par créance"
              className="min-w-0 @3xl:w-44"
            >
              {BALANCE_VIEWS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>

            <Select
              value={sortValue}
              onChange={(event) => {
                const [key, direction] = event.target.value.split(':')
                applySort(key as ClientSortKey, direction as 'asc' | 'desc')
              }}
              aria-label="Trier les clients"
              className="min-w-0 @3xl:w-56"
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

          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="self-start @3xl:self-auto">
              <RotateCcw className="size-3.5" />
              Réinitialiser
            </Button>
          ) : null}
        </div>

        {clients.isLoading ? (
          <TableSkeleton rows={6} columns={5} />
        ) : clients.isError ? (
          <ErrorState
            message={supabaseErrorMessage(clients.error)}
            onRetry={() => void clients.refetch()}
          />
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
              description="Ajoutez vos clients pour créer des ventes et suivre les créances."
              action={
                <Button size="sm" onClick={openCreate}>
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
              <DataTable
                columns={columns}
                data={rows}
                getRowId={(client) => client.id}
                sorting={sorting}
                onSortingChange={handleSortingChange}
              />
            </div>
            <Pagination page={page} pageSize={filters.pageSize} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      {formOpen ? (
        <ClientFormDialog client={formClient} onClose={() => setFormOpen(false)} />
      ) : null}

      <ConfirmDialog
        open={Boolean(archiving)}
        title={archiving?.is_active ? 'Archiver le client ?' : 'Réactiver le client ?'}
        icon={archiving?.is_active ? <Archive className="size-5" /> : <ArchiveRestore className="size-5" />}
        message={
          archiving?.is_active ? (
            <>
              <strong className="text-foreground">{archiving?.name}</strong> ne sera plus proposé
              dans les formulaires de vente. Ses ventes et ses paiements sont conservés.
            </>
          ) : (
            <>
              <strong className="text-foreground">{archiving?.name}</strong> redeviendra disponible
              dans les formulaires de vente.
            </>
          )
        }
        confirmLabel={archiving?.is_active ? 'Archiver' : 'Réactiver'}
        destructive={Boolean(archiving?.is_active)}
        loading={update.isPending}
        onConfirm={() => void handleArchive()}
        onCancel={() => setArchiving(null)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Supprimer le client ?"
        icon={<Trash2 className="size-5" />}
        message={
          <>
            <strong className="text-foreground">{deleting?.name}</strong> sera supprimé
            définitivement. Cette action est irréversible.
            <span className="mt-3 block rounded-lg bg-muted p-3 text-xs">
              Un client ayant déjà des ventes ou des paiements ne peut pas être supprimé :
              archivez-le pour conserver son historique.
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
