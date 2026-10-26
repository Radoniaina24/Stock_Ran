import { describe, expect, it } from 'vitest'
import {
  buildPageStyle,
  compareTotals,
  formatLongDay,
  groupInvoiceByClient,
  invoiceNumber,
  isValidDay,
  pageLengthMm,
  shiftDay,
  todayInTimeZone,
} from './dailyInvoice'
import { invoiceItem, invoiceSale, sampleInvoice } from '../test/dailyInvoiceFixtures'

describe('numéro et dates de la facture journalière', () => {
  it('produit un numéro stable par date', () => {
    expect(invoiceNumber('2026-10-26')).toBe('FACT-20261026')
    expect(invoiceNumber('2026-10-26')).toBe(invoiceNumber('2026-10-26'))
  })

  it('valide les dates calendaires', () => {
    expect(isValidDay('2026-10-26')).toBe(true)
    expect(isValidDay('2026-02-30')).toBe(false)
    expect(isValidDay('26/10/2026')).toBe(false)
    expect(isValidDay('')).toBe(false)
  })

  it('détermine la journée selon le fuseau de l’établissement', () => {
    // 22 h 30 UTC le 25 = 01 h 30 le 26 à Antananarivo (UTC+3).
    const now = new Date('2026-10-25T22:30:00Z')
    expect(todayInTimeZone('Indian/Antananarivo', now)).toBe('2026-10-26')
    expect(todayInTimeZone('UTC', now)).toBe('2026-10-25')
  })

  it('navigue d’un jour à l’autre sans glissement', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('affiche la date en toutes lettres', () => {
    expect(formatLongDay('2026-10-26')).toBe('lundi 26 octobre 2026')
  })
})

describe('groupInvoiceByClient', () => {
  it('regroupe les ventes d’un même client en conservant les références', () => {
    const groups = groupInvoiceByClient(sampleInvoice().sales)
    expect(groups).toHaveLength(2)

    const rasoa = groups.find((group) => group.clientId === 'c1')!
    expect(rasoa.references).toEqual(['VTE-0001', 'VTE-0003'])
    expect(rasoa.sales).toHaveLength(2)
    expect(rasoa.subtotal).toBe(18500)
    expect(rasoa.discount).toBe(1000)
    expect(rasoa.net).toBe(17500)
    expect(rasoa.paid).toBe(7500)
    expect(rasoa.balance).toBe(10000)
    expect(rasoa.itemsQuantity).toBe(6)
  })

  it('ne fusionne jamais les achats de clients différents', () => {
    const groups = groupInvoiceByClient(sampleInvoice().sales)
    const rice = groups.flatMap((group) =>
      group.sales.flatMap((sale) => sale.items.filter((item) => item.product_id === 'p1').map(() => group.clientId)),
    )
    expect(rice.sort()).toEqual(['c1', 'c2'])
  })

  it('trie les clients par nom et retourne une liste vide sans vente', () => {
    const groups = groupInvoiceByClient(sampleInvoice().sales)
    expect(groups.map((group) => group.clientName)).toEqual(['Épicerie Rasoa', 'Quincaillerie Rakoto'])
    expect(groupInvoiceByClient([])).toEqual([])
  })

  it('additionne les montants au centime près', () => {
    const groups = groupInvoiceByClient([
      invoiceSale({ id: 'a', subtotal: 0.1, total_amount: 0.1, paid_amount: 0, balance_due: 0.1, items: [] }),
      invoiceSale({ id: 'b', subtotal: 0.2, total_amount: 0.2, paid_amount: 0, balance_due: 0.2, items: [] }),
    ])
    expect(groups[0]!.net).toBe(0.3)
  })

  it('cumule les quantités décimales', () => {
    const groups = groupInvoiceByClient([
      invoiceSale({ items: [invoiceItem({ quantity: 2.5 }), invoiceItem({ id: 'i2', quantity: 0.25 })] }),
    ])
    expect(groups[0]!.itemsQuantity).toBe(2.75)
  })
})

describe('compareTotals', () => {
  it('liste uniquement les totaux modifiés depuis la clôture', () => {
    const frozen = sampleInvoice().totals
    const current = { ...frozen, paid_amount: 12500, balance_due: 10000 }
    expect(compareTotals(frozen, current)).toEqual([
      { key: 'paid_amount', label: 'Encaissé', frozen: 7500, current: 12500 },
      { key: 'balance_due', label: 'Reste à payer', frozen: 15000, current: 10000 },
    ])
    expect(compareTotals(frozen, { ...frozen })).toEqual([])
  })
})

describe('mise en page d’impression thermique', () => {
  it('adapte la largeur de page au papier choisi', () => {
    expect(buildPageStyle('58', 120)).toContain('size: 58mm 120mm;')
    expect(buildPageStyle('80', 200)).toContain('size: 80mm 200mm;')
    expect(buildPageStyle('80', 200)).toContain('width: 80mm;')
  })

  it('laisse la longueur au pilote quand l’ajustement est désactivé', () => {
    const style = buildPageStyle('58', null)
    expect(style).not.toContain('size:')
    expect(style).toContain('margin: 0;')
  })

  it('convertit la hauteur mesurée en millimètres avec une marge de coupe', () => {
    expect(pageLengthMm(960)).toBe(Math.ceil(960 * (25.4 / 96)) + 8)
    expect(pageLengthMm(10)).toBe(60)
  })
})
