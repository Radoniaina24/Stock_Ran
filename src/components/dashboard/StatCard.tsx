import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { Card } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { cn } from '../../lib/utils'

export type StatTone = 'primary' | 'success' | 'danger' | 'warning' | 'violet'

const TONES: Record<StatTone, { icon: string; glow: string }> = {
  primary: { icon: 'bg-primary-soft text-primary ring-primary/15', glow: 'from-primary/10' },
  success: { icon: 'bg-success-soft text-success ring-success/15', glow: 'from-success/10' },
  danger: { icon: 'bg-danger-soft text-danger ring-danger/15', glow: 'from-danger/10' },
  warning: { icon: 'bg-warning-soft text-warning ring-warning/20', glow: 'from-warning/10' },
  violet: { icon: 'bg-violet-50 text-violet-600 ring-violet-600/15', glow: 'from-violet-500/10' },
}

export interface StatCardProps {
  label: string
  value: string
  icon: LucideIcon
  tone?: StatTone
  footer?: ReactNode
  to?: string
}

export function StatCard({ label, value, icon: Icon, tone = 'primary', footer, to }: StatCardProps) {
  const styles = TONES[tone]

  const content = (
    <Card
      className={cn(
        'relative h-full overflow-hidden rounded-xl p-4 sm:p-5',
        to &&
          'transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/25 group-hover:shadow-md',
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -end-10 -top-10 size-32 rounded-full bg-gradient-to-br to-transparent blur-2xl',
          styles.glow,
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset sm:size-10',
            styles.icon,
          )}
        >
          <Icon className="size-4 sm:size-5" aria-hidden="true" />
        </span>
      </div>
      <p className="relative mt-1 truncate text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-3xl">
        {value}
      </p>
      {footer ? (
        <div className="relative mt-3 flex min-h-5 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {footer}
        </div>
      ) : null}
      {to ? (
        <ArrowUpRight
          aria-hidden="true"
          className="absolute bottom-4 end-4 size-4 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 sm:bottom-5 sm:end-5"
        />
      ) : null}
    </Card>
  )

  if (!to) return content

  return (
    <Link
      to={to}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
    >
      {content}
    </Link>
  )
}

export function StatCardSkeleton() {
  return (
    <Card className="rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="mt-1 h-3.5 w-24" />
        <Skeleton className="size-9 rounded-lg sm:size-10" />
      </div>
      <Skeleton className="mt-1 h-8 w-20 sm:h-9" />
      <Skeleton className="mt-3 h-3.5 w-32" />
    </Card>
  )
}
