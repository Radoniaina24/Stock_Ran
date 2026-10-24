import { Package } from 'lucide-react'
import { getStockLevel } from '../../lib/stock'
import { cn } from '../../lib/utils'
import type { StockStatus } from '../../types/database'

const BAR_COLORS: Record<StockStatus, string> = {
  out: 'bg-danger',
  low: 'bg-warning',
  ok: 'bg-success',
}

export function StockLevelBar({
  quantity,
  threshold,
  status,
  muted = false,
  className,
}: {
  quantity: number
  threshold: number
  status: StockStatus
  muted?: boolean
  className?: string
}) {
  const level = getStockLevel(quantity, threshold)

  return (
    <div
      className={cn('relative h-1.5 overflow-hidden rounded-full bg-muted', className)}
      aria-hidden="true"
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500',
          muted ? 'bg-muted-foreground/40' : BAR_COLORS[status],
        )}
        style={{ width: `${Math.max(level, quantity > 0 ? 4 : 0)}%` }}
      />
      {threshold > 0 ? <span className="absolute inset-y-0 start-1/2 w-px bg-card" /> : null}
    </div>
  )
}

export function ProductAvatar({
  archived = false,
  status,
  className,
}: {
  archived?: boolean
  status: StockStatus
  className?: string
}) {
  const tone = archived
    ? 'bg-muted text-muted-foreground'
    : status === 'out'
      ? 'bg-danger-soft text-danger'
      : status === 'low'
        ? 'bg-warning-soft text-warning'
        : 'bg-primary-soft text-primary'

  return (
    <span
      className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tone, className)}
      aria-hidden="true"
    >
      <Package className="size-4" />
    </span>
  )
}
