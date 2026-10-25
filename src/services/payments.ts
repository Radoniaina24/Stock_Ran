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

export async function listPayments(
  userId: string,
  filters: PaymentFilters,
  options: { page?: number; pageSize?: number } = {},
): Promise<PaymentListResult> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? 20
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const search = sanitizeSearch(filters.search)

  let query = supabase
    .from('payments')
    .select(PAYMENT_SELECT, { count: 'exact' })
    .eq('user_id', userId)

  if (search) {
    // La recherche porte sur la référence du paiement ou le nom du client
    // (les identifiants sont résolus au préalable, une virgule casserait
    // la syntaxe des filtres PostgREST).
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', userId)
      .or(`name.ilike.%${search}%,code.ilike.%${search}%`)
      .limit(100)

    if (clientsError) throw clientsError
    const ids = (clients ?? []).map((row) => row.id)
    query = query.or(
      ids.length > 0
        ? `reference.ilike.%${search}%,client_id.in.(${ids.join(',')})`
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

  const { data, error, count } = await query
    .order('paid_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return {
    data: ((data ?? []) as PaymentEmbed[]).map(toRow),
    total: count ?? 0,
  }
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
