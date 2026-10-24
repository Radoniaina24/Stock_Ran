import { describe, expect, it, vi } from 'vitest'
import { exportMovementsCsv, movementsToCsv } from './csv'
import type { StockMovement } from '../types/database'

const movement: StockMovement = {
  id: 'm1',
  user_id: 'u1',
  product_id: 'p1',
  type: 'exit',
  quantity: 3,
  quantity_before: 10,
  quantity_after: 7,
  reason: 'utilisation interne',
  comment: 'Atelier "principal"',
  product_reference: 'PRD-001',
  product_name: 'Coffret outils',
  created_at: '2026-01-15T10:30:00.000Z',
  created_by: 'u1',
}

describe('movementsToCsv', () => {
  it('produit un en-tête en français', () => {
    const csv = movementsToCsv([])
    const header = csv.split('\r\n')[0]
    expect(header).toContain('Date et heure')
    expect(header).toContain('Stock avant')
    expect(header).toContain('Stock après')
    expect(header).toContain('Utilisateur')
  })

  it('traduit le type de mouvement', () => {
    const csv = movementsToCsv([movement])
    expect(csv).toContain('"Sortie"')
  })

  it('échappe les guillemets et sépare les cellules par point-virgule', () => {
    const csv = movementsToCsv([movement])
    const line = csv.split('\r\n')[1]
    expect(line).toContain('"Atelier ""principal"""')
    expect(line).toContain('"Coffret outils"')
    expect(line).toContain('"7"')
  })

  it('génère une ligne par mouvement', () => {
    const csv = movementsToCsv([movement, { ...movement, id: 'm2' }])
    expect(csv.split('\r\n')).toHaveLength(3)
  })
})

describe('exportMovementsCsv', () => {
  it('déclenge le téléchargement du fichier', () => {
    const createdUrls: string[] = []
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: () => {
        const url = `blob:test-${createdUrls.length}`
        createdUrls.push(url)
        return url
      },
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: () => undefined,
    })

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    exportMovementsCsv([movement])

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(createdUrls).toHaveLength(1)

    clickSpy.mockRestore()
  })
})
