import { Badge } from '../ui/badge'
import { STOCK_STATUS_LABELS } from '../../lib/stock'
import type { StockStatus } from '../../types/database'
import { cn } from '../../lib/utils'

export function StockBadge({ status }: { status: StockStatus }) {
  const variant = status === 'out' ? 'danger' : status === 'low' ? 'warning' : 'success'
  return (
    <Badge variant={variant} className={cn(status === 'ok' && 'font-normal')}>
      {STOCK_STATUS_LABELS[status]}
    </Badge>
  )
}

export function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge variant="success">Actif</Badge>
  ) : (
    <Badge variant="neutral">Archivé</Badge>
  )
}
