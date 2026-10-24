import type { ReactNode } from 'react'
import { ArrowRight, CalendarClock, Filter, Hash, MessageSquareText, Tag, UserRound } from 'lucide-react'
import { Button } from '../ui/button'
import { Modal, ModalIcon } from '../ui/dialog'
import type { StockMovement } from '../../types/database'
import { cn, formatQuantity } from '../../lib/utils'
import { MovementBadge } from './MovementBadge'
import { deltaClassName, formatDelta, movementDelta, MOVEMENT_STYLES } from './movement-style'

const fullDateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' })

function Detail({ icon: Icon, label, children }: { icon: typeof Tag; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1 sm:flex sm:items-start sm:justify-between sm:gap-4">
        <dt className="text-xs text-muted-foreground sm:text-sm">{label}</dt>
        <dd className="mt-0.5 min-w-0 break-words text-sm font-medium text-foreground sm:mt-0 sm:text-end">
          {children}
        </dd>
      </div>
    </div>
  )
}

export interface MovementDetailsDialogProps {
  movement: StockMovement | null
  userLabel: (movement: StockMovement) => string
  onClose: () => void
  onFilterProduct?: (movement: StockMovement) => void
}

export function MovementDetailsDialog({ movement, userLabel, onClose, onFilterProduct }: MovementDetailsDialogProps) {
  const style = movement ? MOVEMENT_STYLES[movement.type] : MOVEMENT_STYLES.entry
  const delta = movement ? movementDelta(movement) : 0

  return (
    <Modal
      open={Boolean(movement)}
      onClose={onClose}
      title={style.title}
      description={movement ? fullDateFormat.format(new Date(movement.created_at)) : undefined}
      icon={
        <ModalIcon tone={style.tone}>
          <style.icon className="size-5" />
        </ModalIcon>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          {movement && onFilterProduct ? (
            <Button
              onClick={() => {
                onFilterProduct(movement)
                onClose()
              }}
            >
              <Filter className="size-4" />
              Historique du produit
            </Button>
          ) : null}
        </>
      }
    >
      {movement ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{movement.product_name}</p>
                <p className="font-mono text-xs text-muted-foreground">{movement.product_reference}</p>
              </div>
              <MovementBadge type={movement.type} />
            </div>

            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
              <div className="rounded-lg bg-muted/70 p-3">
                <p className="text-xs text-muted-foreground">Stock avant</p>
                <p className="mt-0.5 text-xl font-semibold text-foreground tabular-nums">
                  {formatQuantity(movement.quantity_before)}
                </p>
              </div>
              <div className="flex flex-col items-center gap-1 px-1">
                <span className={cn('text-sm font-semibold tabular-nums', deltaClassName(delta))}>
                  {formatDelta(delta)}
                </span>
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </div>
              <div className={cn('rounded-lg p-3', style.soft)}>
                <p className="text-xs opacity-80">Stock après</p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums">{formatQuantity(movement.quantity_after)}</p>
              </div>
            </div>
          </div>

          <dl className="divide-y divide-border">
            <Detail icon={Tag} label="Motif">
              <span className="capitalize">{movement.reason}</span>
            </Detail>
            <Detail icon={CalendarClock} label="Date et heure">
              {fullDateFormat.format(new Date(movement.created_at))}
            </Detail>
            <Detail icon={UserRound} label="Enregistré par">
              {userLabel(movement)}
            </Detail>
            <Detail icon={Hash} label="Identifiant">
              <span className="font-mono text-xs text-muted-foreground">{movement.id}</span>
            </Detail>
          </dl>

          {movement.comment ? (
            <div className="rounded-xl bg-muted/60 p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <MessageSquareText className="size-3.5" aria-hidden="true" />
                Commentaire
              </p>
              <p className="mt-1.5 whitespace-pre-line text-sm text-foreground">{movement.comment}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  )
}
