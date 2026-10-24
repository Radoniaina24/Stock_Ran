import type { ReactNode } from 'react'
import type { Product } from '../../types/database'
import { formatDate, formatQuantity } from '../../lib/utils'
import { getStockStatus } from '../../lib/stock'
import { Modal } from '../ui/dialog'
import { Button } from '../ui/button'
import { ActiveBadge, StockBadge } from './StatusBadge'

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  )
}

export interface ProductDetailsDialogProps {
  product: Product | null
  onClose: () => void
  onEdit: (product: Product) => void
}

export function ProductDetailsDialog({ product, onClose, onEdit }: ProductDetailsDialogProps) {
  return (
    <Modal
      open={Boolean(product)}
      onClose={onClose}
      title={product?.name ?? 'Détails du produit'}
      description={product ? `Référence ${product.reference}` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button
            onClick={() => {
              if (!product) return
              onClose()
              onEdit(product)
            }}
          >
            Modifier
          </Button>
        </>
      }
    >
      {product ? (
        <dl>
          <Row label="Statut du stock" value={<StockBadge status={getStockStatus(product.quantity, product.low_stock_threshold)} />} />
          <Row label="État" value={<ActiveBadge isActive={product.is_active} />} />
          <Row label="Quantité disponible" value={`${formatQuantity(product.quantity)} ${product.unit}`} />
          <Row label="Seuil d'alerte" value={`${formatQuantity(product.low_stock_threshold)} ${product.unit}`} />
          <Row label="Catégorie" value={product.category || '—'} />
          <Row label="Unité" value={product.unit} />
          <Row label="Description" value={product.description || '—'} />
          <Row label="Créé le" value={formatDate(product.created_at)} />
          <Row label="Dernière modification" value={formatDate(product.updated_at)} />
        </dl>
      ) : null}
    </Modal>
  )
}
