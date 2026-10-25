import { describe, expect, it } from 'vitest'
import { formatDate, formatDay, formatQuantity, getInitials, toDateInputValue } from './utils'

describe('getInitials', () => {
  it('déduit les initiales de la partie locale de l’e-mail', () => {
    expect(getInitials('jean.dupont@exemple.fr')).toBe('JD')
    expect(getInitials('gestion@exemple.fr')).toBe('GE')
    expect(getInitials('@exemple.fr')).toBe('?')
  })
})

describe('formatQuantity', () => {
  it('affiche les entiers sans décimale', () => {
    expect(formatQuantity(10)).toBe('10')
    expect(formatQuantity(0)).toBe('0')
  })

  it('affiche les décimales utiles uniquement', () => {
    expect(formatQuantity(10.5)).toBe('10.5')
    expect(formatQuantity(10.5)).toBe('10.5')
    expect(formatQuantity('2.25')).toBe('2.25')
  })

  it('retombe sur 0 pour les valeurs invalides', () => {
    expect(formatQuantity(null)).toBe('0')
    expect(formatQuantity(undefined)).toBe('0')
    expect(formatQuantity('abc')).toBe('0')
  })
})

describe('formatDate', () => {
  it('affiche un tiret quand la date est absente ou invalide', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('invalide')).toBe('—')
  })

  it('formate une date ISO valide', () => {
    expect(formatDate('2026-01-15T10:30:00.000Z')).not.toBe('—')
  })
})

describe('formatDay', () => {
  it('affiche la date calendaire sans heure ni décalage de fuseau', () => {
    expect(formatDay('2026-10-20')).toMatch(/^20 oct\.? 2026$/)
    expect(formatDay('2026-01-01')).toMatch(/^01 janv\.? 2026$/)
  })

  it('affiche un tiret quand la date est absente ou invalide', () => {
    expect(formatDay(null)).toBe('—')
    expect(formatDay('hier')).toBe('—')
  })
})

describe('toDateInputValue', () => {
  it('produit une date au format AAAA-MM-JS', () => {
    expect(toDateInputValue('2026-01-15T10:30:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
