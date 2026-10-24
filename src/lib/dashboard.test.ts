import { describe, expect, it } from 'vitest'
import { activityStartIso, buildDailyActivity, pickStockAlerts } from './dashboard'

const product = (
  name: string,
  quantity: number,
  low_stock_threshold: number,
  stock_status: string,
) => ({
  id: name,
  reference: name.toUpperCase(),
  name,
  unit: 'pièce',
  quantity,
  low_stock_threshold,
  stock_status,
})

describe('pickStockAlerts', () => {
  it('ne garde que les produits en rupture ou en stock faible', () => {
    const alerts = pickStockAlerts([product('a', 10, 5, 'ok'), product('b', 2, 5, 'low')])
    expect(alerts.map((a) => a.name)).toEqual(['b'])
  })

  it('classe les ruptures en premier puis par proximité du zéro', () => {
    const alerts = pickStockAlerts([
      product('faible-moitie', 5, 10, 'low'),
      product('faible-critique', 1, 10, 'low'),
      product('rupture', 0, 3, 'out'),
    ])
    expect(alerts.map((a) => a.name)).toEqual(['rupture', 'faible-critique', 'faible-moitie'])
  })

  it('respecte la limite demandée', () => {
    const rows = Array.from({ length: 8 }, (_, i) => product(`p${i}`, 0, 5, 'out'))
    expect(pickStockAlerts(rows, 3)).toHaveLength(3)
  })
})

describe('buildDailyActivity', () => {
  const now = new Date(2026, 9, 24, 15, 0, 0)

  it('produit un point par jour, du plus ancien à aujourd’hui', () => {
    const activity = buildDailyActivity([], 7, now)
    expect(activity).toHaveLength(7)
    expect(activity[0]!.date).toBe('2026-10-18')
    expect(activity[6]!.date).toBe('2026-10-24')
    expect(activity.every((d) => d.entries === 0 && d.exits === 0)).toBe(true)
  })

  it('compte les entrées et les sorties par jour local', () => {
    const activity = buildDailyActivity(
      [
        { type: 'entry', created_at: new Date(2026, 9, 24, 9).toISOString() },
        { type: 'entry', created_at: new Date(2026, 9, 24, 11).toISOString() },
        { type: 'exit', created_at: new Date(2026, 9, 23, 18).toISOString() },
        { type: 'adjustment', created_at: new Date(2026, 9, 23, 18).toISOString() },
        { type: 'entry', created_at: new Date(2026, 9, 10).toISOString() },
      ],
      7,
      now,
    )
    expect(activity[6]).toEqual({ date: '2026-10-24', entries: 2, exits: 0 })
    expect(activity[5]).toEqual({ date: '2026-10-23', entries: 0, exits: 1 })
  })
})

describe('activityStartIso', () => {
  it('renvoie minuit local du premier jour de la fenêtre', () => {
    const start = new Date(activityStartIso(7, new Date(2026, 9, 24, 15)))
    expect(start).toEqual(new Date(2026, 9, 18, 0, 0, 0, 0))
  })
})
