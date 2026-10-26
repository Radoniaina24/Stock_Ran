import { supabase } from '../lib/supabase'
import type { DailyInvoiceResponse } from '../types/database'

/**
 * Facture journalière récapitulative calculée en base (lecture seule) :
 * ventes validées de la date métier, lignes au prix figé, paiements
 * validés et état de clôture. Aucune écriture n'est effectuée.
 */
export async function fetchDailyInvoice(date: string): Promise<DailyInvoiceResponse> {
  const { data, error } = await supabase.rpc('daily_invoice', { p_date: date })
  if (error) throw error
  return data as DailyInvoiceResponse
}

/** Fige l'état de la journée (instantané et totaux arrêtés), action tracée. */
export async function closeDailyInvoice(date: string, comment: string | null): Promise<void> {
  const { error } = await supabase.rpc('close_daily_invoice', { p_date: date, p_comment: comment })
  if (error) throw error
}

/** Rouvre une journée clôturée (propriétaire uniquement, motif obligatoire). */
export async function reopenDailyInvoice(date: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reopen_daily_invoice', { p_date: date, p_reason: reason })
  if (error) throw error
}
