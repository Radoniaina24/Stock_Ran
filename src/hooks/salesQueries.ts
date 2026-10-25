import type { QueryClient } from '@tanstack/react-query'
import { invalidateStockQueries } from './stockQueries'

/** Racines des clés de cache dépendant des clients, ventes ou paiements. */
const SALES_QUERY_ROOTS = ['clients', 'client-options', 'sales', 'payments', 'dashboard'] as const

/**
 * Invalide toutes les données commerciales ainsi que le stock : une vente
 * ou son annulation déduit ou réintègre des quantités.
 */
export async function invalidateSalesQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    ...SALES_QUERY_ROOTS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    invalidateStockQueries(queryClient),
  ])
}
