import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase, supabaseErrorMessage } from '../lib/supabase'

interface AuthContextValue {
  session: Session | null
  user: User | null
  /** Propriétaire des données visibles : le compte lui-même ou l'espace auquel il est rattaché. */
  workspaceId: string | null
  loading: boolean
  isConfigured: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<string | null>
  updatePassword: (password: string) => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return
        setSession(data.session)
        setLoading(false)
      })
      .catch(() => {
        if (!mounted) return
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id ?? null
  const [workspace, setWorkspace] = useState<{ userId: string; id: string } | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void supabase.rpc('current_workspace_id').then(({ data, error }) => {
      if (cancelled) return
      setWorkspace({ userId, id: !error && typeof data === 'string' ? data : userId })
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  const workspaceId = userId && workspace?.userId === userId ? workspace.id : null

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? supabaseErrorMessage(error) : null
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    return error ? supabaseErrorMessage(error) : null
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    return error ? supabaseErrorMessage(error) : null
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      workspaceId,
      loading,
      isConfigured: isSupabaseConfigured,
      signIn,
      signOut,
      updatePassword,
    }),
    [session, workspaceId, loading, signIn, signOut, updatePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.')
  return ctx
}
