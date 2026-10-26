import { useCallback, useState } from 'react'
import { isPaperWidth, type PaperWidth } from '../lib/dailyInvoice'

export interface PrintSettings {
  paper: PaperWidth
  /** Longueur de page ajustée au contenu (rouleau continu). */
  fitLength: boolean
}

const STORAGE_KEY = 'ran-daily-invoice-print'

export const DEFAULT_PRINT_SETTINGS: PrintSettings = { paper: '58', fitLength: true }

function readSettings(): PrintSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PRINT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<PrintSettings>
    return {
      paper: isPaperWidth(parsed.paper) ? parsed.paper : DEFAULT_PRINT_SETTINGS.paper,
      fitLength: typeof parsed.fitLength === 'boolean' ? parsed.fitLength : DEFAULT_PRINT_SETTINGS.fitLength,
    }
  } catch {
    return DEFAULT_PRINT_SETTINGS
  }
}

/** Réglages propres à l'imprimante du poste : conservés sur cet appareil. */
export function usePrintSettings(): [PrintSettings, (patch: Partial<PrintSettings>) => void] {
  const [settings, setSettings] = useState<PrintSettings>(readSettings)

  const update = useCallback((patch: Partial<PrintSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // stockage indisponible : réglage conservé en mémoire
      }
      return next
    })
  }, [])

  return [settings, update]
}
