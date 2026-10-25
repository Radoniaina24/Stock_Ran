import { supabase } from '../lib/supabase'
import type { PaymentMethod, Sale, SaleBalance, SaleFilters, SaleItem } from '../types/database'
import { sanitizeSearch } from './products'

export interface SaleListResult {
  data: SaleBalance[]
  total: number
}

export interface SaleLineInput {
  productId: string
  quantity: number
  unitPrice: number
}

export interface CreateSaleInput {
  clientId: string
  saleDate: string
  comment: string | null
  discountAmount: number
  items: SaleLineInput[]
  paymentAmount: number
  paymentMethod: PaymentMethod
  transactionReference: string | null
  paymentComment: string | null
}

/**
 * Crée la vente, ses lignes, le mouvement de stock et l'éventuel premier
 * paiement dans une transaction unique côté PostgreSQL.
 */
export async function createSale(input: CreateSaleInput): Promise<Sale> {
  const { data, error } = await supabase.rpc('create_sale', {
    p_client_id: input.clientId,
    p_sale_date: input.saleDate,
    p_items: input.items.map((line) => ({
      product_id: line.productId,
      quantity: line.quantity,
      unit_price: line.unitPrice,
    })),
    p_comment: input.comment,
    p_discount_amount: input.discountAmount,
    p_payment_amount: input.paymentAmount,
    p_payment_method: input.paymentMethod,
    p_transaction_reference: input.transactionReference,
    p_payment_comment: input.paymentComment,
  })

  if (error) throw error
  return data as Sale
}

function applySaleFilters(query: ReturnType<typeof buildQuery>, filters: SaleFilters) {
  const search = sanitizeSearch(filters.search)
  let next = query
  if (search) {
    next = next.or(`reference.ilike.%${search}%,client_name.ilike.%${search}%`)
  }
  if (filters.status !== 'all') next = next.eq('status', filters.status)
  if (filters.paymentStatus !== 'all') next = next.eq('payment_status', filters.paymentStatus)
  if (filters.clientId) next = next.eq('client_id', filters.clientId)
  if (filters.from) next = next.gte('sale_date', filters.from)
  if (filters.to) next = next.lte('sale_date', filters.to)
  return next
}

function buildQuery() {
  return supabase.from('sale_balances').select('*', { count: 'exact' })
}

export async function listSales(
  userId: string,
  filters: SaleFilters,
  options: { page?: number; pageSize?: number } = {},
): Promise<SaleListResult> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? 20
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await applySaleFilters(
    buildQuery().eq('user_id', userId),
    filters,
  )
    .order('sale_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return { data: (data ?? []) as SaleBalance[], total: count ?? 0 }
}

export async function fetchSalesForExport(
  userId: string,
  filters: SaleFilters,
  limit = 5000,
): Promise<SaleBalance[]> {
  const { data, error } = await applySaleFilters(buildQuery().eq('user_id', userId), filters)
    .order('sale_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as SaleBalance[]
}

/** Ventes non soldées (créances clients), les plus anciennes en premier. */
export async function listOpenSales(userId: string, limit = 500): Promise<SaleBalance[]> {
  const { data, error } = await supabase
    .from('sale_balances')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'validated')
    .gt('balance_due', 0)
    .order('sale_date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as SaleBalance[]
}

export async function getSale(userId: string, saleId: string): Promise<SaleBalance> {
  const { data, error } = await supabase
    .from('sale_balances')
    .select('*')
    .eq('id', saleId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Vente introuvable.')
  return data as SaleBalance
}

export async function listSaleItems(saleId: string): Promise<SaleItem[]> {
  const { data, error } = await supabase
    .from('sale_items')
    .select('*')
    .eq('sale_id', saleId)
    .order('product_name_snapshot')

  if (error) throw error
  return (data ?? []) as SaleItem[]
}

/** Annule la vente : le stock est réintégré et les paiements restent tracés. */
export async function cancelSale(saleId: string, comment: string | null): Promise<Sale> {
  const { data, error } = await supabase.rpc('cancel_sale', {
    p_sale_id: saleId,
    p_comment: comment,
  })

  if (error) throw error
  return data as Sale
}
