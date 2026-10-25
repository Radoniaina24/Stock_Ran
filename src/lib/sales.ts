import { toDateInputValue } from './utils'
import type {
  PaymentMethod,
  PaymentStatus,
  SaleBalance,
  SalePaymentStatus,
  SaleStatus,
} from '../types/database'

const DAY_MS = 86_400_000

export const TRANSACTION_HINTS: Record<PaymentMethod, string> = {
  cash: 'Facultatif — numéro de reçu.',
  mobile_money: 'Référence MVola, Orange Money ou Airtel Money.',
  bank_transfer: 'Référence du virement bancaire.',
  check: 'Numéro du chèque et banque.',
  other: 'Facultatif — toute référence utile.',
}

/** Nombre de jours calendaires écoulés depuis une date AAAA-MM-JJ (0 = aujourd'hui). */
export function daysSince(date: string, now = new Date()): number {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number)
  const start = Date.UTC(year!, month! - 1, day!)
  const [ty, tm, td] = toDateInputValue(now).split('-').map(Number)
  const today = Date.UTC(ty!, tm! - 1, td!)
  return Math.max(0, Math.round((today - start) / DAY_MS))
}

export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+'

export const AGING_BUCKETS: { value: AgingBucket; label: string }[] = [
  { value: '0-30', label: '0 à 30 jours' },
  { value: '31-60', label: '31 à 60 jours' },
  { value: '61-90', label: '61 à 90 jours' },
  { value: '90+', label: 'Plus de 90 jours' },
]

export function agingBucket(days: number): AgingBucket {
  if (days <= 30) return '0-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

/** Montant restant dû réparti par tranche d'ancienneté. */
export function agingBreakdown(
  sales: Pick<SaleBalance, 'sale_date' | 'balance_due'>[],
  now = new Date(),
): Record<AgingBucket, number> {
  const totals: Record<AgingBucket, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
  for (const sale of sales) {
    totals[agingBucket(daysSince(sale.sale_date, now))] += Number(sale.balance_due ?? 0)
  }
  return totals
}

export interface ClientReceivable {
  clientId: string
  clientName: string
  clientCode: string | null
  balanceDue: number
  paidAmount: number
  totalAmount: number
  salesCount: number
  oldestSaleDate: string
}

/** Regroupe les ventes ouvertes par client, plus gros encours en premier. */
export function groupReceivablesByClient(sales: SaleBalance[]): ClientReceivable[] {
  const byClient = new Map<string, ClientReceivable>()
  for (const sale of sales) {
    const current = byClient.get(sale.client_id)
    if (current) {
      current.balanceDue += Number(sale.balance_due)
      current.paidAmount += Number(sale.paid_amount)
      current.totalAmount += Number(sale.total_amount)
      current.salesCount += 1
      if (sale.sale_date < current.oldestSaleDate) current.oldestSaleDate = sale.sale_date
    } else {
      byClient.set(sale.client_id, {
        clientId: sale.client_id,
        clientName: sale.client_name ?? 'Client supprimé',
        clientCode: sale.client_code,
        balanceDue: Number(sale.balance_due),
        paidAmount: Number(sale.paid_amount),
        totalAmount: Number(sale.total_amount),
        salesCount: 1,
        oldestSaleDate: sale.sale_date,
      })
    }
  }
  return Array.from(byClient.values()).sort((a, b) => b.balanceDue - a.balanceDue)
}

/** Part encaissée d'une vente, entre 0 et 100. */
export function paidRatio(paid: number, total: number): number {
  if (total <= 0) return 100
  return Math.min(100, Math.max(0, (paid / total) * 100))
}

export type SaleTab = 'all' | Exclude<SalePaymentStatus, 'cancelled'> | 'cancelled'

export interface SaleSummary {
  counts: Record<SaleTab, number>
  totalAmount: number
  paidAmount: number
  balanceDue: number
}

/** Compteurs par onglet et montants (ventes annulées exclues des montants). */
export function summarizeSales(
  rows: { status: SaleStatus; payment_status: SalePaymentStatus; total_amount: number; paid_amount: number; balance_due: number }[],
): SaleSummary {
  const summary: SaleSummary = {
    counts: { all: rows.length, unpaid: 0, partial: 0, paid: 0, cancelled: 0 },
    totalAmount: 0,
    paidAmount: 0,
    balanceDue: 0,
  }
  for (const row of rows) {
    if (row.status === 'cancelled') {
      summary.counts.cancelled += 1
      continue
    }
    if (row.payment_status !== 'cancelled') summary.counts[row.payment_status] += 1
    summary.totalAmount += Number(row.total_amount)
    summary.paidAmount += Number(row.paid_amount)
    summary.balanceDue += Number(row.balance_due)
  }
  return summary
}

export interface PaymentSummary {
  counts: Record<'all' | PaymentMethod, number>
  amounts: Record<PaymentMethod, number>
  totalAmount: number
  validatedCount: number
  cancelledCount: number
  cancelledAmount: number
}

/** Seuls les paiements validés comptent dans les montants encaissés. */
export function summarizePayments(
  rows: { amount: number; payment_method: PaymentMethod; status: PaymentStatus }[],
): PaymentSummary {
  const summary: PaymentSummary = {
    counts: { all: rows.length, cash: 0, mobile_money: 0, bank_transfer: 0, check: 0, other: 0 },
    amounts: { cash: 0, mobile_money: 0, bank_transfer: 0, check: 0, other: 0 },
    totalAmount: 0,
    validatedCount: 0,
    cancelledCount: 0,
    cancelledAmount: 0,
  }
  for (const row of rows) {
    summary.counts[row.payment_method] += 1
    if (row.status === 'validated') {
      summary.amounts[row.payment_method] += Number(row.amount)
      summary.totalAmount += Number(row.amount)
      summary.validatedCount += 1
    } else if (row.status === 'cancelled') {
      summary.cancelledCount += 1
      summary.cancelledAmount += Number(row.amount)
    }
  }
  return summary
}
