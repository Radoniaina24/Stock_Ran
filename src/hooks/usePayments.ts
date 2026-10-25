import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { invalidateSalesQueries } from './salesQueries'
import type { Payment, PaymentFilters, PaymentRow } from '../types/database'
import { summarizePayments, type PaymentSummary } from '../lib/sales'
import {
  cancelPayment,
  fetchPaymentSummaryRows,
  listPayments,
  listSalePayments,
  recordPayment,
  type RecordPaymentInput,
} from '../services/payments'

export function usePayments(
  filters: PaymentFilters,
  page = 1,
  pageSize = 20,
): UseQueryResult<{ data: PaymentRow[]; total: number }> {
  const { workspaceId } = useAuth()
  const userId = workspaceId ?? ''

  return useQuery({
    queryKey: ['payments', userId, filters, page, pageSize],
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
    queryFn: () => listPayments(userId, filters, { page, pageSize }),
  })
}

/** Montants encaissés et compteurs par moyen pour les filtres courants. */
export function usePaymentSummary(filters: PaymentFilters): UseQueryResult<PaymentSummary> {
  const { workspaceId } = useAuth()
  const userId = workspaceId ?? ''
  const { search, clientId, from, to } = filters

  return useQuery({
    queryKey: ['payments', userId, 'summary', { search, clientId, from, to }],
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
    queryFn: async () => summarizePayments(await fetchPaymentSummaryRows(userId, filters)),
  })
}

export function useSalePayments(saleId: string | undefined): UseQueryResult<PaymentRow[]> {
  const { workspaceId } = useAuth()
  const userId = workspaceId ?? ''

  return useQuery({
    queryKey: ['payments', userId, 'sale', saleId],
    enabled: Boolean(userId && saleId),
    queryFn: () => listSalePayments(saleId!),
  })
}

export function usePaymentMutations() {
  const queryClient = useQueryClient()

  const invalidate = () => invalidateSalesQueries(queryClient)

  const record = useMutation({
    mutationFn: (input: RecordPaymentInput) => recordPayment(input),
    onSuccess: invalidate,
  })

  const cancel = useMutation({
    mutationFn: ({ paymentId, comment }: { paymentId: string; comment: string | null }) =>
      cancelPayment(paymentId, comment),
    onSuccess: invalidate,
  })

  return { record, cancel }
}

export type { Payment }
