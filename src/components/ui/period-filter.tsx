import { DATE_PRESETS, matchPreset, presetRange } from '../../lib/history'
import { cn, formatDateRange } from '../../lib/utils'
import { Input } from './input'

/** Libellé lisible d'une période (préréglage ou bornes libres), vide si aucune. */
export function periodLabel(from: string, to: string): string {
  const preset = matchPreset(from, to)
  if (preset) return DATE_PRESETS.find((item) => item.value === preset)!.label
  if (from && to) return `Du ${formatDateRange(`${from}T00:00:00`)} au ${formatDateRange(`${to}T00:00:00`)}`
  if (from) return `Depuis le ${formatDateRange(`${from}T00:00:00`)}`
  if (to) return `Jusqu’au ${formatDateRange(`${to}T00:00:00`)}`
  return ''
}

export function PeriodFilter({
  from,
  to,
  onChange,
  idPrefix,
}: {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
  idPrefix: string
}) {
  const active = matchPreset(from, to)

  return (
    <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-center @3xl:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <span className="me-1 text-sm font-medium text-foreground">Période</span>
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            aria-pressed={active === preset.value}
            onClick={() => onChange(active === preset.value ? { from: '', to: '' } : presetRange(preset.value))}
            className={cn(
              'cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              active === preset.value
                ? 'border-primary bg-primary-soft font-medium text-primary'
                : 'border-border text-foreground hover:bg-muted',
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 @3xl:flex @3xl:items-center">
        <label htmlFor={`${idPrefix}-from`} className="sr-only">
          Du
        </label>
        <Input
          id={`${idPrefix}-from`}
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => onChange({ from: event.target.value, to })}
          className="min-w-0 @3xl:w-40"
          aria-label="Date de début"
        />
        <label htmlFor={`${idPrefix}-to`} className="sr-only">
          Au
        </label>
        <Input
          id={`${idPrefix}-to`}
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => onChange({ from, to: event.target.value })}
          className="min-w-0 @3xl:w-40"
          aria-label="Date de fin"
        />
      </div>
    </div>
  )
}
