import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { DailyInvoice, type DailyInvoiceProps } from './DailyInvoice'
import { emptyInvoice, sampleInvoice } from '../../test/dailyInvoiceFixtures'

const ESTABLISHMENT = { name: 'Dépôt Analakely', address: 'Lot II A 12, Antananarivo', phone: '+261 34 00 000 00' }

function renderInvoice(props: Partial<DailyInvoiceProps> = {}) {
  return render(
    <DailyInvoice
      data={sampleInvoice()}
      establishment={ESTABLISHMENT}
      timeZone="Indian/Antananarivo"
      paper="58"
      stampLabel="Généré le"
      stampAt="2026-10-26T15:00:00Z"
      statusNote="PROVISOIRE — JOURNÉE NON CLÔTURÉE"
      {...props}
    />,
  )
}

/** Montants au format fr-FR, insensibles au type d'espace insécable. */
function text(node: HTMLElement) {
  return (node.textContent ?? '').replace(/[\u202f\u00a0]/g, ' ')
}

describe('DailyInvoice', () => {
  afterEach(cleanup)

  it('affiche l’en-tête de l’établissement et l’identifiant de la journée', () => {
    const { container } = renderInvoice()
    const content = text(container)
    expect(content).toContain('Dépôt Analakely')
    expect(content).toContain('Lot II A 12, Antananarivo')
    expect(content).toContain('Tél. +261 34 00 000 00')
    expect(content).toContain('FACTURE JOURNALIÈRE RÉCAPITULATIVE')
    expect(content).toContain('FACT-20261026')
    expect(content).toContain('lundi 26 octobre 2026')
    expect(content).toContain('26/10/2026 18:00')
    expect(content).toContain('PROVISOIRE — JOURNÉE NON CLÔTURÉE')
  })

  it('présente un bloc par client avec ses ventes, sous-totaux, remises et reste dû', () => {
    renderInvoice()
    const rasoa = screen.getByRole('region', { name: 'Client Épicerie Rasoa' })
    const content = text(rasoa)
    expect(content).toContain('Ventes : VTE-0001, VTE-0003')
    expect(content).toContain('Sous-total18 500 Ar')
    expect(content).toContain('Remise-1 000 Ar')
    expect(content).toContain('Total net17 500 Ar')
    expect(content).toContain('Payé7 500 Ar')
    expect(content).toContain('Reste à payer10 000 Ar')
    expect(content).toContain('Remise VTE-0001')

    const rakoto = screen.getByRole('region', { name: 'Client Quincaillerie Rakoto' })
    expect(text(rakoto)).toContain('Vente : VTE-0002')
    expect(text(rakoto)).not.toContain('Remise')
  })

  it('conserve les lignes d’un même produit dans les blocs de chaque client', () => {
    renderInvoice()
    expect(within(screen.getByRole('region', { name: 'Client Épicerie Rasoa' })).getByText('Riz blanc Makalioka')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Client Quincaillerie Rakoto' })).getByText('Riz blanc Makalioka')).toBeInTheDocument()
  })

  it('affiche tous les totaux généraux de la journée', () => {
    renderInvoice()
    const totals = text(screen.getByRole('region', { name: 'Totaux de la journée' }))
    expect(totals).toContain('Clients2')
    expect(totals).toContain('Ventes validées3')
    expect(totals).toContain('Articles vendus7')
    expect(totals).toContain('Total brut23 500 Ar')
    expect(totals).toContain('Remises-1 000 Ar')
    expect(totals).toContain('TOTAL NET22 500 Ar')
    expect(totals).toContain('Encaissé7 500 Ar')
    expect(totals).toContain('Reste à payer15 000 Ar')
    expect(totals).toContain('Vente annulée exclue : 1')
    expect(screen.getByText(/Document récapitulatif journalier/)).toBeInTheDocument()
  })

  it('58 mm : nom du produit sur sa propre ligne et trois colonnes de montants', () => {
    const { container } = renderInvoice({ paper: '58' })
    const paper = container.querySelector<HTMLElement>('.di-paper')!
    expect(paper.dataset.paper).toBe('58')
    expect(paper.style.getPropertyValue('--di-paper')).toBe('58mm')
    expect(paper.style.getPropertyValue('--di-printable')).toBe('48mm')

    const table = container.querySelector('.di-table')!
    expect(table.classList.contains('di-table-narrow')).toBe(true)
    expect(table.querySelectorAll('col')).toHaveLength(3)
    const nameRow = within(table as HTMLElement).getByText('Huile Tiko 1 L').closest('tr')!
    expect(nameRow.querySelector('td')!.getAttribute('colspan')).toBe('3')
    const valuesRow = nameRow.nextElementSibling as HTMLElement
    expect(Array.from(valuesRow.querySelectorAll('td')).map((cell) => text(cell))).toEqual(['3', '2 000', '6 000'])
  })

  it('80 mm : une ligne par produit avec quatre colonnes', () => {
    const { container } = renderInvoice({ paper: '80' })
    const paper = container.querySelector<HTMLElement>('.di-paper')!
    expect(paper.style.getPropertyValue('--di-paper')).toBe('80mm')
    expect(paper.style.getPropertyValue('--di-printable')).toBe('72mm')

    const table = container.querySelector('.di-table')!
    expect(table.classList.contains('di-table-narrow')).toBe(false)
    expect(table.querySelectorAll('col')).toHaveLength(4)
    const row = within(table as HTMLElement).getByText('Huile Tiko 1 L').closest('tr')!
    expect(Array.from(row.querySelectorAll('td')).map((cell) => text(cell))).toEqual([
      'Huile Tiko 1 L',
      '3',
      '2 000',
      '6 000',
    ])
  })

  it('indique clairement l’absence de vente', () => {
    const { container } = renderInvoice({ data: emptyInvoice() })
    expect(screen.getByText('Aucune vente validée pour cette date.')).toBeInTheDocument()
    expect(container.querySelectorAll('.di-client')).toHaveLength(0)
    expect(text(screen.getByRole('region', { name: 'Totaux de la journée' }))).toContain('TOTAL NET0 Ar')
  })
})
