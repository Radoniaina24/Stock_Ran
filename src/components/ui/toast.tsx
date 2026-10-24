import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { CheckCircle2, Info, XCircle, X } from 'lucide-react'
import { cn } from '../../lib/utils'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastContextValue {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const CONFIG: Record<ToastKind, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: 'border-success/30 bg-success-soft text-success' },
  error: { icon: XCircle, className: 'border-danger/30 bg-danger-soft text-danger' },
  info: { icon: Info, className: 'border-primary/30 bg-primary-soft text-primary' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      idRef.current += 1
      const id = idRef.current
      setItems((current) => [...current, { id, kind, message }])
      window.setTimeout(() => remove(id), 5000)
    },
    [remove],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message: string) => push('success', message),
      error: (message: string) => push('error', message),
      info: (message: string) => push('info', message),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:end-4 sm:items-end"
      >
        {items.map((item) => {
          const config = CONFIG[item.kind]
          const Icon = config.icon
          return (
            <div
              key={item.id}
              role="status"
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-md',
                config.className,
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1 text-foreground">{item.message}</span>
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label="Fermer la notification"
                className="cursor-pointer rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast doit être utilisé dans <ToastProvider>.')
  return ctx
}
