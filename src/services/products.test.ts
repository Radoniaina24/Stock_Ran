import { describe, expect, it } from 'vitest'
import { sanitizeSearch } from './products'

describe('sanitizeSearch', () => {
  it('retire les caractères qui cassent les filtres PostgREST', () => {
    expect(sanitizeSearch('PRD(1),2%')).toBe('PRD 1 2')
  })

  it('normalise les espaces et trime la saisie', () => {
    expect(sanitizeSearch('  coffret   outils ')).toBe('coffret outils')
  })

  it('limite la longueur de la recherche', () => {
    expect(sanitizeSearch('a'.repeat(300)).length).toBe(100)
  })

  it('accepte les caractères accentués', () => {
    expect(sanitizeSearch('café')).toBe('café')
  })
})
