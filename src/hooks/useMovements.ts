import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { invalidateStockQueries } from './stockQueries'
import type { MovementFilters, StockMovement } from '../types/database'
import {
  countMovementsByType,
  fetchMovementsForExport,
  listMovements,
  type MovementCounts,
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
  const { workspaceId } = useAuth()
  const userId = workspaceId ?? ''

  return useQuery({
    queryKey: ['movements', userId, filters, page, pageSize],
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
    queryFn: () => listMovements(userId, filters, { page, pageSize }),
  })
}

/** Compteurs par type pour les filtres donnés (le filtre de type est ignoré). */
export function useMovementCounts(filters: MovementFilters): UseQueryResult<MovementCounts> {
  const { workspaceId } = useAuth()
  const userId = workspaceId ?? ''
  const criteria = { ...filters, type: 'all' as const }

  return useQuery({
    queryKey: ['movements', userId, 'counts', criteria],
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
    queryFn: () => countMovementsByType(userId, criteria),
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
  const { workspaceId } = useAuth()
  const userId = workspaceId ?? ''

  return useQuery({
    queryKey: ['movements-recent', userId, limit],
    enabled: Boolean(userId),
    queryFn: () => listRecentMovements(userId, limit),
  })
}

export function useMovementMutations() {
  const queryClient = useQueryClient()

  const invalidate = () => invalidateStockQueries(queryClient)

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
