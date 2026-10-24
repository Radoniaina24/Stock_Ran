import { useMemo, useState } from 'react'
import { Download, FilterX, Loader2 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/states'
import { FormField } from '../components/ui/form-field'
import { Input } from '../components/ui/input'
import { Pagination } from '../components/ui/pagination'
import { SearchInput } from '../components/ui/search-input'
import { Select } from '../components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
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
import type { MovementFilters, MovementType } from '../types/database'

const PAGE_SIZE = 20
const ALL_REASONS = Array.from(new Set([...ENTRY_REASONS, ...EXIT_REASONS]))

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

  const rows = movements.data?.data ?? []
  const total = movements.data?.total ?? 0
  const userEmail = user?.email ?? '—'

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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date et heure</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead>Produit</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-end">Quantité</TableHead>
                  <TableHead className="text-end">Stock avant</TableHead>
                  <TableHead className="text-end">Stock après</TableHead>
                  <TableHead>Motif</TableHead>
                  <TableHead>Commentaire</TableHead>
                  <TableHead>Utilisateur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(movement.created_at)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {movement.product_reference}
                    </TableCell>
                    <TableCell className="font-medium">{movement.product_name}</TableCell>
                    <TableCell>
                      <MovementBadge type={movement.type} />
                    </TableCell>
                    <TableCell className="text-end font-medium">
                      {formatQuantity(movement.quantity)}
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      {formatQuantity(movement.quantity_before)}
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      {formatQuantity(movement.quantity_after)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{movement.reason}</TableCell>
                    <TableCell className="max-w-40 truncate text-muted-foreground">
                      {movement.comment || '—'}
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-muted-foreground" title={userEmail}>
                      {userEmail}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
