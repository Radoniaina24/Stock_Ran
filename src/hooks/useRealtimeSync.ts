import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { invalidateStockQueries } from './stockQueries'

/**
 * Recharge automatiquement les données quand les produits ou les mouvements
 * changent en base (autre onglet, autre appareil), via Supabase Realtime.
 */
export function useRealtimeSync(): void {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const userId = user?.id

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return

    let timer: ReturnType<typeof setTimeout> | undefined
    // Regroupe les rafales d'événements (un mouvement modifie aussi le produit).
    const scheduleRefresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void invalidateStockQueries(queryClient), 300)
    }

    const filter = `user_id=eq.${userId}`
    const channel = supabase
      .channel(`stock-sync-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter }, scheduleRefresh)
      // Les événements DELETE ne sont pas filtrables côté Realtime.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'products' }, scheduleRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_movements', filter }, scheduleRefresh)
      .subscribe()

    return () => {
      clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [userId, queryClient])
}
