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

/**
 * Remplissage (0–100) d'une jauge de stock : le seuil d'alerte est placé à mi-hauteur,
 * la jauge est pleine à partir de deux fois le seuil.
 */
export function getStockLevel(quantity: number, threshold: number): number {
  const q = Math.max(0, Number(quantity ?? 0))
  const t = Number(threshold ?? 0)
  if (t <= 0) return q > 0 ? 100 : 0
  return Math.min(100, (q / (2 * t)) * 100)
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  out: 'Rupture',
  low: 'Stock faible',
  ok: 'Disponible',
}
