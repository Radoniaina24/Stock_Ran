import { useMemo, useState, type MouseEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createColumnHelper, type OnChangeFn, type SortingState } from '@tanstack/react-table'
import {
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  Eye,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { DataTable } from '../components/ui/data-table'
import type { DataTableFeatures } from '../components/ui/data-table-features'
import { EmptyState, ErrorState } from '../components/ui/states'
import { Pagination } from '../components/ui/pagination'
import { SearchInput } from '../components/ui/search-input'
import { Select } from '../components/ui/select'
import { Skeleton, SkeletonGroup } from '../components/ui/skeleton'
import { useToast } from '../components/ui/toast'
import { ActiveBadge, StockBadge } from '../components/products/StatusBadge'
import { ProductAvatar, StockLevelBar } from '../components/products/ProductVisuals'
import { ProductDetailsDialog } from '../components/products/ProductDetailsDialog'
import { ProductFormDialog } from '../components/products/ProductFormDialog'
import { MovementDialog } from '../components/stock/MovementDialog'
import { useCategories, useProductMutations, useProducts } from '../hooks/useProducts'
import { useDebounce } from '../hooks/useDebounce'
import { getProductStatus } from '../lib/stock'
import { cn, formatQuantity } from '../lib/utils'
import { supabaseErrorMessage } from '../lib/supabase'
import {
  EMPTY_PRODUCT_FILTERS,
  type Product,
  type ProductFilters,
  type ProductSortKey,
} from '../types/database'

type View = 'all' | 'active' | 'low' | 'archived'

const VIEWS: { value: View; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actifs' },
  { value: 'low', label: 'Stock faible' },
  { value: 'archived', label: 'Archivés' },
]

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'created_at:desc', label: 'Plus récents' },
  { value: 'created_at:asc', label: 'Plus anciens' },
  { value: 'name:asc', label: 'Nom (A → Z)' },
  { value: 'name:desc', label: 'Nom (Z → A)' },
  { value: 'reference:asc', label: 'Référence' },
  { value: 'quantity:asc', label: 'Quantité croissante' },
  { value: 'quantity:desc', label: 'Quantité décroissante' },
]

interface ProductActions {
  onView: (product: Product) => void
  onMovement: (product: Product) => void
  onEdit: (product: Product) => void
  onArchive: (product: Product) => void
  onDelete: (product: Product) => void
}

const NO_PRODUCTS: Product[] = []
const column = createColumnHelper<DataTableFeatures, Product>()

const stopPropagation = (event: MouseEvent) => event.stopPropagation()

function ProductStatus({ product }: { product: Product }) {
  return product.is_active ? (
    <StockBadge status={getProductStatus(product)} />
  ) : (
    <ActiveBadge isActive={false} />
  )
}

function RowActions({ product, actions, withDetails = true }: { product: Product; actions: ProductActions; withDetails?: boolean }) {
  return (
    <div className="flex items-center justify-end gap-0.5" onClick={stopPropagation}>
      {withDetails ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title="Voir les détails"
          aria-label={`Voir les détails de ${product.name}`}
          onClick={() => actions.onView(product)}
        >
          <Eye className="size-4" />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        title="Mouvement de stock"
        aria-label={`Enregistrer un mouvement pour ${product.name}`}
        disabled={!product.is_active}
        onClick={() => actions.onMovement(product)}
      >
        <ArrowLeftRight className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        title="Modifier"
        aria-label={`Modifier ${product.name}`}
        disabled={!product.is_active}
        onClick={() => actions.onEdit(product)}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        title={product.is_active ? 'Archiver' : 'Réactiver'}
        aria-label={product.is_active ? `Archiver ${product.name}` : `Réactiver ${product.name}`}
        onClick={() => actions.onArchive(product)}
      >
        {product.is_active ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-danger hover:bg-danger-soft hover:text-danger"
        title="Supprimer"
        aria-label={`Supprimer ${product.name}`}
        disabled={!product.is_active}
        onClick={() => actions.onDelete(product)}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

function buildProductColumns(actions: ProductActions) {
  return column.columns([
    column.accessor('name', {
      header: 'Produit',
      cell: ({ row }) => {
        const product = row.original
        return (
          <div className="flex min-w-0 items-center gap-3">
            <ProductAvatar status={getProductStatus(product)} archived={!product.is_active} />
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground" title={product.name}>
                {product.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{product.reference}</span>
                {product.category ? <span className="@5xl:hidden"> · {product.category}</span> : null}
              </p>
            </div>
          </div>
        )
      },
      // Colonne extensible : occupe l'espace restant et tronque le nom au lieu d'élargir le tableau.
      meta: { cellClassName: 'w-full max-w-0' },
    }),
    column.accessor('category', {
      header: 'Catégorie',
      cell: (info) =>
        info.getValue() ? (
          <Badge variant="neutral" className="max-w-40 truncate font-normal">
            {info.getValue()}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      meta: {
        headerClassName: 'hidden @5xl:table-cell',
        cellClassName: 'hidden @5xl:table-cell',
      },
    }),
    column.accessor('quantity', {
      header: 'Stock',
      cell: ({ row }) => {
        const product = row.original
        return (
          <div className="w-32">
            <p className="text-sm tabular-nums">
              <span className="font-semibold text-foreground">{formatQuantity(product.quantity)}</span>
              <span className="ms-1 text-xs text-muted-foreground">{product.unit}</span>
            </p>
            <StockLevelBar
              className="mt-1.5"
              quantity={product.quantity}
              threshold={product.low_stock_threshold}
              status={getProductStatus(product)}
              muted={!product.is_active}
            />
          </div>
        )
      },
    }),
    column.accessor('low_stock_threshold', {
      header: 'Seuil',
      cell: (info) => formatQuantity(info.getValue()),
      meta: {
        headerClassName: 'hidden @6xl:table-cell',
        cellClassName: 'hidden text-muted-foreground tabular-nums @6xl:table-cell',
      },
    }),
    column.display({
      id: 'status',
      header: 'Statut',
      cell: ({ row }) => <ProductStatus product={row.original} />,
    }),
    column.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <RowActions product={row.original} actions={actions} />,
      meta: { headerClassName: 'w-px', cellClassName: 'py-2' },
    }),
  ])
}

function ProductCard({ product, actions }: { product: Product; actions: ProductActions }) {
  const status = getProductStatus(product)

  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-border bg-card transition-all hover:border-primary/25 hover:shadow-sm">
      <button
        type="button"
        onClick={() => actions.onView(product)}
        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-3 rounded-t-xl p-4 text-start outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        aria-label={`Voir les détails de ${product.name}`}
      >
        <div className="flex w-full min-w-0 items-start gap-3">
          <ProductAvatar status={status} archived={!product.is_active} />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 break-words text-sm font-medium text-foreground" title={product.name}>
              {product.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              <span className="font-mono">{product.reference}</span>
              {product.category ? <span> · {product.category}</span> : null}
            </p>
          </div>
        </div>

        <div className="w-full">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              <span className="text-base font-semibold text-foreground tabular-nums">
                {formatQuantity(product.quantity)}
              </span>{' '}
              {product.unit}
            </p>
            <ProductStatus product={product} />
          </div>
          <StockLevelBar
            className="mt-2"
            quantity={product.quantity}
            threshold={product.low_stock_threshold}
            status={status}
            muted={!product.is_active}
          />
          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
            Seuil d’alerte : {formatQuantity(product.low_stock_threshold)} {product.unit}
          </p>
        </div>
      </button>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border px-2 py-1.5">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => actions.onView(product)}>
          <Eye className="size-3.5" />
          Détails
        </Button>
        <RowActions product={product} actions={actions} withDetails={false} />
      </div>
    </li>
  )
}

function ProductsSkeleton() {
  return (
    <SkeletonGroup label="Chargement des produits…">
      <ul className="grid grid-cols-1 gap-3 p-4 @xl:grid-cols-2 @3xl:hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="rounded-xl border border-border p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
          </li>
        ))}
      </ul>
      <div className="hidden @3xl:block">
        <div className="flex gap-6 bg-muted/60 px-4 py-3.5">
          {['w-40', 'w-20', 'w-16', 'w-14'].map((width, i) => (
            <Skeleton key={i} className={cn('h-3 bg-muted', width, i === 0 && 'me-auto')} />
          ))}
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-t border-border px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-full max-w-44" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="hidden h-5 w-20 rounded-full @5xl:block" />
            <div className="w-32 space-y-1.5">
              <Skeleton className="h-3.5 w-14" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-7 w-28" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  )
}

export function ProductsPage() {
  const toast = useToast()
  const [searchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [view, setView] = useState<View>(searchParams.get('stock') === 'faible' ? 'low' : 'all')
  const [sort, setSort] = useState<ProductSortKey>('created_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const [formOpen, setFormOpen] = useState(false)
  const [formProduct, setFormProduct] = useState<Product | null>(null)
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null)
  const [movementProduct, setMovementProduct] = useState<Product | null>(null)
  const [archiving, setArchiving] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState<Product | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  const filters = useMemo<ProductFilters>(
    () => ({
      ...EMPTY_PRODUCT_FILTERS,
      search: debouncedSearch,
      category,
      status: view === 'low' ? 'active' : view,
      lowStockOnly: view === 'low',
      sort,
      order,
      page,
    }),
    [debouncedSearch, category, view, sort, order, page],
  )

  const products = useProducts(filters)
  const categories = useCategories()
  const { setActive, remove } = useProductMutations()

  const rows = products.data?.data ?? NO_PRODUCTS
  const total = products.data?.total ?? 0

  const sorting = useMemo<SortingState>(() => [{ id: sort, desc: order === 'desc' }], [sort, order])
  const sortValue = `${sort}:${order}`

  const applySort = (key: ProductSortKey, direction: 'asc' | 'desc') => {
    setSort(key)
    setOrder(direction)
    setPage(1)
  }

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    const first = next[0]
    if (!first) return
    applySort(first.id as ProductSortKey, first.desc ? 'desc' : 'asc')
  }

  const openCreate = () => {
    setFormProduct(null)
    setFormOpen(true)
  }

  const actions = useMemo<ProductActions>(
    () => ({
      onView: setDetailsProduct,
      onMovement: setMovementProduct,
      onEdit: (product) => {
        setFormProduct(product)
        setFormOpen(true)
      },
      onArchive: setArchiving,
      onDelete: setDeleting,
    }),
    [],
  )

  const columns = useMemo(() => buildProductColumns(actions), [actions])

  const hasFilters = Boolean(debouncedSearch) || Boolean(category) || view !== 'all'

  const resetFilters = () => {
    setSearch('')
    setCategory('')
    setView('all')
    setPage(1)
  }

  const handleArchive = async () => {
    if (!archiving) return
    try {
      await setActive.mutateAsync({ productId: archiving.id, isActive: !archiving.is_active })
      toast.success(archiving.is_active ? 'Produit archivé.' : 'Produit réactivé.')
      setArchiving(null)
    } catch (error) {
      toast.error(supabaseErrorMessage(error))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      toast.success('Produit supprimé.')
      setDeleting(null)
    } catch {
      setDeleting(null)
      toast.error(
        'Ce produit possède déjà des mouvements : utilisez l’archivage pour préserver l’historique.',
      )
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Produits"
        description="Gérez votre catalogue, suivez les niveaux de stock et les seuils d’alerte."
        actions={
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="size-4" />
            Ajouter un produit
          </Button>
        }
      />

      <Card className="@container overflow-hidden rounded-xl">
        <div className="space-y-3 border-b border-border p-4">
          <div
            role="group"
            aria-label="Filtrer par état"
            className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
          >
            <div className="inline-flex shrink-0 rounded-lg bg-muted p-1">
              {VIEWS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={view === item.value}
                  onClick={() => {
                    setView(item.value)
                    setPage(1)
                  }}
                  className={cn(
                    'cursor-pointer whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    view === item.value
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

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
              placeholder="Rechercher par référence ou nom…"
              className="min-w-0 @3xl:flex-1"
              aria-label="Rechercher un produit"
            />

            <div className="grid grid-cols-1 gap-2 @xs:grid-cols-2 @3xl:flex @3xl:shrink-0">
              <Select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value)
                  setPage(1)
                }}
                aria-label="Filtrer par catégorie"
                className="min-w-0 @3xl:w-48"
              >
                <option value="">Toutes catégories</option>
                {(categories.data ?? []).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>

              <Select
                value={sortValue}
                onChange={(event) => {
                  const [key, direction] = event.target.value.split(':')
                  applySort(key as ProductSortKey, direction as 'asc' | 'desc')
                }}
                aria-label="Trier les produits"
                className="min-w-0 @3xl:hidden"
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
        </div>

        {products.isLoading ? (
          <ProductsSkeleton />
        ) : products.isError ? (
          <ErrorState
            message={supabaseErrorMessage(products.error)}
            onRetry={() => void products.refetch()}
          />
        ) : rows.length === 0 ? (
          hasFilters ? (
            <EmptyState
              title="Aucun produit ne correspond à vos filtres."
              description="Modifiez la recherche ou réinitialisez les filtres."
              action={
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Réinitialiser les filtres
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Aucun produit enregistré."
              description="Ajoutez votre premier produit pour commencer à suivre votre stock."
              action={
                <Button size="sm" onClick={openCreate}>
                  <Plus className="size-4" />
                  Ajouter un produit
                </Button>
              }
            />
          )
        ) : (
          <>
            <div
              className={cn('transition-opacity', products.isPlaceholderData && 'pointer-events-none opacity-60')}
              aria-busy={products.isFetching}
            >
              <ul className="grid grid-cols-1 gap-3 p-4 @xl:grid-cols-2 @3xl:hidden">
                {rows.map((product) => (
                  <ProductCard key={product.id} product={product} actions={actions} />
                ))}
              </ul>
              <div className="hidden @3xl:block">
                <DataTable
                  columns={columns}
                  data={rows}
                  getRowId={(product) => product.id}
                  sorting={sorting}
                  onSortingChange={handleSortingChange}
                  onRowClick={setDetailsProduct}
                />
              </div>
            </div>

            <Pagination page={page} pageSize={filters.pageSize} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      {formOpen ? (
        <ProductFormDialog product={formProduct} onClose={() => setFormOpen(false)} />
      ) : null}

      <ProductDetailsDialog
        product={detailsProduct}
        onClose={() => setDetailsProduct(null)}
        onEdit={actions.onEdit}
        onMovement={actions.onMovement}
      />

      <MovementDialog product={movementProduct} onClose={() => setMovementProduct(null)} />

      <ConfirmDialog
        open={Boolean(archiving)}
        title={archiving?.is_active ? 'Archiver le produit ?' : 'Réactiver le produit ?'}
        icon={archiving?.is_active ? <Archive className="size-5" /> : <ArchiveRestore className="size-5" />}
        message={
          archiving?.is_active ? (
            <>
              <strong className="text-foreground">{archiving?.name}</strong> sera masqué des
              formulaires de stock. Son historique de mouvements est conservé et vous pourrez le
              réactiver à tout moment.
            </>
          ) : (
            <>
              <strong className="text-foreground">{archiving?.name}</strong> redeviendra disponible
              dans les formulaires de stock.
            </>
          )
        }
        confirmLabel={archiving?.is_active ? 'Archiver' : 'Réactiver'}
        destructive={Boolean(archiving?.is_active)}
        loading={setActive.isPending}
        onConfirm={() => void handleArchive()}
        onCancel={() => setArchiving(null)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Supprimer le produit ?"
        icon={<Trash2 className="size-5" />}
        message={
          <>
            <strong className="text-foreground">{deleting?.name}</strong> sera supprimé
            définitivement. Cette action est irréversible.
            <span className="mt-3 block rounded-lg bg-muted p-3 text-xs">
              Un produit ayant déjà des mouvements ne peut pas être supprimé : archivez-le pour
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
