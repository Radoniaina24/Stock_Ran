import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useAuth } from './useAuth'
import type { MovementFilters, StockMovement } from '../types/database'
import {
  fetchMovementsForExport,
  listMovements,
  listRecentMovements,
  recordStockAdjustment,
  recordStockEntry,
  recordStockExit,
  type RecordMovementInput,
} from '../services/movements'

export function useMovements(
  filters: MovementFilters,
  page = 1,
  pageSize = 20,
): UseQueryResult<{ data: StockMovement[]; total: number }> {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  return useQuery({
    queryKey: ['movements', userId, filters, page, pageSize],
    enabled: Boolean(userId),
    queryFn: () => listMovements(userId, filters, { page, pageSize }),
  })
}

/** Récupère l'intégralité des mouvements filtrés (usage : export CSV). */
export async function fetchMovementsExport(
  userId: string,
  filters: MovementFilters,
): Promise<StockMovement[]> {
  return fetchMovementsForExport(userId, filters)
}

export function useRecentMovements(limit = 8) {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  return useQuery({
    queryKey: ['movements-recent', userId, limit],
    enabled: Boolean(userId),
    queryFn: () => listRecentMovements(userId, limit),
  })
}

export function useMovementMutations() {
  const queryClient = useQueryClient()

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['movements'] })
    void queryClient.invalidateQueries({ queryKey: ['products'] })
    void queryClient.invalidateQueries({ queryKey: ['products-active'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const addEntry = useMutation({
    mutationFn: (input: RecordMovementInput) => recordStockEntry(input),
    onSuccess: invalidate,
  })

  const addExit = useMutation({
    mutationFn: (input: RecordMovementInput) => recordStockExit(input),
    onSuccess: invalidate,
  })

  const addAdjustment = useMutation({
    mutationFn: (input: RecordMovementInput) => recordStockAdjustment(input),
    onSuccess: invalidate,
  })

  return { addEntry, addExit, addAdjustment }
}
