import type { DailyInvoiceData, DailyInvoiceItem, DailyInvoiceSale } from '../types/database'

export function invoiceItem(overrides: Partial<DailyInvoiceItem> = {}): DailyInvoiceItem {
  return {
    id: 'i1',
    product_id: 'p1',
    product_reference: 'RIZ-01',
    product_name: 'Riz blanc Makalioka',
    quantity: 2,
    unit_price: 5000,
    line_total: 10000,
    ...overrides,
  }
}

export function invoiceSale(overrides: Partial<DailyInvoiceSale> = {}): DailyInvoiceSale {
  return {
    id: 's1',
    reference: 'VTE-0001',
    client_id: 'c1',
    client_name: 'Épicerie Rasoa',
    client_code: 'CLI-0001',
    created_at: '2026-10-26T06:15:00Z',
    subtotal: 10000,
    discount_amount: 0,
    total_amount: 10000,
    paid_amount: 10000,
    balance_due: 0,
    payment_status: 'paid',
    items: [invoiceItem()],
    ...overrides,
  }
}

/**
 * Journée type : Rasoa (2 ventes, dont une partielle avec remise),
 * Rakoto (1 vente impayée achetant aussi du riz).
 */
export function sampleInvoice(): DailyInvoiceData {
  const sales = [
    invoiceSale({
      id: 's1',
      reference: 'VTE-0001',
      subtotal: 16000,
      discount_amount: 1000,
      total_amount: 15000,
      paid_amount: 5000,
      balance_due: 10000,
      payment_status: 'partial',
      items: [
        invoiceItem({ id: 'i1' }),
        invoiceItem({
          id: 'i2',
          product_id: 'p2',
          product_name: 'Huile Tiko 1 L',
          quantity: 3,
          unit_price: 2000,
          line_total: 6000,
        }),
      ],
    }),
    invoiceSale({
      id: 's2',
      reference: 'VTE-0002',
      client_id: 'c2',
      client_name: 'Quincaillerie Rakoto',
      client_code: 'CLI-0002',
      created_at: '2026-10-26T07:00:00Z',
      subtotal: 5000,
      total_amount: 5000,
      paid_amount: 0,
      balance_due: 5000,
      payment_status: 'unpaid',
      items: [invoiceItem({ id: 'i3', quantity: 1, line_total: 5000 })],
    }),
    invoiceSale({
      id: 's3',
      reference: 'VTE-0003',
      created_at: '2026-10-26T09:30:00Z',
      subtotal: 2500,
      total_amount: 2500,
      paid_amount: 2500,
      balance_due: 0,
      items: [
        invoiceItem({
          id: 'i4',
          product_id: 'p3',
          product_name: 'Savon de ménage Nosy 400 g',
          quantity: 1,
          unit_price: 2500,
          line_total: 2500,
        }),
      ],
    }),
  ]

  return {
    invoice_date: '2026-10-26',
    invoice_number: 'FACT-20261026',
    generated_at: '2026-10-26T15:00:00Z',
    sales,
    cancelled_sales_count: 1,
    totals: {
      clients_count: 2,
      sales_count: 3,
      items_quantity: 7,
      gross_amount: 23500,
      discount_amount: 1000,
      net_amount: 22500,
      paid_amount: 7500,
      balance_due: 15000,
    },
  }
}

export function emptyInvoice(date = '2026-10-25'): DailyInvoiceData {
  return {
    invoice_date: date,
    invoice_number: `FACT-${date.replaceAll('-', '')}`,
    generated_at: `${date}T15:00:00Z`,
    sales: [],
    cancelled_sales_count: 0,
    totals: {
      clients_count: 0,
      sales_count: 0,
      items_quantity: 0,
      gross_amount: 0,
      discount_amount: 0,
      net_amount: 0,
      paid_amount: 0,
      balance_due: 0,
    },
  }
}
