import { ArrowLeftRight } from 'lucide-react'
import { Modal, ModalIcon } from '../ui/dialog'
import type { MovementType, Product } from '../../types/database'
import { MovementForm } from './MovementForm'

export interface MovementDialogProps {
  /** Produit présélectionné ; la modale est ouverte tant qu'il est défini. */
  product: Product | null
  initialKind?: MovementType
  onClose: () => void
}

export function MovementDialog({ product, initialKind, onClose }: MovementDialogProps) {
  return (
    <Modal
      open={Boolean(product)}
      onClose={onClose}
      size="lg"
      title="Nouveau mouvement de stock"
      description={
        product ? (
          <>
            {product.name} · <span className="font-mono text-xs">{product.reference}</span>
          </>
        ) : undefined
      }
      icon={
        <ModalIcon>
          <ArrowLeftRight className="size-5" />
        </ModalIcon>
      }
    >
      {product ? (
        <MovementForm
          key={product.id}
          variant="dialog"
          initialProductId={product.id}
          initialKind={initialKind}
          onSuccess={onClose}
          onCancel={onClose}
        />
      ) : null}
    </Modal>
  )
}
