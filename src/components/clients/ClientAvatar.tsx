import { cn } from '../../lib/utils'

const PALETTE = [
  'bg-primary-soft text-primary',
  'bg-success-soft text-success',
  'bg-warning-soft text-warning',
  'bg-violet-50 text-violet-600',
  'bg-sky-50 text-sky-600',
  'bg-rose-50 text-rose-600',
  'bg-teal-50 text-teal-600',
  'bg-amber-50 text-amber-700',
]

/** Initiales d'un nom de client : « Épicerie Rasoa » → « ÉR ». */
function clientInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[1]![0]!).toUpperCase()
}

function colorFor(seed: string): string {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]!
}

export function ClientAvatar({
  name,
  seed,
  archived = false,
  size = 'default',
  className,
}: {
  name: string
  /** Identifiant stable pour garder la même couleur si le nom change. */
  seed?: string
  archived?: boolean
  size?: 'sm' | 'default' | 'lg'
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'sm' && 'size-7 text-[11px]',
        size === 'default' && 'size-9 text-xs',
        size === 'lg' && 'size-12 text-sm',
        archived ? 'bg-muted text-muted-foreground' : colorFor(seed ?? name),
        className,
      )}
    >
      {clientInitials(name)}
    </span>
  )
}
