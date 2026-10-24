import type { MovementType, Product, StockStatus } from '../types/database'
import { toDateInputValue } from './utils'

export type StockAlert = Pick<
  Product,
  'id' | 'reference' | 'name' | 'unit' | 'quantity' | 'low_stock_threshold'
> & { stock_status: Exclude<StockStatus, 'ok'> }

export interface DailyActivity {
  /** Jour local au format AAAA-MM-JJ. */
  date: string
  entries: number
  exits: number
}

type AlertCandidate = Omit<StockAlert, 'stock_status'> & { stock_status: StockStatus | string }

/** Produits sous le seuil : ruptures d'abord, puis les plus proches de zéro. */
export function pickStockAlerts(rows: AlertCandidate[], limit = 5): StockAlert[] {
  const ratio = (row: AlertCandidate) => {
    const threshold = Number(row.low_stock_threshold ?? 0)
    return threshold > 0 ? Number(row.quantity ?? 0) / threshold : 0
  }

  return rows
    .filter((row): row is StockAlert => row.stock_status === 'out' || row.stock_status === 'low')
    .sort((a, b) => {
      if (a.stock_status !== b.stock_status) return a.stock_status === 'out' ? -1 : 1
      return ratio(a) - ratio(b) || a.name.localeCompare(b.name, 'fr')
    })
    .slice(0, limit)
}

/** Début (minuit local) de la fenêtre des `days` derniers jours, aujourd'hui inclus. */
export function activityStartIso(days: number, now = new Date()): string {
  const start = new Date(now)
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)
  return start.toISOString()
}

/** Agrège les mouvements par jour local ; les jours sans mouvement valent zéro. */
export function buildDailyActivity(
  rows: { type: MovementType | string; created_at: string }[],
  days: number,
  now = new Date(),
): DailyActivity[] {
  const buckets = new Map<string, DailyActivity>()
  for (let offset = days - 1; offset >= 0; offset--) {
    const day = new Date(now)
    day.setDate(day.getDate() - offset)
    const date = toDateInputValue(day)
    buckets.set(date, { date, entries: 0, exits: 0 })
  }

  for (const row of rows) {
    const bucket = buckets.get(toDateInputValue(row.created_at))
    if (!bucket) continue
    if (row.type === 'entry') bucket.entries++
    else if (row.type === 'exit') bucket.exits++
  }

  return [...buckets.values()]
}
