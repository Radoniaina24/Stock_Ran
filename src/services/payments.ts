import { supabase } from '../lib/supabase'
import type {
  Payment,
  PaymentFilters,
  PaymentMethod,
  PaymentRow,
} from '../types/database'
import { sanitizeSearch } from './products'

export interface PaymentListResult {
  data: PaymentRow[]
  total: number
}

export interface RecordPaymentInput {
  saleId: string
  amount: number
  paymentMethod: PaymentMethod
  transactionReference: string | null
  comment: string | null
}

/** Enregistre un encaissement sur une vente (montant borné par le solde). */
export async function recordPayment(input: RecordPaymentInput): Promise<Payment> {
  const { data, error } = await supabase.rpc('record_payment', {
    p_sale_id: input.saleId,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
    p_transaction_reference: input.transactionReference,
    p_comment: input.comment,
  })

  if (error) throw error
  return data as Payment
}

/** Annule un encaissement : le paiement reste tracé, jamais supprimé. */
export async function cancelPayment(
  paymentId: string,
  comment: string | null,
): Promise<Payment> {
  const { data, error } = await supabase.rpc('cancel_payment', {
    p_payment_id: paymentId,
    p_comment: comment,
  })

  if (error) throw error
  return data as Payment
}

const PAYMENT_SELECT = '*, sale:sales(reference, status), client:clients(name)'

interface PaymentEmbed extends Payment {
  sale: { reference: string; status: string } | null
  client: { name: string } | null
}

function toRow(row: PaymentEmbed): PaymentRow {
  return {
    ...row,
    client_name: row.client?.name ?? null,
    sale_reference: row.sale?.reference ?? '',
    sale_status: row.sale?.status === 'cancelled' ? 'cancelled' : 'validated',
  }
}

/**
 * La recherche porte sur la référence du paiement ou le nom du client
 * (les identifiants sont résolus au préalable, une virgule casserait
 * la syntaxe des filtres PostgREST).
 */
async function resolveSearchClientIds(userId: string, search: string): Promise<string[]> {
  if (!search) return []
  const { data, error } = await supabase
    .from('clients')
    .select('id')
    .eq('user_id', userId)
    .or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    .limit(100)

  if (error) throw error
  return (data ?? []).map((row) => row.id as string)
}

function filteredPaymentQuery(
  userId: string,
  filters: PaymentFilters,
  clientIds: string[],
  columns: string,
  withCount: boolean,
) {
  const search = sanitizeSearch(filters.search)

  let query = supabase
    .from('payments')
    .select(columns, withCount ? { count: 'exact' } : undefined)
    .eq('user_id', userId)

  if (search) {
    query = query.or(
      clientIds.length > 0
        ? `reference.ilike.%${search}%,client_id.in.(${clientIds.join(',')})`
        : `reference.ilike.%${search}%`,
    )
  }
  if (filters.method !== 'all') query = query.eq('payment_method', filters.method)
  if (filters.clientId) query = query.eq('client_id', filters.clientId)
  if (filters.from) {
    query = query.gte('paid_at', new Date(`${filters.from}T00:00:00`).toISOString())
  }
  if (filters.to) {
    query = query.lte('paid_at', new Date(`${filters.to}T23:59:59.999`).toISOString())
  }

  return query
}

export async function listPayments(
  userId: string,
  filters: PaymentFilters,
  options: { page?: number; pageSize?: number } = {},
): Promise<PaymentListResult> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? 20
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const clientIds = await resolveSearchClientIds(userId, sanitizeSearch(filters.search))
  const { data, error, count } = await filteredPaymentQuery(userId, filters, clientIds, PAYMENT_SELECT, true)
    .order('paid_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return {
    data: ((data ?? []) as unknown as PaymentEmbed[]).map(toRow),
    total: count ?? 0,
  }
}

export async function fetchPaymentsForExport(
  userId: string,
  filters: PaymentFilters,
  limit = 5000,
): Promise<PaymentRow[]> {
  const clientIds = await resolveSearchClientIds(userId, sanitizeSearch(filters.search))
  const { data, error } = await filteredPaymentQuery(userId, filters, clientIds, PAYMENT_SELECT, false)
    .order('paid_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return ((data ?? []) as unknown as PaymentEmbed[]).map(toRow)
}

export type PaymentSummaryRow = Pick<Payment, 'amount' | 'payment_method' | 'status'>

/** Montants et compteurs par moyen : mêmes filtres que la liste, sans le moyen. */
export async function fetchPaymentSummaryRows(
  userId: string,
  filters: PaymentFilters,
  limit = 5000,
): Promise<PaymentSummaryRow[]> {
  const clientIds = await resolveSearchClientIds(userId, sanitizeSearch(filters.search))
  const { data, error } = await filteredPaymentQuery(
    userId,
    { ...filters, method: 'all' },
    clientIds,
    'amount, payment_method, status',
    false,
  ).limit(limit)

  if (error) throw error
  return (data ?? []) as unknown as PaymentSummaryRow[]
}

export async function listSalePayments(saleId: string): Promise<PaymentRow[]> {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT)
    .eq('sale_id', saleId)
    .order('paid_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as PaymentEmbed[]).map(toRow)
}
