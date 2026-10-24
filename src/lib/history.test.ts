import { describe, expect, it } from 'vitest'
import { formatDayLabel, groupByDay, matchPreset, presetRange } from './history'

const now = new Date(2026, 9, 24, 15, 30)

describe('presetRange', () => {
  it('calcule les périodes prédéfinies, jour courant inclus', () => {
    expect(presetRange('today', now)).toEqual({ from: '2026-10-24', to: '2026-10-24' })
    expect(presetRange('7d', now)).toEqual({ from: '2026-10-18', to: '2026-10-24' })
    expect(presetRange('30d', now)).toEqual({ from: '2026-09-25', to: '2026-10-24' })
    expect(presetRange('month', now)).toEqual({ from: '2026-10-01', to: '2026-10-24' })
  })

  it('reconnaît une période prédéfinie à partir de ses bornes', () => {
    expect(matchPreset('2026-10-18', '2026-10-24', now)).toBe('7d')
    expect(matchPreset('2026-10-10', '2026-10-24', now)).toBeNull()
    expect(matchPreset('', '', now)).toBeNull()
  })
})

describe('groupByDay', () => {
  it('regroupe les mouvements consécutifs d’un même jour local', () => {
    const rows = [
      { id: 'a', created_at: new Date(2026, 9, 24, 14).toISOString() },
      { id: 'b', created_at: new Date(2026, 9, 24, 9).toISOString() },
      { id: 'c', created_at: new Date(2026, 9, 22, 18).toISOString() },
    ]
    const groups = groupByDay(rows)
    expect(groups.map((g) => [g.date, g.items.map((i) => i.id)])).toEqual([
      ['2026-10-24', ['a', 'b']],
      ['2026-10-22', ['c']],
    ])
  })
})

describe('formatDayLabel', () => {
  it('emploie « Aujourd’hui » et « Hier » pour les jours proches', () => {
    expect(formatDayLabel('2026-10-24', now)).toBe('Aujourd’hui')
    expect(formatDayLabel('2026-10-23', now)).toBe('Hier')
  })

  it('affiche le jour en toutes lettres, avec l’année si elle diffère', () => {
    expect(formatDayLabel('2026-10-20', now)).toBe('Mardi 20 octobre')
    expect(formatDayLabel('2025-12-31', now)).toBe('Mercredi 31 décembre 2025')
  })
})
