import { supabase } from '../lib/supabase'
import type { MovementFilters, StockMovement } from '../types/database'
import { sanitizeSearch } from './products'

export interface MovementListResult {
  data: StockMovement[]
  total: number
}

export async function listMovements(
  userId: string,
  filters: MovementFilters,
  options: { page?: number; pageSize?: number } = {},
): Promise<MovementListResult> {
  const search = sanitizeSearch(filters.search)
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? 20

  let query = supabase
    .from('stock_movements')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)

  if (search) {
    query = query.or(`product_name.ilike.%${search}%,product_reference.ilike.%${search}%`)
  }
  if (filters.type !== 'all') {
    query = query.eq('type', filters.type)
  }
  if (filters.productId) {
    query = query.eq('product_id', filters.productId)
  }
  if (filters.reason) {
    query = query.eq('reason', filters.reason)
  }
  if (filters.from) {
    query = query.gte('created_at', new Date(`${filters.from}T00:00:00`).toISOString())
  }
  if (filters.to) {
    query = query.lte('created_at', new Date(`${filters.to}T23:59:59.999`).toISOString())
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return { data: (data ?? []) as StockMovement[], total: count ?? 0 }
}

/** Récupère tous les mouvements filtrés (jusqu'à `limit`) pour l'export CSV. */
export async function fetchMovementsForExport(
  userId: string,
  filters: MovementFilters,
  limit = 5000,
): Promise<StockMovement[]> {
  const search = sanitizeSearch(filters.search)

  let query = supabase.from('stock_movements').select('*').eq('user_id', userId)

  if (search) {
    query = query.or(`product_name.ilike.%${search}%,product_reference.ilike.%${search}%`)
  }
  if (filters.type !== 'all') query = query.eq('type', filters.type)
  if (filters.productId) query = query.eq('product_id', filters.productId)
  if (filters.reason) query = query.eq('reason', filters.reason)
  if (filters.from) {
    query = query.gte('created_at', new Date(`${filters.from}T00:00:00`).toISOString())
  }
  if (filters.to) {
    query = query.lte('created_at', new Date(`${filters.to}T23:59:59.999`).toISOString())
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit)
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
