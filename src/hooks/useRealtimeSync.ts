import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { invalidateStockQueries } from './stockQueries'
import { invalidateSalesQueries } from './salesQueries'

export type SyncStatus = 'connecting' | 'live' | 'offline'

type Scope = 'stock' | 'all'

const STOCK_TABLES = ['products', 'stock_movements'] as const
const SALES_TABLES = ['clients', 'sales', 'payments'] as const

/**
 * Recharge automatiquement les données quand le stock, les clients, les
 * ventes ou les paiements changent en base (autre onglet, autre appareil),
 * via Supabase Realtime. Après une coupure, tout est rechargé : les
 * événements émis pendant la déconnexion ne sont pas rejoués.
 */
export function useRealtimeSync(): SyncStatus {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const userId = user?.id
  const [status, setStatus] = useState<SyncStatus>('connecting')

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let pending: Scope | null = null
    let wasLive = false
    let disconnected = false

    const flush = () => {
      const scope = pending
      pending = null
      if (scope === 'all') void invalidateSalesQueries(queryClient)
      else if (scope === 'stock') void invalidateStockQueries(queryClient)
    }

    // Regroupe les rafales d'événements : une vente insère la vente, ses
    // mouvements et met à jour les produits dans la même transaction.
    const schedule = (scope: Scope) => {
      pending = pending === 'all' || scope === 'all' ? 'all' : 'stock'
      clearTimeout(timer)
      timer = setTimeout(flush, 300)
    }

    const filter = `user_id=eq.${userId}`
    let channel = supabase.channel(`data-sync-${userId}`)

    for (const table of [...STOCK_TABLES, ...SALES_TABLES]) {
      const scope: Scope = (STOCK_TABLES as readonly string[]).includes(table) ? 'stock' : 'all'
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => schedule(scope))
    }
    // Les événements DELETE ne sont pas filtrables côté Realtime.
    channel = channel
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'products' }, () => schedule('stock'))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'clients' }, () => schedule('all'))

    channel.subscribe((state) => {
      if (state === 'SUBSCRIBED') {
        if (wasLive && disconnected) schedule('all')
        wasLive = true
        disconnected = false
        setStatus('live')
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
        disconnected = true
        setStatus('offline')
      }
    })

    const onOnline = () => schedule('all')
    const onOffline = () => {
      disconnected = true
      setStatus('offline')
    }
    // Un onglet resté longtemps en arrière-plan peut avoir manqué des événements.
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > 60_000) schedule('all')
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibility)
      void supabase.removeChannel(channel)
    }
  }, [userId, queryClient])

  return status
}
