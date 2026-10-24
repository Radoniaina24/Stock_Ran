import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Vrai uniquement si les variables d'environnement sont correctement renseignées.
 * L'application reste navigable sans configuration, mais affiche un message explicite.
 */
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'),
)

// Valeurs de repli : createClient lève une erreur si l'URL est vide.
const url = isSupabaseConfigured ? supabaseUrl : 'https://invalid.supabase.co'
const key = isSupabaseConfigured ? supabaseAnonKey : 'invalid-anon-key'

export const supabase: SupabaseClient = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'ran-stock-auth',
  },
})

/** Traduit les erreurs Supabase en message utilisateur lisible. */
export function supabaseErrorMessage(error: unknown): string {
  if (!error) return 'Une erreur inattendue est survenue.'

  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : (error as { message?: string })?.message

  if (!message) return 'Une erreur inattendue est survenue.'

  const lower = message.toLowerCase()

  if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return 'Connexion impossible. Vérifiez votre accès réseau.'
  }
  if (lower.includes('invalid login credentials')) {
    return 'Identifiants invalides. Vérifiez votre e-mail et votre mot de passe.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Votre adresse e-mail n’est pas encore confirmée.'
  }
  if (lower.includes('user already registered')) {
    return 'Un compte existe déjà avec cette adresse e-mail.'
  }
  if (lower.includes('at least 6 characters')) {
    return 'Le mot de passe doit contenir au moins 6 caractères.'
  }
  if (lower.includes('duplicate key') && lower.includes('reference')) {
    return 'Cette référence est déjà utilisée pour un autre produit.'
  }
  if (lower.includes('row-level security')) {
    return 'Vous n’avez pas les droits nécessaires pour cette opération.'
  }
  if (lower.includes('authentification requise')) {
    return 'Votre session a expiré. Veuillez vous reconnecter.'
  }
  if (lower.includes('password should be at least')) {
    return 'Le mot de passe doit contenir au moins 6 caractères.'
  }

  return message
}
