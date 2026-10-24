import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createColumnHelper, type OnChangeFn, type SortingState } from '@tanstack/react-table'
import { Eye, Pencil, Plus, Trash2, Archive, ArchiveRestore } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Checkbox } from '../components/ui/checkbox'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { DataTable } from '../components/ui/data-table'
import type { DataTableFeatures } from '../components/ui/data-table-features'
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/states'
import { Pagination } from '../components/ui/pagination'
import { SearchInput } from '../components/ui/search-input'
import { Select } from '../components/ui/select'
import { useToast } from '../components/ui/toast'
import { ActiveBadge, StockBadge } from '../components/products/StatusBadge'
import { ProductDetailsDialog } from '../components/products/ProductDetailsDialog'
import { ProductFormDialog } from '../components/products/ProductFormDialog'
import { useCategories, useProductMutations, useProducts } from '../hooks/useProducts'
import { useDebounce } from '../hooks/useDebounce'
import { formatQuantity } from '../lib/utils'
import { supabaseErrorMessage } from '../lib/supabase'
import {
  EMPTY_PRODUCT_FILTERS,
  type Product,
  type ProductFilters,
  type ProductSortKey,
} from '../types/database'

type StatusFilter = ProductFilters['status']

interface ProductActions {
  onView: (product: Product) => void
  onEdit: (product: Product) => void
  onArchive: (product: Product) => void
  onDelete: (product: Product) => void
}

const NO_PRODUCTS: Product[] = []
const column = createColumnHelper<DataTableFeatures, Product>()

function buildProductColumns(actions: ProductActions) {
  return column.columns([
    column.accessor('reference', {
      header: 'Référence',
      meta: { cellClassName: 'font-mono text-xs' },
    }),
    column.accessor('name', {
      header: 'Nom',
      meta: { cellClassName: 'font-medium' },
    }),
    column.accessor('category', {
      header: 'Catégorie',
      cell: (info) => info.getValue() || '—',
      meta: { cellClassName: 'text-muted-foreground' },
    }),
    column.accessor('quantity', {
      header: 'Quantité',
      cell: (info) => formatQuantity(info.getValue()),
      meta: { cellClassName: 'font-medium' },
    }),
    column.accessor('low_stock_threshold', {
      header: 'Seuil',
      cell: (info) => formatQuantity(info.getValue()),
      meta: { cellClassName: 'text-muted-foreground' },
    }),
    column.accessor('unit', {
      header: 'Unité',
      enableSorting: false,
      meta: { cellClassName: 'text-muted-foreground' },
    }),
    column.display({
      id: 'status',
      header: 'Statut',
      cell: ({ row }) => {
        const product = row.original
        return (
          <div className="flex flex-wrap gap-1.5">
            {product.is_active ? (
              <StockBadge
                status={
                  product.quantity <= 0
                    ? 'out'
                    : product.quantity <= product.low_stock_threshold
                      ? 'low'
                      : 'ok'
                }
              />
            ) : (
              <ActiveBadge isActive={false} />
            )}
          </div>
        )
      },
    }),
    column.display({
      id: 'actions',
      header: 'Actions',
      meta: { headerClassName: 'text-end' },
      cell: ({ row }) => {
        const product = row.original
        return (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              title="Voir les détails"
              aria-label={`Voir les détails de ${product.name}`}
              onClick={() => actions.onView(product)}
            >
              <Eye className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
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
              title={product.is_active ? 'Archiver' : 'Réactiver'}
              aria-label={product.is_active ? `Archiver ${product.name}` : `Réactiver ${product.name}`}
              onClick={() => actions.onArchive(product)}
            >
              {product.is_active ? (
                <Archive className="size-4" />
              ) : (
                <ArchiveRestore className="size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Supprimer"
              aria-label={`Supprimer ${product.name}`}
              disabled={!product.is_active}
              className="text-danger hover:bg-danger-soft hover:text-danger"
              onClick={() => actions.onDelete(product)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )
      },
    }),
  ])
}

export function ProductsPage() {
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const lowStockLink = searchParams.get('stock') === 'faible'

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<StatusFilter>(lowStockLink ? 'active' : 'all')
  const [lowStockOnly, setLowStockOnly] = useState(lowStockLink)
  const [sort, setSort] = useState<ProductSortKey>('created_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const [formOpen, setFormOpen] = useState(false)
  const [formProduct, setFormProduct] = useState<Product | null>(null)
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null)
  const [archiving, setArchiving] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState<Product | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  const filters = useMemo<ProductFilters>(
    () => ({
      ...EMPTY_PRODUCT_FILTERS,
      search: debouncedSearch,
      category,
      status,
      lowStockOnly,
      sort,
      order,
      page,
    }),
    [debouncedSearch, category, status, lowStockOnly, sort, order, page],
  )

  const products = useProducts(filters)
  const categories = useCategories()
  const { setActive, remove } = useProductMutations()

  const rows = products.data?.data ?? NO_PRODUCTS
  const total = products.data?.total ?? 0

  const sorting = useMemo<SortingState>(() => [{ id: sort, desc: order === 'desc' }], [sort, order])

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    const first = next[0]
    if (!first) return
    setSort(first.id as ProductSortKey)
    setOrder(first.desc ? 'desc' : 'asc')
    setPage(1)
  }

  const columns = useMemo(
    () =>
      buildProductColumns({
        onView: setDetailsProduct,
        onEdit: (product) => {
          setFormProduct(product)
          setFormOpen(true)
        },
        onArchive: setArchiving,
        onDelete: setDeleting,
      }),
    [],
  )

  const hasFilters =
    Boolean(debouncedSearch) || Boolean(category) || status !== 'all' || lowStockOnly

  const resetFilters = () => {
    setSearch('')
    setCategory('')
    setStatus('all')
    setLowStockOnly(false)
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
    <>
      <PageHeader
        title="Produits"
        description="Catalogue des produits et quantités disponibles."
        actions={
          <Button
            onClick={() => {
              setFormProduct(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" />
            Ajouter un produit
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
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
            className="min-w-56 flex-1"
            aria-label="Rechercher un produit"
          />

          <Select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value)
              setPage(1)
            }}
            aria-label="Filtrer par catégorie"
            className="w-44"
          >
            <option value="">Toutes les catégories</option>
            {(categories.data ?? []).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>

          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as StatusFilter)
              setPage(1)
            }}
            aria-label="Filtrer par statut"
            className="w-40"
          >
            <option value="all">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="archived">Archivés</option>
          </Select>

          <Checkbox
            id="low-stock-only"
            checked={lowStockOnly}
            onChange={(event) => {
              setLowStockOnly(event.target.checked)
              setPage(1)
            }}
            label="Stock faible uniquement"
          />

          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Réinitialiser
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        {products.isLoading ? (
          <TableSkeleton rows={6} columns={8} />
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
              description="Ajoutez votre premier produit pour commencer."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setFormProduct(null)
                    setFormOpen(true)
                  }}
                >
                  <Plus className="size-4" />
                  Ajouter un produit
                </Button>
              }
            />
          )
        ) : (
          <>
            <DataTable
              columns={columns}
              data={rows}
              getRowId={(product) => product.id}
              sorting={sorting}
              onSortingChange={handleSortingChange}
            />

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
        onEdit={(product) => {
          setFormProduct(product)
          setFormOpen(true)
        }}
      />

      <ConfirmDialog
        open={Boolean(archiving)}
        title={archiving?.is_active ? 'Archiver le produit' : 'Réactiver le produit'}
        message={
          archiving?.is_active
            ? `Le produit « ${archiving?.name} » sera masqué des formulaires de stock. Son historique de mouvements est conservé.`
            : `Le produit « ${archiving?.name} » redeviendra disponible dans les formulaires de stock.`
        }
        confirmLabel={archiving?.is_active ? 'Archiver' : 'Réactiver'}
        destructive={Boolean(archiving?.is_active)}
        loading={setActive.isPending}
        onConfirm={() => void handleArchive()}
        onCancel={() => setArchiving(null)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Supprimer le produit"
        message={
          <>
            Supprimer définitivement <strong>{deleting?.name}</strong> ? Cette action est
            irréversible. Un produit ayant déjà des mouvements ne peut pas être supprimé : il doit
            être archivé.
          </>
        }
        confirmLabel="Supprimer"
        destructive
        loading={remove.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
