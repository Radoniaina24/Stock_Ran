import type { ReactNode } from 'react'
import { FilterX, X } from 'lucide-react'
import { Button } from './button'

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-card py-1 ps-3 pe-1 text-xs font-medium text-foreground">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Retirer le filtre ${label}`}
        className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

/** Bandeau « Filtres actifs » affiché sous les filtres d'une liste. */
export function ActiveFilters({ children, onClearAll }: { children: ReactNode; onClearAll: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-4 py-3">
      <span className="text-xs text-muted-foreground">Filtres actifs :</span>
      {children}
      <Button variant="ghost" size="sm" onClick={onClearAll} className="ms-auto">
        <FilterX className="size-3.5" />
        Tout effacer
      </Button>
    </div>
  )
}
