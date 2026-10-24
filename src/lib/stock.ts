import type { Product, StockStatus } from '../types/database'

/**
 * Rupture  : quantité = 0
 * Stock faible : 0 < quantité <= seuil d'alerte
 * Sinon    : OK
 */
export function getStockStatus(
  quantity: number,
  threshold: number,
): StockStatus {
  const q = Number(quantity ?? 0)
  const t = Number(threshold ?? 0)
  if (q <= 0) return 'out'
  if (q <= t) return 'low'
  return 'ok'
}

export function getProductStatus(product: Pick<Product, 'quantity' | 'low_stock_threshold'>): StockStatus {
  return getStockStatus(product.quantity, product.low_stock_threshold)
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  out: 'Rupture',
  low: 'Stock faible',
  ok: 'Disponible',
}
