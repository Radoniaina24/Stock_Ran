import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Pastille affichée à gauche du titre. */
  icon?: ReactNode
  size?: keyof typeof SIZES
  className?: string
}

const SIZES = {
  sm: 'sm:max-w-md',
  default: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
} as const

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  icon,
  size = 'default',
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return

    previousFocus.current = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const panel = panelRef.current
    const body = panel?.querySelector<HTMLElement>('[data-modal-body]')
    const focusable =
      body?.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      ) ??
      panel?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )
    focusable?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel) return

      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null)

      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = overflow
      previousFocus.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 animate-overlay-in bg-slate-900/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'relative z-10 flex max-h-[92svh] w-full flex-col overflow-hidden border border-border bg-card shadow-2xl',
          'animate-sheet-in rounded-t-2xl sm:max-h-[88vh] sm:animate-dialog-in sm:rounded-xl',
          'motion-reduce:animate-none',
          SIZES[size],
          className,
        )}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden="true" />

        <div className="flex shrink-0 items-start gap-3 px-5 pt-4 pb-4 sm:px-6 sm:pt-5">
          {icon ? <div className="shrink-0">{icon}</div> : null}
          <div className="min-w-0 flex-1 space-y-1">
            <h2 id={titleId} className="text-base font-semibold leading-6 text-foreground sm:text-lg">
              {title}
            </h2>
            {description ? (
              <div id={descriptionId} className="text-sm text-muted-foreground">
                {description}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="-me-1.5 -mt-1 shrink-0 cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div data-modal-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6">
          {children}
        </div>

        {footer ? (
          <div
            className={cn(
              'flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-muted/40 px-5 py-4 sm:flex-row sm:justify-end sm:px-6',
              'pb-[max(1rem,env(safe-area-inset-bottom))] [&>*]:w-full sm:[&>*]:w-auto',
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

export function ModalIcon({
  children,
  tone = 'primary',
}: {
  children: ReactNode
  tone?: 'primary' | 'danger' | 'warning' | 'success'
}) {
  const tones = {
    primary: 'bg-primary-soft text-primary ring-primary/15',
    danger: 'bg-danger-soft text-danger ring-danger/15',
    warning: 'bg-warning-soft text-warning ring-warning/20',
    success: 'bg-success-soft text-success ring-success/15',
  }

  return (
    <span className={cn('flex size-10 items-center justify-center rounded-xl ring-1 ring-inset', tones[tone])}>
      {children}
    </span>
  )
}
