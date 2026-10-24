import type { QueryClient } from '@tanstack/react-query'

/** Racines de toutes les clés de cache dépendant des produits ou des mouvements. */
const STOCK_QUERY_ROOTS = [
  'products',
  'products-active',
  'product-options',
  'product-categories',
  'movements',
  'movements-recent',
  'dashboard',
] as const

/** Invalide (et recharge les requêtes affichées) toutes les données de stock. */
export async function invalidateStockQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    STOCK_QUERY_ROOTS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
  )
}
