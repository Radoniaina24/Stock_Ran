import { Badge } from '../ui/badge'
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

export function PaymentStatusBadge({ status }: { status: SalePaymentStatus }) {
  return <Badge variant={PAYMENT_VARIANTS[status]}>{PAYMENT_STATUS_LABELS[status]}</Badge>
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

export function PaymentMethodBadge({ method }: { method: PaymentMethod }) {
  return <Badge variant="outline">{PAYMENT_METHOD_LABELS[method]}</Badge>
}
