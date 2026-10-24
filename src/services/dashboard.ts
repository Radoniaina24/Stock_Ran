import { supabase } from '../lib/supabase'
import {
  activityStartIso,
  buildDailyActivity,
  pickStockAlerts,
  type DailyActivity,
  type StockAlert,
} from '../lib/dashboard'
import { endOfTodayIso, startOfTodayIso } from '../lib/utils'
import type { DashboardStats } from '../types/database'

export const ACTIVITY_DAYS = 7
const MAX_ALERTS = 5

export interface DashboardData {
  stats: DashboardStats
  alerts: StockAlert[]
  activity: DailyActivity[]
}

export async function fetchDashboard(userId: string): Promise<DashboardData> {
  const [activeResult, entriesResult, exitsResult, activityResult] = await Promise.all([
    supabase
      .from('products')
      .select('id, reference, name, unit, quantity, low_stock_threshold, stock_status', {
        count: 'exact',
      })
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
    supabase
      .from('stock_movements')
      .select('type, created_at')
      .eq('user_id', userId)
      .in('type', ['entry', 'exit'])
      .gte('created_at', activityStartIso(ACTIVITY_DAYS))
      .order('created_at', { ascending: false })
      .limit(1000),
  ])

  if (activeResult.error) throw activeResult.error
  if (entriesResult.error) throw entriesResult.error
  if (exitsResult.error) throw exitsResult.error
  if (activityResult.error) throw activityResult.error

  const rows = (activeResult.data ?? []) as Parameters<typeof pickStockAlerts>[0]

  const stats: DashboardStats = {
    activeProducts: activeResult.count ?? rows.length,
    totalQuantity: rows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
    lowStockProducts: rows.filter((row) => row.stock_status !== 'ok').length,
    outOfStockProducts: rows.filter((row) => row.stock_status === 'out').length,
    entriesToday: entriesResult.count ?? 0,
    exitsToday: exitsResult.count ?? 0,
  }

  return {
    stats,
    alerts: pickStockAlerts(rows, MAX_ALERTS),
    activity: buildDailyActivity(activityResult.data ?? [], ACTIVITY_DAYS),
  }
}
