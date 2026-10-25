import { supabase } from '../lib/supabase'
import type { Client, ClientBalance, ClientFilters } from '../types/database'
import { sanitizeSearch } from './products'
import type { ClientFormPayload } from '../schemas/client'

export interface ClientListResult {
  data: ClientBalance[]
  total: number
}

export interface ClientOption {
  id: string
  code: string
  name: string
  balance_due: number
}

/** La vue `client_balances` expose l'identifiant sous le nom `client_id`. */
function withClientId<T extends { client_id: string }>(row: T): Omit<T, 'client_id'> & { id: string } {
  const { client_id, ...rest } = row
  return { ...rest, id: client_id }
}

export async function listClients(
  userId: string,
  filters: ClientFilters,
): Promise<ClientListResult> {
  const search = sanitizeSearch(filters.search)

  let query = supabase
    .from('client_balances')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)

  if (search) {
    query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%`)
  }
  if (filters.status === 'active') {
    query = query.eq('is_active', true)
  } else if (filters.status === 'archived') {
    query = query.eq('is_active', false)
  }
  if (filters.balance === 'with_balance') {
    query = query.gt('balance_due', 0)
  } else if (filters.balance === 'settled') {
    query = query.eq('balance_due', 0)
  }

  const from = (filters.page - 1) * filters.pageSize
  const to = from + filters.pageSize - 1

  const { data, error, count } = await query
    .order(filters.sort, { ascending: filters.order === 'asc', nullsFirst: false })
    .order('name', { ascending: true })
    .range(from, to)

  if (error) throw error
  return {
    data: ((data ?? []) as (Omit<ClientBalance, 'id'> & { client_id: string })[]).map(
      (row) => withClientId(row) as ClientBalance,
    ),
    total: count ?? 0,
  }
}

export interface ClientSummary {
  counts: { all: number; active: number; with_balance: number; archived: number }
  totalSales: number
  totalPaid: number
  balanceDue: number
}

/** Compteurs des onglets et totaux du portefeuille client. */
export async function fetchClientSummary(userId: string): Promise<ClientSummary> {
  const { data, error } = await supabase
    .from('client_balances')
    .select('is_active, balance_due, total_sales, total_paid')
    .eq('user_id', userId)
    .limit(10000)

  if (error) throw error

  const summary: ClientSummary = {
    counts: { all: 0, active: 0, with_balance: 0, archived: 0 },
    totalSales: 0,
    totalPaid: 0,
    balanceDue: 0,
  }
  for (const row of (data ?? []) as Pick<ClientBalance, 'is_active' | 'balance_due' | 'total_sales' | 'total_paid'>[]) {
    summary.counts.all += 1
    if (row.is_active) summary.counts.active += 1
    else summary.counts.archived += 1
    if (Number(row.balance_due) > 0) summary.counts.with_balance += 1
    summary.totalSales += Number(row.total_sales)
    summary.totalPaid += Number(row.total_paid)
    summary.balanceDue += Number(row.balance_due)
  }
  return summary
}

/** Liste légère pour les listes déroulantes (ventes, filtres). */
export async function listClientOptions(userId: string): Promise<ClientOption[]> {
  const { data, error } = await supabase
    .from('client_balances')
    .select('client_id, code, name, balance_due')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return ((data ?? []) as (Omit<ClientOption, 'id'> & { client_id: string })[]).map(withClientId)
}

export async function getClient(userId: string, clientId: string): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Client introuvable.')
  return data as Client
}

export async function createClient(
  userId: string,
  input: ClientFormPayload,
): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .insert({ ...input, user_id: userId })
    .select('*')
    .single()

  if (error) throw error
  return data as Client
}

export async function updateClient(
  userId: string,
  clientId: string,
  input: ClientFormPayload,
): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .update(input)
    .eq('id', clientId)
    .eq('user_id', userId)
    .select('*')
    .single()

  if (error) throw error
  return data as Client
}

/**
 * Suppression. Les clients rattachés à des ventes ou des paiements sont
 * protégés par la politique RLS : aucune ligne n'est supprimée et aucune
 * erreur n'est remontée, ce que l'on traduit ici en message explicite.
 */
export async function deleteClient(userId: string, clientId: string): Promise<void> {
  const { data, error } = await supabase
    .from('clients')
    .delete()
    .eq('id', clientId)
    .eq('user_id', userId)
    .select('id')

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Ce client possède des ventes ou des paiements et ne peut pas être supprimé.')
  }
}
