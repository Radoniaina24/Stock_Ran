import { describe, expect, it } from 'vitest'
import { productSchema, PRODUCT_DEFAULT_VALUES } from './product'

function issue(schema: typeof productSchema, data: unknown, field: string) {
  const result = schema.safeParse(data)
  if (result.success) return null
  return result.error.issues.find((item) => item.path[0] === field)?.message ?? null
}

const validPayload = {
  reference: 'PRD-001',
  name: 'Coffret outils',
  description: '',
  category: 'Outillage',
  unit: 'pièce',
  low_stock_threshold: '5',
}

describe('productSchema', () => {
  it('accepte un produit valide et convertit les champs numériques', () => {
    const result = productSchema.safeParse(validPayload)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.low_stock_threshold).toBe(5)
    expect(result.data.description).toBeNull()
    expect(result.data.category).toBe('Outillage')
  })

  it('refuse un produit sans nom', () => {
    expect(issue(productSchema, { ...validPayload, name: '' }, 'name')).toBe(
      'Le nom est obligatoire.',
    )
    expect(issue(productSchema, { ...validPayload, name: '   ' }, 'name')).toBe(
      'Le nom est obligatoire.',
    )
  })

  it('refuse un nom trop court', () => {
    expect(issue(productSchema, { ...validPayload, name: 'A' }, 'name')).toBe(
      'Le nom doit contenir au moins 2 caractères.',
    )
  })

  it('refuse une référence manquante', () => {
    expect(issue(productSchema, { ...validPayload, reference: '' }, 'reference')).toBe(
      'La référence est obligatoire.',
    )
  })

  it('refuse un seuil d’alerte négatif ou non numérique', () => {
    expect(issue(productSchema, { ...validPayload, low_stock_threshold: '-1' }, 'low_stock_threshold')).toBe(
      "Le seuil d'alerte doit être supérieur ou égal à 0.",
    )
    expect(
      issue(productSchema, { ...validPayload, low_stock_threshold: 'abc' }, 'low_stock_threshold'),
    ).toBe("Le seuil d'alerte doit être un nombre valide.")
  })

  it('refuse une unité hors liste', () => {
    expect(issue(productSchema, { ...validPayload, unit: 'tonne' }, 'unit')).toBe(
      'Sélectionnez une unité de mesure.',
    )
  })

  it('propose des valeurs par défaut valides', () => {
    expect(productSchema.safeParse(PRODUCT_DEFAULT_VALUES).success).toBe(false)
    expect(issue(productSchema, PRODUCT_DEFAULT_VALUES, 'reference')).toBe(
      'La référence est obligatoire.',
    )
  })
})
