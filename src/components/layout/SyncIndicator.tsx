import { cn } from '../../lib/utils'
import type { SyncStatus } from '../../hooks/useRealtimeSync'

const LABELS: Record<SyncStatus, { label: string; title: string; dot: string }> = {
  live: {
    label: 'Synchronisé',
    title: 'Les modifications faites sur un autre onglet ou appareil s’affichent automatiquement.',
    dot: 'bg-success',
  },
  connecting: {
    label: 'Connexion…',
    title: 'Connexion au service de synchronisation en cours.',
    dot: 'bg-warning animate-pulse',
  },
  offline: {
    label: 'Hors ligne',
    title: 'Synchronisation interrompue : les données seront rechargées dès le retour de la connexion.',
    dot: 'bg-danger',
  },
}

export function SyncIndicator({ status, className }: { status: SyncStatus; className?: string }) {
  const style = LABELS[status]
  return (
    <span
      role="status"
      title={style.title}
      className={cn('inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground', className)}
    >
      <span className="relative flex size-2">
        {status === 'live' ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-40 motion-reduce:hidden" />
        ) : null}
        <span className={cn('relative inline-flex size-2 rounded-full', style.dot)} />
      </span>
      {style.label}
    </span>
  )
}
