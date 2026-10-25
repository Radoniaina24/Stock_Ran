import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  /** `null` = compteur en cours de chargement, `undefined` = pas de compteur. */
  count?: number | null
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('-mx-4 flex overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0', className)}
    >
      <div className="inline-flex shrink-0 rounded-lg bg-muted p-1">
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.icon}
              {option.label}
              {option.count !== undefined ? (
                <span
                  className={cn(
                    'min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] tabular-nums',
                    active ? 'bg-muted text-foreground' : 'bg-card/70 text-muted-foreground',
                  )}
                >
                  {option.count ?? '·'}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
