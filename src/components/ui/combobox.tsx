import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronsUpDown, Search, SearchX } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface ComboboxOption {
  value: string
  label: string
  description?: string
  /** Contenu affiché à droite de l'option (non pris en compte par la recherche). */
  aside?: ReactNode
}

export interface ComboboxProps {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  id?: string
  placeholder?: string
  emptyText?: string
  disabled?: boolean
  invalid?: boolean
  /** Cible du focus initial lorsqu'il est affiché dans une modale. */
  autoFocusTarget?: boolean
  className?: string
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

export function Combobox({
  options,
  value,
  onChange,
  id,
  placeholder = 'Rechercher…',
  emptyText = 'Aucun résultat',
  disabled,
  invalid,
  autoFocusTarget,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = options.find((option) => option.value === value)

  const filtered = useMemo(() => {
    const term = normalize(query.trim())
    if (!term) return options
    return options.filter(
      (option) =>
        normalize(option.label).includes(term) ||
        (option.description ? normalize(option.description).includes(term) : false),
    )
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const activePosition = Math.min(activeIndex, Math.max(filtered.length - 1, 0))

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const select = (option: ComboboxOption) => {
    onChange(option.value)
    close()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) setOpen(true)
      else setActiveIndex((index) => Math.min(index + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      if (open && filtered[activePosition]) {
        event.preventDefault()
        select(filtered[activePosition])
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        close()
      }
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={id}
          role="combobox"
          type="text"
          autoComplete="off"
          disabled={disabled}
          data-autofocus={autoFocusTarget || undefined}
          aria-invalid={invalid || undefined}
          aria-expanded={open}
          aria-controls={id ? `${id}-listbox` : undefined}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={open ? query : (selected?.label ?? '')}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          className={cn(
            'h-10 w-full rounded-lg border border-input bg-card ps-9 pe-9 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
            invalid && 'border-danger',
          )}
        />
        <ChevronsUpDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      {open ? (
        <ul
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute z-40 mt-1.5 max-h-72 w-full animate-dialog-in overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg motion-reduce:animate-none"
        >
          {filtered.length === 0 ? (
            <li className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
              <SearchX className="size-4" />
              {emptyText}
            </li>
          ) : (
            filtered.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(option)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm',
                  index === activePosition ? 'bg-muted' : 'text-foreground',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{option.label}</span>
                  {option.description ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  ) : null}
                </span>
                {option.aside ? <span className="shrink-0 text-xs">{option.aside}</span> : null}
                <Check
                  className={cn('size-4 shrink-0 text-primary', option.value === value ? 'opacity-100' : 'opacity-0')}
                  aria-hidden="true"
                />
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
