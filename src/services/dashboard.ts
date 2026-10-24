import { supabase } from '../lib/supabase'
import { endOfTodayIso, startOfTodayIso } from '../lib/utils'
import type { DashboardStats, StockMovement } from '../types/database'
import { listRecentMovements } from './movements'

export interface DashboardData {
  stats: DashboardStats
  recent: StockMovement[]
}

export async function fetchDashboard(userId: string): Promise<DashboardData> {
  const [activeResult, entriesResult, exitsResult, recent] = await Promise.all([
    supabase
      .from('products')
      .select('quantity, stock_status', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_active', true),
    supabase
      .from('stock_movements')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('type', 'entry')
      .gte('created_at', startOfTodayIso())
      .lte('created_at', endOfTodayIso()),
    supabase
      .from('stock_movements')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('type', 'exit')
      .gte('created_at', startOfTodayIso())
      .lte('created_at', endOfTodayIso()),
    listRecentMovements(userId, 8),
  ])

  if (activeResult.error) throw activeResult.error
  if (entriesResult.error) throw entriesResult.error
  if (exitsResult.error) throw exitsResult.error

  const rows = (activeResult.data ?? []) as { quantity: number; stock_status: string }[]

  const stats: DashboardStats = {
    activeProducts: activeResult.count ?? rows.length,
    totalQuantity: rows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
    lowStockProducts: rows.filter((row) => row.stock_status !== 'ok').length,
    entriesToday: entriesResult.count ?? 0,
    exitsToday: exitsResult.count ?? 0,
  }

  return { stats, recent }
}
