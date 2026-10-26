import { supabase } from '../lib/supabase'
import type { EstablishmentSettings } from '../types/database'

export interface EstablishmentInput {
  name: string
  address: string | null
  phone: string | null
  timezone: string
}

/** En-tête de l'établissement (null tant qu'il n'a jamais été renseigné). */
export async function getEstablishment(userId: string): Promise<EstablishmentSettings | null> {
  const { data, error } = await supabase
    .from('establishment_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return (data as EstablishmentSettings | null) ?? null
}

export async function saveEstablishment(
  userId: string,
  input: EstablishmentInput,
): Promise<EstablishmentSettings> {
  const { data, error } = await supabase
    .from('establishment_settings')
    .upsert({ user_id: userId, ...input }, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error) throw error
  return data as EstablishmentSettings
}
