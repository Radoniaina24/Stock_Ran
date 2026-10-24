import { BarChart3 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import type { DailyActivity } from '../../lib/dashboard'
import { cn } from '../../lib/utils'

const TICKS = 4
const weekdayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })
const fullDateFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year!, month! - 1, day!)
}

function plural(count: number, word: string) {
  return `${count} ${word}${count > 1 ? 's' : ''}`
}

function Legend({ className, label, total }: { className: string; label: string; total: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('size-2.5 rounded-full', className)} aria-hidden="true" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground tabular-nums">{total}</span>
    </div>
  )
}

export function ActivityChart({ data, days }: { data: DailyActivity[]; days: number }) {
  const totalEntries = data.reduce((sum, d) => sum + d.entries, 0)
  const totalExits = data.reduce((sum, d) => sum + d.exits, 0)
  const peak = Math.max(0, ...data.map((d) => Math.max(d.entries, d.exits)))
  const step = Math.max(1, Math.ceil(peak / TICKS))
  const scaleMax = step * TICKS
  const isEmpty = totalEntries + totalExits === 0
  const height = (value: number) => (value === 0 ? '0%' : `max(${(value / scaleMax) * 100}%, 4px)`)

  return (
    <Card className="flex h-full flex-col rounded-xl">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Activité des {days} derniers jours</CardTitle>
          <CardDescription>Nombre d’entrées et de sorties enregistrées par jour.</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Legend className="bg-success" label="Entrées" total={totalEntries} />
          <Legend className="bg-danger" label="Sorties" total={totalExits} />
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        <div className="flex h-52 gap-2 sm:h-60 sm:gap-3">
          <div
            className="flex flex-col-reverse justify-between pb-10 text-end text-[10px] text-muted-foreground tabular-nums"
            aria-hidden="true"
          >
            {Array.from({ length: TICKS + 1 }, (_, i) => (
              <span key={i} className="-my-1.5 leading-3">
                {i * step}
              </span>
            ))}
          </div>

          <div className="relative min-w-0 flex-1">
            <div className="absolute inset-x-0 top-0 bottom-10 flex flex-col justify-between" aria-hidden="true">
              {Array.from({ length: TICKS + 1 }, (_, i) => (
                <div
                  key={i}
                  className={cn('border-t', i === TICKS ? 'border-border' : 'border-dashed border-border/70')}
                />
              ))}
            </div>

            {isEmpty ? (
              <div className="absolute inset-x-0 top-0 bottom-10 flex flex-col items-center justify-center gap-2 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <BarChart3 className="size-5" aria-hidden="true" />
                </span>
                <p className="text-sm text-muted-foreground">Aucun mouvement sur la période.</p>
              </div>
            ) : null}

            <ul className="relative grid h-full" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
              {data.map((day, index) => {
                const date = parseLocalDate(day.date)
                const isToday = index === data.length - 1
                const edge = index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'center'
                const summary = `${fullDateFormat.format(date)} : ${plural(day.entries, 'entrée')}, ${plural(day.exits, 'sortie')}`

                return (
                  <li
                    key={day.date}
                    tabIndex={isEmpty ? -1 : 0}
                    aria-label={summary}
                    className="group relative flex h-full flex-col outline-none"
                  >
                    <div className="flex flex-1 items-end justify-center gap-1 rounded-md px-0.5 transition-colors group-hover:bg-muted/60 group-focus-visible:bg-muted/60 sm:gap-1.5">
                      <span
                        className="w-full max-w-4 rounded-t bg-success transition-all duration-500 group-hover:brightness-110"
                        style={{ height: height(day.entries) }}
                      />
                      <span
                        className="w-full max-w-4 rounded-t bg-danger/85 transition-all duration-500 group-hover:brightness-110"
                        style={{ height: height(day.exits) }}
                      />
                    </div>

                    <div className="flex h-10 flex-col items-center justify-center leading-tight" aria-hidden="true">
                      <span
                        className={cn(
                          'text-[11px] capitalize',
                          isToday ? 'font-semibold text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {isToday ? 'Auj.' : weekdayFormat.format(date).replace('.', '')}
                      </span>
                      <span className={cn('text-[11px] tabular-nums', isToday ? 'font-semibold text-primary' : 'text-foreground')}>
                        {date.getDate()}
                      </span>
                    </div>

                    {!isEmpty ? (
                      <div
                        className={cn(
                          'pointer-events-none absolute top-0 z-10 w-max rounded-lg border border-border bg-card px-3 py-2 text-xs opacity-0 shadow-lg transition-opacity duration-150',
                          'group-hover:opacity-100 group-focus-visible:opacity-100',
                          edge === 'start' && 'start-0',
                          edge === 'end' && 'end-0',
                          edge === 'center' && 'start-1/2 -translate-x-1/2',
                        )}
                        aria-hidden="true"
                      >
                        <p className="mb-1 font-medium capitalize text-foreground">{fullDateFormat.format(date)}</p>
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="size-2 rounded-full bg-success" />
                          {plural(day.entries, 'entrée')}
                        </p>
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="size-2 rounded-full bg-danger" />
                          {plural(day.exits, 'sortie')}
                        </p>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function ActivityChartSkeleton() {
  const bars = [45, 70, 30, 85, 55, 65, 40]

  return (
    <Card className="flex h-full flex-col rounded-xl">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="flex h-52 items-end gap-2 pb-10 sm:h-60 sm:gap-3">
          {bars.map((value, index) => (
            <div key={index} className="flex h-full flex-1 items-end justify-center gap-1 sm:gap-1.5">
              <Skeleton className="w-full max-w-4 rounded-b-none" style={{ height: `${value}%` }} />
              <Skeleton
                className="w-full max-w-4 rounded-b-none"
                style={{ height: `${Math.max(15, value - 25)}%` }}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
