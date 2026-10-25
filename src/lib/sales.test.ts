import { describe, expect, it } from 'vitest'
import {
  agingBreakdown,
  agingBucket,
  daysSince,
  groupReceivablesByClient,
  paidRatio,
  summarizePayments,
  summarizeSales,
} from './sales'
import type { SaleBalance } from '../types/database'

const NOW = new Date(2026, 9, 25, 10, 0)

function sale(overrides: Partial<SaleBalance>): SaleBalance {
  return {
    id: 's1',
    user_id: 'u1',
    reference: 'VTE-0001',
    client_id: 'c1',
    sale_date: '2026-10-20',
    subtotal: 0,
    discount_amount: 0,
    total_amount: 0,
    payment_status: 'unpaid',
    status: 'validated',
    comment: null,
    cancelled_at: null,
    cancel_comment: null,
    created_by: 'u1',
    cancelled_by: null,
    created_at: '2026-10-20T08:00:00Z',
    updated_at: '2026-10-20T08:00:00Z',
    client_name: 'Épicerie Rasoa',
    client_code: 'CLI-0001',
    paid_amount: 0,
    balance_due: 0,
    payments_count: 0,
    last_payment_at: null,
    ...overrides,
  }
}

describe('daysSince', () => {
  it('compte les jours calendaires écoulés', () => {
    expect(daysSince('2026-10-25', NOW)).toBe(0)
    expect(daysSince('2026-10-24', NOW)).toBe(1)
    expect(daysSince('2026-09-25', NOW)).toBe(30)
  })

  it('ne renvoie jamais de valeur négative', () => {
    expect(daysSince('2026-11-02', NOW)).toBe(0)
  })
})

describe('agingBucket / agingBreakdown', () => {
  it('classe les jours par tranche', () => {
    expect(agingBucket(0)).toBe('0-30')
    expect(agingBucket(30)).toBe('0-30')
    expect(agingBucket(31)).toBe('31-60')
    expect(agingBucket(90)).toBe('61-90')
    expect(agingBucket(91)).toBe('90+')
  })

  it('répartit les soldes dus', () => {
    const totals = agingBreakdown(
      [
        { sale_date: '2026-10-20', balance_due: 85_000 },
        { sale_date: '2026-08-01', balance_due: 1_000_000 },
        { sale_date: '2026-06-01', balance_due: 20_000 },
      ],
      NOW,
    )
    expect(totals).toEqual({ '0-30': 85_000, '31-60': 0, '61-90': 1_000_000, '90+': 20_000 })
  })
})

describe('groupReceivablesByClient', () => {
  it('cumule les ventes ouvertes par client, plus gros encours en premier', () => {
    const groups = groupReceivablesByClient([
      sale({ id: 'a', client_id: 'c1', balance_due: 85_000, total_amount: 235_000, paid_amount: 150_000 }),
      sale({
        id: 'b',
        client_id: 'c2',
        client_name: 'Quincaillerie Rakoto',
        sale_date: '2026-10-21',
        balance_due: 1_000_000,
        total_amount: 1_500_000,
        paid_amount: 500_000,
      }),
      sale({ id: 'c', client_id: 'c1', sale_date: '2026-10-01', balance_due: 15_000, total_amount: 15_000 }),
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0]!.clientName).toBe('Quincaillerie Rakoto')
    expect(groups[1]).toMatchObject({
      clientId: 'c1',
      balanceDue: 100_000,
      salesCount: 2,
      oldestSaleDate: '2026-10-01',
    })
  })
})

describe('paidRatio', () => {
  it('borne le pourcentage entre 0 et 100', () => {
    expect(paidRatio(0, 1000)).toBe(0)
    expect(paidRatio(500, 1000)).toBe(50)
    expect(paidRatio(2000, 1000)).toBe(100)
    expect(paidRatio(0, 0)).toBe(100)
  })
})

describe('summarizeSales', () => {
  it('compte par onglet et exclut les ventes annulées des montants', () => {
    const summary = summarizeSales([
      { status: 'validated', payment_status: 'paid', total_amount: 198_000, paid_amount: 198_000, balance_due: 0 },
      { status: 'validated', payment_status: 'partial', total_amount: 1_500_000, paid_amount: 500_000, balance_due: 1_000_000 },
      { status: 'validated', payment_status: 'unpaid', total_amount: 12_000, paid_amount: 0, balance_due: 12_000 },
      { status: 'cancelled', payment_status: 'cancelled', total_amount: 13_500, paid_amount: 0, balance_due: 0 },
    ])

    expect(summary.counts).toEqual({ all: 4, unpaid: 1, partial: 1, paid: 1, cancelled: 1 })
    expect(summary.totalAmount).toBe(1_710_000)
    expect(summary.paidAmount).toBe(698_000)
    expect(summary.balanceDue).toBe(1_012_000)
  })
})

describe('summarizePayments', () => {
  it('ne compte que les paiements validés dans les montants', () => {
    const summary = summarizePayments([
      { amount: 100_000, payment_method: 'cash', status: 'validated' },
      { amount: 85_000, payment_method: 'mobile_money', status: 'cancelled' },
      { amount: 198_000, payment_method: 'mobile_money', status: 'validated' },
      { amount: 500_000, payment_method: 'check', status: 'validated' },
    ])

    expect(summary.counts).toMatchObject({ all: 4, cash: 1, mobile_money: 2, check: 1 })
    expect(summary.amounts.mobile_money).toBe(198_000)
    expect(summary.totalAmount).toBe(798_000)
    expect(summary.validatedCount).toBe(3)
    expect(summary.cancelledCount).toBe(1)
    expect(summary.cancelledAmount).toBe(85_000)
  })
})
