import { ArrowDownLeft, ArrowUpRight, Scale, type LucideIcon } from 'lucide-react'
import type { MovementType, StockMovement } from '../../types/database'
import { formatQuantity } from '../../lib/utils'

export const MOVEMENT_STYLES: Record<
  MovementType,
  { label: string; title: string; icon: LucideIcon; soft: string; tone: 'success' | 'danger' | 'primary' }
> = {
  entry: { label: 'Entrées', title: 'Entrée de stock', icon: ArrowDownLeft, soft: 'bg-success-soft text-success', tone: 'success' },
  exit: { label: 'Sorties', title: 'Sortie de stock', icon: ArrowUpRight, soft: 'bg-danger-soft text-danger', tone: 'danger' },
  adjustment: { label: 'Ajustements', title: 'Ajustement de stock', icon: Scale, soft: 'bg-primary-soft text-primary', tone: 'primary' },
}

export function movementDelta(movement: Pick<StockMovement, 'quantity_before' | 'quantity_after'>): number {
  return Number(movement.quantity_after) - Number(movement.quantity_before)
}

export function formatDelta(delta: number): string {
  return `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${formatQuantity(Math.abs(delta))}`
}

export function deltaClassName(delta: number): string {
  return delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-foreground'
}
