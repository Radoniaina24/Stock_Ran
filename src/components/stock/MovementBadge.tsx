import { ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react'
import { Badge } from '../ui/badge'
import type { MovementType } from '../../types/database'

const CONFIG: Record<
  MovementType,
  { label: string; className: string; icon: typeof Scale }
> = {
  entry: {
    label: 'Entrée',
    className: 'bg-success-soft text-success border-transparent',
    icon: ArrowDownLeft,
  },
  exit: {
    label: 'Sortie',
    className: 'bg-danger-soft text-danger border-transparent',
    icon: ArrowUpRight,
  },
  adjustment: {
    label: 'Ajustement',
    className: 'bg-primary-soft text-primary border-transparent',
    icon: Scale,
  },
}

export function MovementBadge({ type, withIcon = true }: { type: MovementType; withIcon?: boolean }) {
  const config = CONFIG[type]
  const Icon = config.icon

  return (
    <Badge variant="outline" className={config.className}>
      {withIcon ? <Icon className="size-3" /> : null}
      {config.label}
    </Badge>
  )
}
