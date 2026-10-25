import { Banknote, HandCoins, ReceiptText, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatCard, StatCardSkeleton } from './StatCard'
import { Card } from '../ui/card'
import { SkeletonGroup } from '../ui/skeleton'
import { ErrorState, EmptyState } from '../ui/states'
import { PaymentStatusBadge } from '../sales/status-badges'
import { supabaseErrorMessage } from '../../lib/supabase'
import { formatAmount, formatDate, formatQuantity } from '../../lib/utils'
import type { SalesOverview } from '../../types/database'

const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 })

function CardShell({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string
  href: string
  linkLabel: string
  children: React.ReactNode
}) {
  return (
    <Card className="overflow-hidden rounded-xl">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Link
          to={href}
          className="text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {linkLabel}
        </Link>
      </div>
      <div className="p-4">{children}</div>
    </Card>
  )
}

export interface CommercialSectionProps {
  overview: SalesOverview | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
  onRetry: () => void
}

export function CommercialSectionSkeleton() {
  return (
    <SkeletonGroup label="Chargement de lâ€™activitÃ© commercialeâ€¦" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>
    </SkeletonGroup>
  )
}

export function CommercialSection({
  overview,
  isLoading,
  isError,
  error,
  onRetry,
}: CommercialSectionProps) {
  if (isLoading) return <CommercialSectionSkeleton />

  if (isError) {
    return (
      <Card className="rounded-xl">
        <ErrorState message={supabaseErrorMessage(error)} onRetry={onRetry} />
      </Card>
    )
  }

  if (!overview) return null

  const pendingCount = overview.unpaid_count + overview.partial_count

  return (
    <div className="animate-fade-in space-y-4">
      <section aria-label="Indicateurs commerciaux" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Ventes"
          value={formatAmount(overview.total_sales)}
          icon={ReceiptText}
          tone="primary"
          to="/ventes"
          footer={`${numberFormat.format(overview.sales_count)} vente${overview.sales_count > 1 ? 's' : ''}`}
        />
        <StatCard
          label="Encaissements"
          value={formatAmount(overview.total_paid)}
          icon={Banknote}
          tone="success"
          to="/paiements"
          footer={`${numberFormat.format(overview.paid_count)} vente${overview.paid_count > 1 ? 's' : ''} rÃ©glÃ©e${overview.paid_count > 1 ? 's' : ''}`}
        />
        <StatCard
          label="CrÃ©ances clients"
          value={formatAmount(overview.total_receivables)}
          icon={HandCoins}
          tone={overview.total_receivables > 0 ? 'danger' : 'success'}
          to="/creances"
          footer={
            overview.receivables_count > 0 ? (
              `${numberFormat.format(overview.receivables_count)} vente${overview.receivables_count > 1 ? 's' : ''} Ã  recouvrer`
            ) : (
              <span className="text-success">Tout est rÃ©glÃ©</span>
            )
          }
        />
        <StatCard
          label="Ventes en attente"
          value={numberFormat.format(pendingCount)}
          icon={TrendingUp}
          tone={pendingCount > 0 ? 'warning' : 'success'}
          to="/ventes?statut=impayee"
          footer={
            pendingCount > 0
              ? `${overview.unpaid_count} non payÃ©e${overview.unpaid_count > 1 ? 's' : ''} Â· ${overview.partial_count} partielle${overview.partial_count > 1 ? 's' : ''}`
              : 'Aucune vente en attente'
          }
        />
      </section>

      <section
        aria-label="DÃ©tail des ventes et paiements"
        className="grid gap-4 lg:grid-cols-2 @3xl:grid-cols-3"
      >
        <CardShell title="DerniÃ¨res ventes" href="/ventes" linkLabel="Toutes les ventes">
          {overview.latest_sales.length === 0 ? (
            <EmptyState
              title="Aucune vente."
              description="Vos derniÃ¨res ventes apparaÃ®tront ici."
              icon={<ReceiptText className="size-5" />}
            />
          ) : (
            <ul className="space-y-2">
              {overview.latest_sales.map((sale) => (
                <li key={sale.id}>
                  <Link
                    to="/ventes"
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {sale.client_name ?? 'Client supprimÃ©'}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        <span className="font-mono">{sale.reference}</span> Â· {formatDate(sale.sale_date)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {formatAmount(sale.total_amount)}
                      </span>
                      <PaymentStatusBadge status={sale.payment_status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardShell>

        <CardShell title="Derniers paiements" href="/paiements" linkLabel="Tous les paiements">
          {overview.latest_payments.length === 0 ? (
            <EmptyState
              title="Aucun paiement."
              description="Les encaissements rÃ©cents apparaÃ®tront ici."
              icon={<Banknote className="size-5" />}
            />
          ) : (
            <ul className="space-y-2">
              {overview.latest_payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {payment.client_name ?? 'Client'}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <span className="font-mono">{payment.sale_reference}</span> Â·{' '}
                      {formatDate(payment.paid_at)}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-success">
                    {formatAmount(payment.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardShell>

        <CardShell title="Produits les plus vendus" href="/ventes" linkLabel="Voir les ventes">
          {overview.top_products.length === 0 ? (
            <EmptyState
              title="Aucun produit vendu."
              description="Le classement apparaÃ®tra dÃ¨s la premiÃ¨re vente."
            />
          ) : (
            <ol className="space-y-2">
              {overview.top_products.map((product, index) => (
                <li
                  key={`${product.reference}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {product.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground tabular-nums">
                        {formatQuantity(product.quantity)} unitÃ©s Â· {formatAmount(product.amount)}
                      </span>
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardShell>
      </section>
    </div>
  )
}

