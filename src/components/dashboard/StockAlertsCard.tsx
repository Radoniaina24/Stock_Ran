import { Link } from 'react-router-dom'
import { ArrowRight, CircleCheck, PackageX, TriangleAlert } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import type { StockAlert } from '../../lib/dashboard'
import { STOCK_STATUS_LABELS } from '../../lib/stock'
import { cn, formatQuantity } from '../../lib/utils'

const LOW_STOCK_URL = '/produits?stock=faible'

function AlertRow({ alert }: { alert: StockAlert }) {
  const isOut = alert.stock_status === 'out'
  const threshold = Number(alert.low_stock_threshold ?? 0)
  const fill = threshold > 0 ? Math.min(100, (Number(alert.quantity) / threshold) * 100) : 0
  const Icon = isOut ? PackageX : TriangleAlert

  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={cn(
          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg',
          isOut ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground" title={alert.name}>
              {alert.name}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground">{alert.reference}</p>
          </div>
          <div className="shrink-0 text-end">
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {formatQuantity(alert.quantity)}
              <span className="font-normal text-muted-foreground"> / {formatQuantity(threshold)}</span>
            </p>
            <p className="text-xs text-muted-foreground">{alert.unit}</p>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`Niveau de stock de ${alert.name}`}
            aria-valuemin={0}
            aria-valuemax={threshold}
            aria-valuenow={Number(alert.quantity)}
          >
            <div
              className={cn('h-full rounded-full transition-all duration-500', isOut ? 'bg-danger' : 'bg-warning')}
              style={{ width: `${fill}%` }}
            />
          </div>
          <Badge variant={isOut ? 'danger' : 'warning'} className="px-1.5 py-0 text-[10px]">
            {STOCK_STATUS_LABELS[alert.stock_status]}
          </Badge>
        </div>
      </div>
    </li>
  )
}

export function StockAlertsCard({ alerts, total }: { alerts: StockAlert[]; total: number }) {
  const remaining = total - alerts.length

  return (
    <Card className="flex h-full flex-col rounded-xl">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Alertes de stock</CardTitle>
          <CardDescription>Produits à réapprovisionner en priorité.</CardDescription>
        </div>
        {total > 0 ? (
          <Badge variant="warning" className="shrink-0 tabular-nums">
            {total}
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="flex-1">
        {alerts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-success-soft text-success">
              <CircleCheck className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-foreground">Tout est en ordre</p>
            <p className="max-w-56 text-sm text-muted-foreground">
              Aucun produit actif n’est sous son seuil d’alerte.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {alerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </ul>
        )}
      </CardContent>

      {total > 0 ? (
        <CardFooter className="justify-between px-5 py-3">
          <span className="text-xs text-muted-foreground">
            {remaining > 0 ? `+ ${remaining} autre${remaining > 1 ? 's' : ''}` : 'Liste complète'}
          </span>
          <Link
            to={LOW_STOCK_URL}
            className="group inline-flex items-center gap-1 rounded text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Voir tout
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </CardFooter>
      ) : null}
    </Card>
  )
}

export function StockAlertsSkeleton() {
  return (
    <Card className="flex h-full flex-col rounded-xl">
      <CardHeader>
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3.5 w-52 max-w-full" />
      </CardHeader>
      <CardContent className="space-y-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="flex justify-between gap-3">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3.5 w-12" />
              </div>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
