import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Density = 'comfortable' | 'compact'

export interface Preferences {
  appName: string
  density: Density
}

const STORAGE_KEY = 'ran-stock-preferences'

const DEFAULT_PREFERENCES: Preferences = {
  appName: 'Gestion de stock',
  density: 'comfortable',
}

function readPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const parsed = JSON.parse(raw) as Partial<Preferences>
    return {
      appName:
        typeof parsed.appName === 'string' && parsed.appName.trim()
          ? parsed.appName.trim()
          : DEFAULT_PREFERENCES.appName,
      density: parsed.density === 'compact' ? 'compact' : 'comfortable',
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

interface PreferencesContextValue {
  preferences: Preferences
  updatePreferences: (patch: Partial<Preferences>) => void
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(readPreferences)

  useEffect(() => {
    document.documentElement.dataset.density = preferences.density
    document.title = preferences.appName
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    } catch {
      // stockage indisponible : les préférences restent en mémoire
    }
  }, [preferences])

  const updatePreferences = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => ({ ...current, ...patch }))
  }, [])

  const value = useMemo(
    () => ({ preferences, updatePreferences }),
    [preferences, updatePreferences],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences doit être utilisé dans <PreferencesProvider>.')
  return ctx
}
