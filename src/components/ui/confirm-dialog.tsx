import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './dialog'
import { Button } from './button'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onCancel}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Veuillez patienter…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div
          className={
            destructive
              ? 'flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger'
              : 'flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning'
          }
        >
          <AlertTriangle className="size-5" />
        </div>
        <div className="text-sm text-muted-foreground">{message}</div>
      </div>
    </Modal>
  )
}
