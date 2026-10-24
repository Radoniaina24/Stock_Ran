import { supabase } from '../lib/supabase'
import type { MovementFilters, MovementType, StockMovement } from '../types/database'
import { sanitizeSearch } from './products'

export interface MovementListResult {
  data: StockMovement[]
  total: number
}

interface FilterableQuery {
  or(filters: string): this
  eq(column: string, value: string): this
  gte(column: string, value: string): this
  lte(column: string, value: string): this
}

/** Applique les critères de recherche communs à la liste, à l'export et aux compteurs. */
function applyMovementFilters<Q extends FilterableQuery>(query: Q, filters: MovementFilters): Q {
  const search = sanitizeSearch(filters.search)
  let next = query
  if (search) {
    next = next.or(`product_name.ilike.%${search}%,product_reference.ilike.%${search}%`)
  }
  if (filters.type !== 'all') next = next.eq('type', filters.type)
  if (filters.productId) next = next.eq('product_id', filters.productId)
  if (filters.reason) next = next.eq('reason', filters.reason)
  if (filters.from) next = next.gte('created_at', new Date(`${filters.from}T00:00:00`).toISOString())
  if (filters.to) next = next.lte('created_at', new Date(`${filters.to}T23:59:59.999`).toISOString())
  return next
}

export async function listMovements(
  userId: string,
  filters: MovementFilters,
  options: { page?: number; pageSize?: number } = {},
): Promise<MovementListResult> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? 20
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await applyMovementFilters(
    supabase.from('stock_movements').select('*', { count: 'exact' }).eq('user_id', userId),
    filters,
  )
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return { data: (data ?? []) as StockMovement[], total: count ?? 0 }
}

export type MovementCounts = Record<MovementType, number>

/** Nombre de mouvements par type pour les mêmes critères (le filtre de type est ignoré). */
export async function countMovementsByType(
  userId: string,
  filters: MovementFilters,
): Promise<MovementCounts> {
  const types: MovementType[] = ['entry', 'exit', 'adjustment']
  const results = await Promise.all(
    types.map((type) =>
      applyMovementFilters(
        supabase
          .from('stock_movements')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId),
        { ...filters, type },
      ),
    ),
  )

  const counts = { entry: 0, exit: 0, adjustment: 0 }
  results.forEach((result, index) => {
    if (result.error) throw result.error
    counts[types[index]!] = result.count ?? 0
  })
  return counts
}

/** Récupère tous les mouvements filtrés (jusqu'à `limit`) pour l'export CSV. */
export async function fetchMovementsForExport(
  userId: string,
  filters: MovementFilters,
  limit = 5000,
): Promise<StockMovement[]> {
  const { data, error } = await applyMovementFilters(
    supabase.from('stock_movements').select('*').eq('user_id', userId),
    filters,
  )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as StockMovement[]
}

export async function listRecentMovements(
  userId: string,
  limit = 8,
): Promise<StockMovement[]> {
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as StockMovement[]
}

export interface RecordMovementInput {
  productId: string
  quantity: number
  reason: string
  comment: string | null
}

export async function recordStockEntry(input: RecordMovementInput): Promise<StockMovement> {
  const { data, error } = await supabase.rpc('record_stock_entry', {
    p_product_id: input.productId,
    p_quantity: input.quantity,
    p_reason: input.reason,
    p_comment: input.comment,
  })

  if (error) throw error
  return data as StockMovement
}

export async function recordStockExit(input: RecordMovementInput): Promise<StockMovement> {
  const { data, error } = await supabase.rpc('record_stock_exit', {
    p_product_id: input.productId,
    p_quantity: input.quantity,
    p_reason: input.reason,
    p_comment: input.comment,
  })

  if (error) throw error
  return data as StockMovement
}

export async function recordStockAdjustment(
  input: RecordMovementInput,
): Promise<StockMovement> {
  const { data, error } = await supabase.rpc('record_stock_adjustment', {
    p_product_id: input.productId,
    p_delta: input.quantity,
    p_reason: input.reason,
    p_comment: input.comment,
  })

  if (error) throw error
  return data as StockMovement
}
