import { toDateInputValue } from './utils'

export type DatePreset = 'today' | '7d' | '30d' | 'month'

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Aujourd’hui' },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: 'month', label: 'Ce mois-ci' },
]

/** Bornes (AAAA-MM-JJ, jours locaux inclus) d'une période prédéfinie. */
export function presetRange(preset: DatePreset, now = new Date()): { from: string; to: string } {
  const start = new Date(now)
  if (preset === '7d') start.setDate(start.getDate() - 6)
  else if (preset === '30d') start.setDate(start.getDate() - 29)
  else if (preset === 'month') start.setDate(1)
  return { from: toDateInputValue(start), to: toDateInputValue(now) }
}

export function matchPreset(from: string, to: string, now = new Date()): DatePreset | null {
  return (
    DATE_PRESETS.find(({ value }) => {
      const range = presetRange(value, now)
      return range.from === from && range.to === to
    })?.value ?? null
  )
}

/** Regroupe des éléments déjà triés par date en conservant leur ordre. */
export function groupByDay<T extends { created_at: string }>(rows: T[]): { date: string; items: T[] }[] {
  const groups: { date: string; items: T[] }[] = []
  for (const row of rows) {
    const date = toDateInputValue(row.created_at)
    const last = groups[groups.length - 1]
    if (last && last.date === date) last.items.push(row)
    else groups.push({ date, items: [row] })
  }
  return groups
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const dayWithYearFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function formatDayLabel(date: string, now = new Date()): string {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(year!, month! - 1, day!)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date === toDateInputValue(now)) return 'Aujourd’hui'
  if (date === toDateInputValue(yesterday)) return 'Hier'
  const label = (value.getFullYear() === now.getFullYear() ? dayFormat : dayWithYearFormat).format(value)
  return label.charAt(0).toUpperCase() + label.slice(1)
}
