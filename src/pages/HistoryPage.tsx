import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createColumnHelper } from '@tanstack/react-table'
import { ArrowRight, ChevronRight, Download, FilterX, Loader2, SlidersHorizontal, X } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Combobox, type ComboboxOption } from '../components/ui/combobox'
import { DataTable } from '../components/ui/data-table'
import type { DataTableFeatures } from '../components/ui/data-table-features'
import { EmptyState, ErrorState } from '../components/ui/states'
import { FormField } from '../components/ui/form-field'
import { Input } from '../components/ui/input'
import { Pagination } from '../components/ui/pagination'
import { SearchInput } from '../components/ui/search-input'
import { Select } from '../components/ui/select'
import { Skeleton, SkeletonGroup } from '../components/ui/skeleton'
import { useToast } from '../components/ui/toast'
import { MovementBadge } from '../components/stock/MovementBadge'
import { MovementDetailsDialog } from '../components/stock/MovementDetailsDialog'
import {
  deltaClassName,
  formatDelta,
  movementDelta,
  MOVEMENT_STYLES,
} from '../components/stock/movement-style'
import { useAuth } from '../hooks/useAuth'
import { useDebounce } from '../hooks/useDebounce'
import { fetchMovementsExport, useMovementCounts, useMovements } from '../hooks/useMovements'
import { useProductOptions } from '../hooks/useProducts'
import { exportMovementsCsv } from '../lib/csv'
import { DATE_PRESETS, formatDayLabel, groupByDay, matchPreset, presetRange } from '../lib/history'
import { supabaseErrorMessage } from '../lib/supabase'
import { cn, formatDateRange, formatQuantity } from '../lib/utils'
import {
  ADJUSTMENT_REASONS,
  EMPTY_MOVEMENT_FILTERS,
  ENTRY_REASONS,
  EXIT_REASONS,
  type MovementFilters,
  type MovementType,
  type StockMovement,
} from '../types/database'

const PAGE_SIZE = 20
const NO_MOVEMENTS: StockMovement[] = []
const TYPES: MovementType[] = ['entry', 'exit', 'adjustment']

const REASONS_BY_TYPE: Record<'all' | MovementType, readonly string[]> = {
  all: Array.from(new Set([...ENTRY_REASONS, ...EXIT_REASONS, ...ADJUSTMENT_REASONS])),
  entry: ENTRY_REASONS,
  exit: EXIT_REASONS,
  adjustment: ADJUSTMENT_REASONS,
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const column = createColumnHelper<DataTableFeatures, StockMovement>()

function buildHistoryColumns(onOpen: (movement: StockMovement) => void) {
  return column.columns([
    column.accessor('created_at', {
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
    column.accessor('product_name', {
      header: 'Produit',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="max-w-56 truncate font-medium text-foreground" title={row.original.product_name}>
            {row.original.product_name}
          </p>
          <p className="font-mono text-xs text-muted-foreground">{row.original.product_reference}</p>
        </div>
      ),
    }),
    column.accessor('type', {
      header: 'Type',
      cell: (info) => <MovementBadge type={info.getValue()} />,
    }),
    column.display({
      id: 'delta',
      header: 'Variation',
      cell: ({ row }) => {
        const delta = movementDelta(row.original)
        return <span className={cn('font-semibold tabular-nums', deltaClassName(delta))}>{formatDelta(delta)}</span>
      },
      meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
    }),
    column.display({
      id: 'stock',
      header: 'Stock',
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
          <span className="text-muted-foreground">{formatQuantity(row.original.quantity_before)}</span>
          <ArrowRight className="size-3 text-muted-foreground" aria-label="vers" />
          <span className="font-medium text-foreground">{formatQuantity(row.original.quantity_after)}</span>
        </span>
      ),
      meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
    }),
    column.accessor('reason', {
      header: 'Motif',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-foreground">{capitalize(row.original.reason)}</p>
          {row.original.comment ? (
            <p className="max-w-56 truncate text-xs text-muted-foreground" title={row.original.comment}>
              {row.original.comment}
            </p>
          ) : null}
        </div>
      ),
    }),
    column.display({
      id: 'open',
      header: () => <span className="sr-only">Détails</span>,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          aria-label={`Voir le détail du mouvement de ${row.original.product_name}`}
          onClick={(event) => {
            event.stopPropagation()
            onOpen(row.original)
          }}
        >
          <ChevronRight className="size-4" />
        </Button>
      ),
      meta: { headerClassName: 'w-px', cellClassName: 'py-2 pe-3' },
    }),
  ])
}

function MovementTimeline({ rows, onOpen }: { rows: StockMovement[]; onOpen: (movement: StockMovement) => void }) {
  const [now] = useState(() => new Date())
  const groups = groupByDay(rows)

  return (
    <div>
      {groups.map((group) => (
        <section key={group.date} aria-label={formatDayLabel(group.date, now)}>
          <h3 className="sticky top-14 z-[5] flex items-center justify-between border-y border-border bg-muted/90 px-4 py-2 text-xs font-semibold text-muted-foreground backdrop-blur first:border-t-0 md:top-0">
            {formatDayLabel(group.date, now)}
            <span className="font-normal">
              {group.items.length} mouvement{group.items.length > 1 ? 's' : ''}
            </span>
          </h3>
          <ul className="divide-y divide-border">
            {group.items.map((movement) => {
              const style = MOVEMENT_STYLES[movement.type]
              const delta = movementDelta(movement)
              return (
                <li key={movement.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(movement)}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-start transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/60"
                  >
                    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', style.soft)}>
                      <style.icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{movement.product_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {timeFormat.format(new Date(movement.created_at))} · {capitalize(movement.reason)}
                        {movement.comment ? ` · ${movement.comment}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-end">
                      <span className={cn('block text-sm font-semibold tabular-nums', deltaClassName(delta))}>
                        {formatDelta(delta)}
                      </span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        → {formatQuantity(movement.quantity_after)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

function HistorySkeleton() {
  return (
    <SkeletonGroup label="Chargement de l’historique…">
      <div className="lg:hidden">
        {Array.from({ length: 2 }, (_, group) => (
          <div key={group}>
            <div className="flex justify-between border-y border-border bg-muted/60 px-4 py-2.5 first:border-t-0">
              <Skeleton className="h-3 w-24 bg-muted" />
              <Skeleton className="h-3 w-16 bg-muted" />
            </div>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <Skeleton className="size-9 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="ms-auto h-3.5 w-10" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="hidden lg:block">
        <div className="flex gap-6 bg-muted/60 px-4 py-3.5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-3 flex-1 bg-muted" />
          ))}
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-t border-border px-4 py-3">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="flex-1">
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 flex-1" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-card py-1 ps-3 pe-1 text-xs font-medium text-foreground">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Retirer le filtre ${label}`}
        className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

export function HistoryPage() {
  const toast = useToast()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [type, setType] = useState<'all' | MovementType>('all')
  const [productId, setProductId] = useState(searchParams.get('produit') ?? '')
  const [reason, setReason] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selected, setSelected] = useState<StockMovement | null>(null)

  const debouncedSearch = useDebounce(search, 300)
  const columns = useMemo(() => buildHistoryColumns(setSelected), [])

  const filters = useMemo<MovementFilters>(
    () => ({ ...EMPTY_MOVEMENT_FILTERS, search: debouncedSearch, type, productId, reason, from, to }),
    [debouncedSearch, type, productId, reason, from, to],
  )

  const movements = useMovements(filters, page, PAGE_SIZE)
  const counts = useMovementCounts(filters)
  const productOptions = useProductOptions()

  const rows = movements.data?.data ?? NO_MOVEMENTS
  const total = movements.data?.total ?? 0
  const allCount = counts.data ? counts.data.entry + counts.data.exit + counts.data.adjustment : null

  const productList = productOptions.data
  const options = useMemo<ComboboxOption[]>(
    () =>
      (productList ?? []).map((option) => ({
        value: option.id,
        label: option.name,
        description: option.reference,
      })),
    [productList],
  )
  const selectedProduct = productList?.find((option) => option.id === productId)

  const activePreset = matchPreset(from, to)
  const advancedCount = Number(Boolean(productId)) + Number(Boolean(reason)) + Number(Boolean(from || to))
  const hasFilters = Boolean(debouncedSearch) || type !== 'all' || advancedCount > 0

  const update = (apply: () => void) => {
    apply()
    setPage(1)
  }

  const resetFilters = () =>
    update(() => {
      setSearch('')
      setType('all')
      setProductId('')
      setReason('')
      setFrom('')
      setTo('')
    })

  const userLabel = (movement: StockMovement) =>
    movement.created_by && movement.created_by === user?.id ? (user.email ?? 'Vous') : (movement.created_by ?? '—')

  const periodLabel = activePreset
    ? DATE_PRESETS.find((preset) => preset.value === activePreset)!.label
    : from && to
      ? `Du ${formatDateRange(`${from}T00:00:00`)} au ${formatDateRange(`${to}T00:00:00`)}`
      : from
        ? `Depuis le ${formatDateRange(`${from}T00:00:00`)}`
        : to
          ? `Jusqu’au ${formatDateRange(`${to}T00:00:00`)}`
          : ''

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

  const tabs: { value: 'all' | MovementType; label: string; count: number | null }[] = [
    { value: 'all', label: 'Tous', count: allCount },
    ...TYPES.map((value) => ({
      value,
      label: MOVEMENT_STYLES[value].label,
      count: counts.data ? counts.data[value] : null,
    })),
  ]

  return (
    <div className="w-full">
      <PageHeader
        title="Historique des mouvements"
        description="Retrouvez chaque entrée, sortie et ajustement avec l’état du stock avant et après."
        actions={
          <Button
            variant="outline"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="w-full sm:w-auto"
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Exporter en CSV
          </Button>
        }
      />

      <Card className="mb-4 rounded-xl">
        <div className="space-y-4 p-4">
          <div
            role="group"
            aria-label="Filtrer par type"
            className="-mx-4 flex overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
          >
            <div className="inline-flex shrink-0 rounded-lg bg-muted p-1">
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  aria-pressed={type === tab.value}
                  onClick={() =>
                    update(() => {
                      setType(tab.value)
                      if (reason && !REASONS_BY_TYPE[tab.value].includes(reason)) setReason('')
                    })
                  }
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    type === tab.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      'min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] tabular-nums',
                      type === tab.value ? 'bg-muted text-foreground' : 'bg-card/70 text-muted-foreground',
                    )}
                  >
                    {tab.count ?? '·'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <SearchInput
              value={search}
              onChange={(event) => update(() => setSearch(event.target.value))}
              onClear={() => update(() => setSearch(''))}
              placeholder="Rechercher un produit par nom ou référence…"
              aria-label="Rechercher un mouvement"
              className="flex-1"
            />
            <Button
              variant="outline"
              className="shrink-0 lg:hidden"
              aria-expanded={filtersOpen}
              aria-controls="history-filters"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal className="size-4" />
              <span className="hidden sm:inline">Filtres</span>
              {advancedCount > 0 ? (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
                  {advancedCount}
                </span>
              ) : null}
            </Button>
          </div>

          <div
            id="history-filters"
            className={cn('gap-4 border-t border-border pt-4 lg:grid', filtersOpen ? 'grid' : 'hidden')}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="me-1 text-sm font-medium text-foreground">Période</span>
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  aria-pressed={activePreset === preset.value}
                  onClick={() =>
                    update(() => {
                      if (activePreset === preset.value) {
                        setFrom('')
                        setTo('')
                      } else {
                        const range = presetRange(preset.value)
                        setFrom(range.from)
                        setTo(range.to)
                      }
                    })
                  }
                  className={cn(
                    'cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    activePreset === preset.value
                      ? 'border-primary bg-primary-soft font-medium text-primary'
                      : 'border-border text-foreground hover:bg-muted',
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Produit" htmlFor="history-product">
                <Combobox
                  id="history-product"
                  options={options}
                  value={productId}
                  onChange={(value) => update(() => setProductId(value))}
                  placeholder="Tous les produits"
                  emptyText="Aucun produit ne correspond."
                />
              </FormField>

              <FormField label="Motif" htmlFor="history-reason">
                <Select
                  id="history-reason"
                  value={reason}
                  onChange={(event) => update(() => setReason(event.target.value))}
                  className="h-10 rounded-lg"
                >
                  <option value="">Tous les motifs</option>
                  {REASONS_BY_TYPE[type].map((value) => (
                    <option key={value} value={value}>
                      {capitalize(value)}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Du" htmlFor="history-from">
                <Input
                  id="history-from"
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(event) => update(() => setFrom(event.target.value))}
                  className="h-10 rounded-lg"
                />
              </FormField>

              <FormField label="Au" htmlFor="history-to">
                <Input
                  id="history-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(event) => update(() => setTo(event.target.value))}
                  className="h-10 rounded-lg"
                />
              </FormField>
            </div>
          </div>
        </div>

        {hasFilters ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-4 py-3">
            <span className="text-xs text-muted-foreground">Filtres actifs :</span>
            {debouncedSearch ? (
              <FilterChip label={`« ${debouncedSearch} »`} onRemove={() => update(() => setSearch(''))} />
            ) : null}
            {type !== 'all' ? (
              <FilterChip label={MOVEMENT_STYLES[type].label} onRemove={() => update(() => setType('all'))} />
            ) : null}
            {productId ? (
              <FilterChip
                label={selectedProduct ? selectedProduct.name : 'Produit'}
                onRemove={() => update(() => setProductId(''))}
              />
            ) : null}
            {reason ? <FilterChip label={capitalize(reason)} onRemove={() => update(() => setReason(''))} /> : null}
            {periodLabel ? (
              <FilterChip
                label={periodLabel}
                onRemove={() =>
                  update(() => {
                    setFrom('')
                    setTo('')
                  })
                }
              />
            ) : null}
            <Button variant="ghost" size="sm" onClick={resetFilters} className="ms-auto">
              <FilterX className="size-3.5" />
              Tout effacer
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="overflow-clip rounded-xl">
        {movements.isLoading ? (
          <HistorySkeleton />
        ) : movements.isError ? (
          <ErrorState message={supabaseErrorMessage(movements.error)} onRetry={() => void movements.refetch()} />
        ) : rows.length === 0 ? (
          hasFilters ? (
            <EmptyState
              title="Aucun mouvement ne correspond à vos filtres."
              description="Élargissez la période ou retirez certains critères."
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
            <div
              className={cn('transition-opacity', movements.isPlaceholderData && 'pointer-events-none opacity-60')}
              aria-busy={movements.isFetching}
            >
              <div className="lg:hidden">
                <MovementTimeline rows={rows} onOpen={setSelected} />
              </div>
              <div className="hidden lg:block">
                <DataTable
                  columns={columns}
                  data={rows}
                  getRowId={(movement) => movement.id}
                  onRowClick={setSelected}
                />
              </div>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <MovementDetailsDialog
        movement={selected}
        userLabel={userLabel}
        onClose={() => setSelected(null)}
        onFilterProduct={(movement) =>
          update(() => {
            setProductId(movement.product_id)
            setFiltersOpen(true)
          })
        }
      />
    </div>
  )
}
