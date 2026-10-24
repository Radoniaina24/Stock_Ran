import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CalendarPlus,
  History,
  Pencil,
  Ruler,
  Scale,
  Tag,
} from 'lucide-react'
import type { Product, StockMovement } from '../../types/database'
import { EMPTY_MOVEMENT_FILTERS } from '../../types/database'
import { cn, formatDate, formatQuantity } from '../../lib/utils'
import { getProductStatus, STOCK_STATUS_LABELS } from '../../lib/stock'
import { useMovements } from '../../hooks/useMovements'
import { Modal } from '../ui/dialog'
import { Button } from '../ui/button'
import { Skeleton, SkeletonGroup } from '../ui/skeleton'
import { ActiveBadge, StockBadge } from './StatusBadge'
import { ProductAvatar, StockLevelBar } from './ProductVisuals'

const RECENT_LIMIT = 5

const MOVEMENT_ICONS = {
  entry: { icon: ArrowDownLeft, className: 'bg-success-soft text-success' },
  exit: { icon: ArrowUpRight, className: 'bg-danger-soft text-danger' },
  adjustment: { icon: Scale, className: 'bg-primary-soft text-primary' },
} as const

function InfoItem({ icon: Icon, label, value }: { icon: typeof Tag; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{value}</dd>
      </div>
    </div>
  )
}

function MovementRow({ movement, unit }: { movement: StockMovement; unit: string }) {
  const delta = Number(movement.quantity_after) - Number(movement.quantity_before)
  const config = MOVEMENT_ICONS[movement.type]
  const Icon = config.icon

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', config.className)}>
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium capitalize text-foreground">{movement.reason}</p>
        <p className="text-xs text-muted-foreground">{formatDate(movement.created_at)}</p>
      </div>
      <div className="shrink-0 text-end">
        <p
          className={cn(
            'text-sm font-semibold tabular-nums',
            delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-foreground',
          )}
        >
          {delta > 0 ? '+' : delta < 0 ? '−' : ''}
          {formatQuantity(Math.abs(delta))}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          → {formatQuantity(movement.quantity_after)} {unit}
        </p>
      </div>
    </li>
  )
}

function ProductMovements({ product }: { product: Product }) {
  const movements = useMovements({ ...EMPTY_MOVEMENT_FILTERS, productId: product.id }, 1, RECENT_LIMIT)
  const rows = movements.data?.data ?? []
  const total = movements.data?.total ?? 0

  return (
    <section aria-labelledby="product-movements-title">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 id="product-movements-title" className="text-sm font-semibold text-foreground">
          Derniers mouvements
        </h3>
        {total > RECENT_LIMIT ? (
          <span className="text-xs text-muted-foreground">
            {RECENT_LIMIT} sur {total}
          </span>
        ) : null}
      </div>

      {movements.isLoading || movements.isPlaceholderData ? (
        <SkeletonGroup label="Chargement des mouvements…" className="divide-y divide-border">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <Skeleton className="size-8 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-3.5 w-10" />
            </div>
          ))}
        </SkeletonGroup>
      ) : movements.isError ? (
        <p className="py-3 text-sm text-danger">Impossible de charger les mouvements.</p>
      ) : rows.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <History className="size-4 shrink-0" aria-hidden="true" />
          Aucun mouvement pour ce produit.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((movement) => (
            <MovementRow key={movement.id} movement={movement} unit={product.unit} />
          ))}
        </ul>
      )}
    </section>
  )
}

export interface ProductDetailsDialogProps {
  product: Product | null
  onClose: () => void
  onEdit: (product: Product) => void
  onMovement?: (product: Product) => void
}

export function ProductDetailsDialog({ product, onClose, onEdit, onMovement }: ProductDetailsDialogProps) {
  const status = product ? getProductStatus(product) : 'ok'

  return (
    <Modal
      open={Boolean(product)}
      onClose={onClose}
      size="lg"
      title={product?.name ?? 'Détails du produit'}
      icon={product ? <ProductAvatar status={status} archived={!product.is_active} className="size-10 rounded-xl" /> : null}
      description={
        product ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{product.reference}</span>
            <ActiveBadge isActive={product.is_active} />
          </span>
        ) : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          {product?.is_active && onMovement ? (
            <Button
              variant="outline"
              onClick={() => {
                onClose()
                onMovement(product)
              }}
            >
              <ArrowLeftRight className="size-4" />
              Mouvement
            </Button>
          ) : null}
          {product?.is_active ? (
            <Button
              onClick={() => {
                onClose()
                onEdit(product)
              }}
            >
              <Pencil className="size-4" />
              Modifier
            </Button>
          ) : null}
        </>
      }
    >
      {product ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-gradient-to-br from-muted/70 to-card p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Quantité disponible</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground tabular-nums">
                  {formatQuantity(product.quantity)}
                  <span className="ms-1.5 text-base font-normal text-muted-foreground">{product.unit}</span>
                </p>
              </div>
              <StockBadge status={status} />
            </div>
            <StockLevelBar
              className="mt-4 h-2"
              quantity={product.quantity}
              threshold={product.low_stock_threshold}
              status={status}
              muted={!product.is_active}
            />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>{STOCK_STATUS_LABELS[status]}</span>
              <span>
                Seuil d’alerte :{' '}
                <span className="font-medium text-foreground tabular-nums">
                  {formatQuantity(product.low_stock_threshold)} {product.unit}
                </span>
              </span>
            </div>
          </div>

          <dl className="grid gap-2 sm:grid-cols-2">
            <InfoItem icon={Tag} label="Catégorie" value={product.category || '—'} />
            <InfoItem icon={Ruler} label="Unité de mesure" value={product.unit} />
            <InfoItem icon={CalendarPlus} label="Créé le" value={formatDate(product.created_at)} />
            <InfoItem icon={CalendarClock} label="Dernière modification" value={formatDate(product.updated_at)} />
          </dl>

          {product.description ? (
            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-foreground">Description</h3>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {product.description}
              </p>
            </div>
          ) : null}

          <ProductMovements product={product} />

          <Link
            to={`/historique?produit=${product.id}`}
            onClick={onClose}
            className="group inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Voir tout l’historique du produit
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </Modal>
  )
}
