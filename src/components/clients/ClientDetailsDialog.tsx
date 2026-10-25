import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, ChevronRight, Mail, MapPin, Pencil, Phone, ShoppingCart, UserRound } from 'lucide-react'
import { ClientAvatar } from './ClientAvatar'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Modal } from '../ui/dialog'
import { Skeleton } from '../ui/skeleton'
import { PaymentProgress, PaymentStatusBadge } from '../sales/status-badges'
import { useSales } from '../../hooks/useSales'
import { useUserLabel } from '../../hooks/useWorkspaceUsers'
import { paidRatio } from '../../lib/sales'
import { cn, formatAmount, formatDay } from '../../lib/utils'
import { EMPTY_SALE_FILTERS, type Client, type ClientBalance } from '../../types/database'

export interface ClientDetailsDialogProps {
  client: ClientBalance | null
  onClose: () => void
  onEdit: (client: Client) => void
  onNewSale: (client: Client) => void
}

function ContactItem({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Phone
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="truncate text-sm font-medium text-foreground">{children}</dd>
      </div>
    </div>
  )
}

function Metric({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 truncate text-base font-semibold tabular-nums sm:text-lg', tone ?? 'text-foreground')}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

const RECENT_LIMIT = 5

export function ClientDetailsDialog({ client, ...props }: ClientDetailsDialogProps) {
  if (!client) return null
  return <ClientDetails key={client.id} client={client} {...props} />
}

function ClientDetails({
  client,
  onClose,
  onEdit,
  onNewSale,
}: Omit<ClientDetailsDialogProps, 'client'> & { client: ClientBalance }) {
  const recent = useSales({ ...EMPTY_SALE_FILTERS, clientId: client.id }, 1, RECENT_LIMIT)
  const sales = recent.data?.data ?? []
  const totalSales = recent.data?.total ?? 0
  const userLabel = useUserLabel()

  const balance = Number(client.balance_due)
  const ratio = paidRatio(Number(client.total_paid), Number(client.total_sales))

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={client.name}
      icon={<ClientAvatar name={client.name} seed={client.id} archived={!client.is_active} size="lg" />}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono">{client.code}</span>
          {client.is_active ? <Badge variant="success">Actif</Badge> : <Badge variant="neutral">Archivé</Badge>}
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onEdit(client)}>
            <Pencil className="size-4" />
            Modifier
          </Button>
          <Button onClick={() => onNewSale(client)} disabled={!client.is_active}>
            <ShoppingCart className="size-4" />
            Nouvelle vente
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section aria-label="Situation financière" className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Metric
              label="Ventes"
              value={formatAmount(client.total_sales)}
              hint={`${client.sales_count} vente${client.sales_count > 1 ? 's' : ''}`}
            />
            <Metric label="Encaissé" value={formatAmount(client.total_paid)} tone="text-success" hint={`${Math.round(ratio)} %`} />
            <Metric
              label="Reste dû"
              value={formatAmount(balance)}
              tone={balance > 0 ? 'text-danger' : 'text-foreground'}
              hint={
                client.open_sales_count > 0
                  ? `${client.open_sales_count} vente${client.open_sales_count > 1 ? 's' : ''} ouverte${client.open_sales_count > 1 ? 's' : ''}`
                  : 'Aucune dette'
              }
            />
          </div>
          {Number(client.total_sales) > 0 ? (
            <PaymentProgress paid={Number(client.total_paid)} total={Number(client.total_sales)} />
          ) : null}
        </section>

        <dl className="grid gap-2 sm:grid-cols-2">
          <ContactItem icon={Phone} label="Téléphone">
            {client.phone ? (
              <a href={`tel:${client.phone.replace(/\s+/g, '')}`} className="text-primary hover:underline">
                {client.phone}
              </a>
            ) : (
              '—'
            )}
          </ContactItem>
          <ContactItem icon={Mail} label="E-mail">
            {client.email ? (
              <a href={`mailto:${client.email}`} className="text-primary hover:underline">
                {client.email}
              </a>
            ) : (
              '—'
            )}
          </ContactItem>
          <ContactItem icon={MapPin} label="Adresse">
            {client.address || '—'}
          </ContactItem>
          <ContactItem icon={CalendarPlus} label="Client depuis">
            {formatDay(client.created_at)}
          </ContactItem>
          <ContactItem icon={UserRound} label="Créé par">
            {userLabel(client.created_by)}
          </ContactItem>
        </dl>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">Dernières ventes</h3>
            {totalSales > 0 ? (
              <Link
                to={`/ventes?client=${client.id}`}
                onClick={onClose}
                className="text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Voir les {totalSales} ventes
              </Link>
            ) : null}
          </div>

          {recent.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : sales.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Aucune vente pour ce client pour le moment.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {sales.map((sale) => (
                <li key={sale.id}>
                  <Link
                    to={`/ventes?client=${client.id}`}
                    onClick={onClose}
                    className="flex items-center gap-3 px-3 py-2.5 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-sm text-foreground">{sale.reference}</span>
                      <span className="block truncate text-xs text-muted-foreground">{formatDay(sale.sale_date)}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {formatAmount(sale.total_amount)}
                      </span>
                      <PaymentStatusBadge status={sale.payment_status} />
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  )
}
