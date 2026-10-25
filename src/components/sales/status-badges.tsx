import {
  Banknote,
  CircleDashed,
  FileText,
  Landmark,
  Smartphone,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'
import { daysSince } from '../../lib/sales'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_RECORD_STATUS_LABELS,
  SALE_STATUS_LABELS,
  type PaymentMethod,
  type PaymentStatus,
  type SalePaymentStatus,
  type SaleStatus,
} from '../../types/database'

const PAYMENT_VARIANTS: Record<SalePaymentStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'danger',
  cancelled: 'neutral',
}

const DOT_COLORS: Record<SalePaymentStatus, string> = {
  paid: 'bg-success',
  partial: 'bg-warning',
  unpaid: 'bg-danger',
  cancelled: 'bg-muted-foreground/50',
}

export function PaymentStatusBadge({ status }: { status: SalePaymentStatus }) {
  return (
    <Badge variant={PAYMENT_VARIANTS[status]}>
      <span className={cn('size-1.5 rounded-full', DOT_COLORS[status])} aria-hidden="true" />
      {PAYMENT_STATUS_LABELS[status]}
    </Badge>
  )
}

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return (
    <Badge variant={status === 'cancelled' ? 'neutral' : 'default'}>
      {SALE_STATUS_LABELS[status]}
    </Badge>
  )
}

export function PaymentRecordStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant={status === 'validated' ? 'success' : status === 'pending' ? 'warning' : 'neutral'}>
      {PAYMENT_RECORD_STATUS_LABELS[status]}
    </Badge>
  )
}

const METHOD_STYLES: Record<PaymentMethod, { icon: LucideIcon; soft: string; bar: string }> = {
  cash: { icon: Banknote, soft: 'bg-success-soft text-success', bar: 'bg-success' },
  mobile_money: { icon: Smartphone, soft: 'bg-warning-soft text-warning', bar: 'bg-warning' },
  bank_transfer: { icon: Landmark, soft: 'bg-primary-soft text-primary', bar: 'bg-primary' },
  check: { icon: FileText, soft: 'bg-violet-50 text-violet-600', bar: 'bg-violet-500' },
  other: { icon: CircleDashed, soft: 'bg-muted text-muted-foreground', bar: 'bg-muted-foreground/60' },
}

export function PaymentMethodIcon({ method, className }: { method: PaymentMethod; className?: string }) {
  const style = METHOD_STYLES[method]
  return (
    <span
      className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', style.soft, className)}
      aria-hidden="true"
    >
      <style.icon className="size-4" />
    </span>
  )
}

export function PaymentMethodBadge({ method }: { method: PaymentMethod }) {
  const Icon = METHOD_STYLES[method].icon
  return (
    <Badge variant="outline" className="text-foreground">
      <Icon className="size-3 text-muted-foreground" aria-hidden="true" />
      {PAYMENT_METHOD_LABELS[method]}
    </Badge>
  )
}

/** Barre de répartition colorée par moyen de paiement. */
export function PaymentMethodBar({ method, ratio }: { method: PaymentMethod; ratio: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', METHOD_STYLES[method].bar)}
        style={{ width: `${ratio > 0 ? Math.max(ratio, 2) : 0}%` }}
      />
    </div>
  )
}

/** Part encaissée d'une vente : vert si soldée, orange si partielle. */
export function PaymentProgress({
  paid,
  total,
  cancelled = false,
  className,
}: {
  paid: number
  total: number
  cancelled?: boolean
  className?: string
}) {
  const ratio = total <= 0 ? 100 : Math.min(100, Math.max(0, (paid / total) * 100))
  return (
    <div
      className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio)}
      aria-label="Part encaissée"
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500',
          cancelled ? 'bg-muted-foreground/40' : ratio >= 100 ? 'bg-success' : 'bg-warning',
        )}
        style={{ width: `${ratio > 0 ? Math.max(ratio, 3) : 0}%` }}
      />
    </div>
  )
}

/** Ancienneté d'une créance : neutre jusqu'à 30 j, orange jusqu'à 60 j, rouge au-delà. */
export function AgingBadge({ saleDate }: { saleDate: string }) {
  const days = daysSince(saleDate)
  const variant = days > 60 ? 'danger' : days > 30 ? 'warning' : 'neutral'
  return (
    <Badge variant={variant} className="tabular-nums">
      {days === 0 ? 'Aujourd’hui' : `${days} j`}
    </Badge>
  )
}
