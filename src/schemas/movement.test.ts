import { describe, expect, it } from 'vitest'
import { adjustmentFormSchema, adjustmentSchema, entrySchema, exitSchema } from './movement'

describe('adjustmentFormSchema', () => {
  const adjustment = {
    productId: 'a1b2c3d4-0000-0000-0000-000000000000',
    quantity: '4',
    reason: 'inventaire',
    comment: '',
  }

  it('accepte une valeur absolue avec un motif d’ajustement', () => {
    const result = adjustmentFormSchema.safeParse(adjustment)
    expect(result.success && result.data.quantity).toBe(4)
  })

  it('refuse une valeur négative ou nulle : le sens est choisi à part', () => {
    expect(adjustmentFormSchema.safeParse({ ...adjustment, quantity: '-4' }).success).toBe(false)
    expect(adjustmentFormSchema.safeParse({ ...adjustment, quantity: '0' }).success).toBe(false)
  })

  it('refuse un motif de sortie', () => {
    expect(adjustmentFormSchema.safeParse({ ...adjustment, reason: 'casse' }).success).toBe(false)
  })
})

function issue(
  schema: typeof entrySchema,
  data: unknown,
  field: string,
) {
  const result = schema.safeParse(data)
  if (result.success) return null
  return result.error.issues.find((item) => item.path[0] === field)?.message ?? null
}

const base = {
  productId: 'a1b2c3d4-0000-0000-0000-000000000000',
  quantity: '10',
  reason: 'réception',
  comment: '',
}

describe('entrySchema', () => {
  it('accepte une entrée de 10 unités', () => {
    const result = entrySchema.safeParse(base)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.quantity).toBe(10)
    expect(result.data.comment).toBeNull()
  })

  it('accepte les quantités décimales avec virgule', () => {
    const result = entrySchema.safeParse({ ...base, quantity: '2,5' })
    expect(result.success && result.data.quantity).toBe(2.5)
  })

  it('refuse une quantité nulle', () => {
    expect(issue(entrySchema, { ...base, quantity: '0' }, 'quantity')).toBe(
      'La quantité doit être supérieur à 0.',
    )
  })

  it('refuse une quantité négative', () => {
    expect(issue(entrySchema, { ...base, quantity: '-3' }, 'quantity')).toBe(
      'La quantité doit être supérieur à 0.',
    )
  })

  it('refuse une quantité invalide ou vide', () => {
    expect(issue(entrySchema, { ...base, quantity: 'abc' }, 'quantity')).toBe(
      'La quantité doit être un nombre valide.',
    )
    expect(issue(entrySchema, { ...base, quantity: '' }, 'quantity')).toBe(
      'La quantité est obligatoire.',
    )
  })

  it('refuse un produit absent', () => {
    expect(issue(entrySchema, { ...base, productId: '' }, 'productId')).toBe(
      'Sélectionnez un produit.',
    )
  })

  it('refuse un motif absent ou inconnu', () => {
    expect(issue(entrySchema, { ...base, reason: '' }, 'reason')).toBe(
      'Sélectionnez un motif.',
    )
    expect(issue(entrySchema, { ...base, reason: 'vol' }, 'reason')).toBe(
      'Motif non autorisé.',
    )
  })
})

describe('exitSchema', () => {
  it('accepte une sortie avec un motif de sortie', () => {
    const result = exitSchema.safeParse({ ...base, reason: 'perte' })
    expect(result.success && result.data.quantity).toBe(10)
  })

  it('refuse un motif d’entrée pour une sortie', () => {
    expect(issue(exitSchema, { ...base, reason: 'réception' }, 'reason')).toBe(
      'Motif non autorisé.',
    )
  })

  it('refuse une quantité supérieure à un million', () => {
    expect(issue(exitSchema, { ...base, quantity: '1000001' }, 'quantity')).toBe(
      'La quantité doit être inférieur ou égal à 1000000.',
    )
  })
})

describe('adjustmentSchema', () => {
  it('accepte un ajustement négatif', () => {
    const result = adjustmentSchema.safeParse({ ...base, quantity: '-2', reason: 'inventaire' })
    expect(result.success && result.data.quantity).toBe(-2)
  })

  it('accepte un ajustement positif', () => {
    const result = adjustmentSchema.safeParse({
      ...base,
      quantity: '+3',
      reason: 'ajustement autorisé',
    })
    expect(result.success && result.data.quantity).toBe(3)
  })

  it('refuse un ajustement nul ou vide', () => {
    expect(
      issue(adjustmentSchema, { ...base, quantity: '0', reason: 'inventaire' }, 'quantity'),
    ).toBe('L’ajustement ne peut pas être nul.')
    expect(
      issue(adjustmentSchema, { ...base, quantity: '', reason: 'inventaire' }, 'quantity'),
    ).toBe('La quantité est obligatoire.')
  })

  it('refuse un motif inconnu', () => {
    expect(
      issue(adjustmentSchema, { ...base, quantity: '-1', reason: 'vol' }, 'reason'),
    ).toBe('Motif non autorisé.')
  })
})
