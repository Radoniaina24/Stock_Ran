import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { closeDailyInvoice, fetchDailyInvoice, reopenDailyInvoice } from '../services/dailyInvoices'
import type { DailyInvoiceResponse } from '../types/database'

/**
 * Sous la racine « sales » : la synchronisation temps réel des ventes et
 * des paiements recharge aussi la facture affichée.
 */
function dailyInvoiceKey(userId: string, date: string) {
  return ['sales', userId, 'daily-invoice', date] as const
}

export function useDailyInvoice(date: string): UseQueryResult<DailyInvoiceResponse> {
  const { workspaceId } = useAuth()
  const userId = workspaceId ?? ''

  return useQuery({
    queryKey: dailyInvoiceKey(userId, date),
    enabled: Boolean(userId && date),
    queryFn: () => fetchDailyInvoice(date),
  })
}

export function useDailyInvoiceMutations(date: string) {
  const { workspaceId } = useAuth()
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: dailyInvoiceKey(workspaceId ?? '', date) })

  const close = useMutation({
    mutationFn: (comment: string | null) => closeDailyInvoice(date, comment),
    onSettled: invalidate,
  })

  const reopen = useMutation({
    mutationFn: (reason: string) => reopenDailyInvoice(date, reason),
    onSettled: invalidate,
  })

  return { close, reopen }
}
