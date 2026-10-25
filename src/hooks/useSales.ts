import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { invalidateSalesQueries } from './salesQueries'
import type { SaleBalance, SaleFilters, SaleItem, SalesOverview } from '../types/database'
import {
  cancelSale,
  createSale,
  getSale,
  listOpenSales,
  listSaleItems,
  listSales,
  type CreateSaleInput,
} from '../services/sales'
import { fetchSalesOverview } from '../services/dashboard'

export function useSales(
  filters: SaleFilters,
  page = 1,
  pageSize = 20,
): UseQueryResult<{ data: SaleBalance[]; total: number }> {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  return useQuery({
    queryKey: ['sales', userId, filters, page, pageSize],
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
    queryFn: () => listSales(userId, filters, { page, pageSize }),
  })
}

export function useSale(saleId: string | undefined): UseQueryResult<SaleBalance> {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  return useQuery({
    queryKey: ['sales', userId, 'detail', saleId],
    enabled: Boolean(userId && saleId),
    queryFn: () => getSale(userId, saleId!),
  })
}

export function useSaleItems(saleId: string | undefined): UseQueryResult<SaleItem[]> {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  return useQuery({
    queryKey: ['sales', userId, 'items', saleId],
    enabled: Boolean(userId && saleId),
    queryFn: () => listSaleItems(saleId!),
  })
}

/** Ventes restant à encaisser (page Créances clients). */
export function useOpenSales(): UseQueryResult<SaleBalance[]> {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  return useQuery({
    queryKey: ['sales', userId, 'open'],
    enabled: Boolean(userId),
    queryFn: () => listOpenSales(userId),
  })
}

export function useSalesOverview(): UseQueryResult<SalesOverview> {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  return useQuery({
    queryKey: ['dashboard', userId, 'sales-overview'],
    enabled: Boolean(userId),
    queryFn: () => fetchSalesOverview(),
  })
}

export function useSaleMutations() {
  const queryClient = useQueryClient()

  const invalidate = () => invalidateSalesQueries(queryClient)

  const create = useMutation({
    mutationFn: (input: CreateSaleInput) => createSale(input),
    onSuccess: invalidate,
  })

  const cancel = useMutation({
    mutationFn: ({ saleId, comment }: { saleId: string; comment: string | null }) =>
      cancelSale(saleId, comment),
    onSuccess: invalidate,
  })

  return { create, cancel }
}
