import { describe, expect, it } from 'vitest'
import { getProductStatus, getStockStatus, STOCK_STATUS_LABELS } from './stock'

describe('getStockStatus', () => {
  it('signale une rupture lorsque la quantité est nulle', () => {
    expect(getStockStatus(0, 5)).toBe('out')
    expect(getStockStatus(0, 0)).toBe('out')
  })

  it('signale un stock faible lorsque la quantité est inférieure au seuil', () => {
    expect(getStockStatus(4, 5)).toBe('low')
    expect(getStockStatus(5, 5)).toBe('low')
  })

  it('signale un stock correct au-dessus du seuil', () => {
    expect(getStockStatus(6, 5)).toBe('ok')
    expect(getStockStatus(3, 0)).toBe('ok')
  })

  it('tolère les valeurs manquantes', () => {
    expect(getStockStatus(undefined as unknown as number, undefined as unknown as number)).toBe(
      'out',
    )
  })

  it('utilise les mêmes règles depuis un produit', () => {
    expect(
      getProductStatus({ quantity: 2, low_stock_threshold: 2 }),
    ).toBe('low')
  })

  it('expose des libellés français', () => {
    expect(STOCK_STATUS_LABELS).toEqual({
      out: 'Rupture',
      low: 'Stock faible',
      ok: 'Disponible',
    })
  })
})
