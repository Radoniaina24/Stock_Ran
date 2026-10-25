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
  return { data: (data ?? []) as ClientBalance[], total: count ?? 0 }
}

/** Liste légère pour les listes déroulantes (ventes, filtres). */
export async function listClientOptions(userId: string): Promise<ClientOption[]> {
  const { data, error } = await supabase
    .from('client_balances')
    .select('id, code, name, balance_due')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return (data ?? []) as ClientOption[]
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
