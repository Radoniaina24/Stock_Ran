import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Download, FilterX, Loader2 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { DataTable } from '../components/ui/data-table'
import type { DataTableFeatures } from '../components/ui/data-table-features'
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/states'
import { FormField } from '../components/ui/form-field'
import { Input } from '../components/ui/input'
import { Pagination } from '../components/ui/pagination'
import { SearchInput } from '../components/ui/search-input'
import { Select } from '../components/ui/select'
import { useToast } from '../components/ui/toast'
import { MovementBadge } from '../components/stock/MovementBadge'
import { useAuth } from '../hooks/useAuth'
import { useDebounce } from '../hooks/useDebounce'
import { fetchMovementsExport, useMovements } from '../hooks/useMovements'
import { useProductOptions } from '../hooks/useProducts'
import { exportMovementsCsv } from '../lib/csv'
import { supabaseErrorMessage } from '../lib/supabase'
import { formatDate, formatQuantity } from '../lib/utils'
import { EMPTY_MOVEMENT_FILTERS, ENTRY_REASONS, EXIT_REASONS } from '../types/database'
import type { MovementFilters, MovementType, StockMovement } from '../types/database'

const PAGE_SIZE = 20
const ALL_REASONS = Array.from(new Set([...ENTRY_REASONS, ...EXIT_REASONS]))

const NO_MOVEMENTS: StockMovement[] = []
const column = createColumnHelper<DataTableFeatures, StockMovement>()

function buildHistoryColumns(userEmail: string) {
  return column.columns([
    column.accessor('created_at', {
      header: 'Date et heure',
      cell: (info) => formatDate(info.getValue()),
      meta: { cellClassName: 'whitespace-nowrap text-muted-foreground' },
    }),
    column.accessor('product_reference', {
      header: 'Référence',
      meta: { cellClassName: 'font-mono text-xs' },
    }),
    column.accessor('product_name', {
      header: 'Produit',
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
    column.accessor('quantity_before', {
      header: 'Stock avant',
      cell: (info) => formatQuantity(info.getValue()),
      meta: { headerClassName: 'text-end', cellClassName: 'text-end text-muted-foreground' },
    }),
    column.accessor('quantity_after', {
      header: 'Stock après',
      cell: (info) => formatQuantity(info.getValue()),
      meta: { headerClassName: 'text-end', cellClassName: 'text-end text-muted-foreground' },
    }),
    column.accessor('reason', {
      header: 'Motif',
      meta: { cellClassName: 'text-muted-foreground' },
    }),
    column.accessor('comment', {
      header: 'Commentaire',
      cell: (info) => <span title={info.getValue() ?? undefined}>{info.getValue() || '—'}</span>,
      meta: { cellClassName: 'max-w-40 truncate text-muted-foreground' },
    }),
    column.display({
      id: 'user',
      header: 'Utilisateur',
      cell: () => <span title={userEmail}>{userEmail}</span>,
      meta: { cellClassName: 'max-w-40 truncate text-muted-foreground' },
    }),
  ])
}

export function HistoryPage() {
  const toast = useToast()
  const { user } = useAuth()

  const [search, setSearch] = useState('')
  const [type, setType] = useState<'all' | MovementType>('all')
  const [productId, setProductId] = useState('')
  const [reason, setReason] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  const debouncedSearch = useDebounce(search, 300)

  const filters = useMemo<MovementFilters>(
    () => ({
      ...EMPTY_MOVEMENT_FILTERS,
      search: debouncedSearch,
      type,
      productId,
      reason,
      from,
      to,
    }),
    [debouncedSearch, type, productId, reason, from, to],
  )

  const movements = useMovements(filters, page, PAGE_SIZE)
  const productOptions = useProductOptions()

  const rows = movements.data?.data ?? NO_MOVEMENTS
  const total = movements.data?.total ?? 0
  const userEmail = user?.email ?? '—'
  const columns = useMemo(() => buildHistoryColumns(userEmail), [userEmail])

  const hasFilters =
    Boolean(debouncedSearch) ||
    type !== 'all' ||
    Boolean(productId) ||
    Boolean(reason) ||
    Boolean(from) ||
    Boolean(to)

  const resetFilters = () => {
    setSearch('')
    setType('all')
    setProductId('')
    setReason('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  const handleExport = async () => {
    if (!user) return
    setExporting(true)
    try {
      const data = await fetchMovementsExport(user.id, filters)
      if (data.length === 0) {
        toast.info('Aucun mouvement à exporter avec ces filtres.')
        return
      }
      exportMovementsCsv(data)
      toast.success(`${data.length} mouvement${data.length > 1 ? 's' : ''} exporté${data.length > 1 ? 's' : ''}.`)
    } catch (error) {
      toast.error(supabaseErrorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Historique des mouvements"
        description="Toutes les entrées, sorties et ajustements, avec les quantités avant et après."
        actions={
          <Button variant="outline" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Exporter en CSV
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Recherche" htmlFor="history-search" className="sm:col-span-2">
            <SearchInput
              id="history-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onClear={() => setSearch('')}
              placeholder="Nom ou référence du produit…"
            />
          </FormField>

          <FormField label="Type de mouvement" htmlFor="history-type">
            <Select
              id="history-type"
              value={type}
              onChange={(event) => setType(event.target.value as 'all' | MovementType)}
            >
              <option value="all">Tous les types</option>
              <option value="entry">Entrées</option>
              <option value="exit">Sorties</option>
              <option value="adjustment">Ajustements</option>
            </Select>
          </FormField>

          <FormField label="Produit" htmlFor="history-product">
            <Select
              id="history-product"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            >
              <option value="">Tous les produits</option>
              {(productOptions.data ?? []).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.reference})
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Motif" htmlFor="history-reason">
            <Select id="history-reason" value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="">Tous les motifs</option>
              {ALL_REASONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Du" htmlFor="history-from">
            <Input
              id="history-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </FormField>

          <FormField label="Au" htmlFor="history-to">
            <Input
              id="history-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </FormField>

          <div className="flex items-end sm:col-span-2 lg:col-span-4">
            {hasFilters ? (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <FilterX className="size-4" />
                Réinitialiser les filtres
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        {movements.isLoading ? (
          <TableSkeleton rows={8} columns={7} />
        ) : movements.isError ? (
          <ErrorState
            message={supabaseErrorMessage(movements.error)}
            onRetry={() => void movements.refetch()}
          />
        ) : rows.length === 0 ? (
          hasFilters ? (
            <EmptyState
              title="Aucun mouvement ne correspond à vos filtres."
              description="Élargissez la période ou réinitialisez les critères."
              action={
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  <FilterX className="size-4" />
                  Réinitialiser les filtres
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Aucun mouvement enregistré."
              description="Enregistrez une entrée ou une sortie pour alimenter l’historique."
            />
          )
        ) : (
          <>
            <DataTable columns={columns} data={rows} getRowId={(movement) => movement.id} />

            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
