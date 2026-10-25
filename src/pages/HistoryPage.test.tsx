import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { MovementFilters, StockMovement } from '../types/database'
import { HistoryPage } from './HistoryPage'

const MOVEMENT: StockMovement = {
  id: 'm1',
  user_id: 'u1',
  product_id: 'p1',
  type: 'exit',
  quantity: 3,
  quantity_before: 10,
  quantity_after: 7,
  reason: 'perte',
  comment: 'Carton abîmé',
  product_reference: 'RIZ-01',
  product_name: 'Riz basmati',
  created_at: new Date().toISOString(),
  created_by: 'u1',
}

const calls = vi.hoisted(() => ({ filters: [] as MovementFilters[] }))

vi.mock('../hooks/useMovements', () => ({
  useMovements: (filters: MovementFilters) => {
    calls.filters.push(filters)
    return { data: { data: [MOVEMENT], total: 1 }, isLoading: false, isError: false }
  },
  useMovementCounts: () => ({ data: { entry: 5, exit: 2, adjustment: 1 } }),
  fetchMovementsExport: vi.fn(),
}))

vi.mock('../hooks/useProducts', () => ({
  useProductOptions: () => ({ data: [{ id: 'p1', name: 'Riz basmati', reference: 'RIZ-01' }] }),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'gestion@exemple.fr' }, workspaceId: 'u1' }),
}))

vi.mock('../hooks/useDebounce', () => ({ useDebounce: <T,>(value: T) => value }))

vi.mock('../hooks/useWorkspaceUsers', () => ({
  useUserLabel: () => (userId: string | null) => (userId === 'u1' ? 'gestion@exemple.fr' : '—'),
}))

vi.mock('../components/ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

function renderPage(path = '/historique') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HistoryPage />
    </MemoryRouter>,
  )
}

describe('HistoryPage', () => {
  afterEach(() => {
    cleanup()
    calls.filters.length = 0
  })

  it('affiche les compteurs par type et filtre au clic sur un onglet', async () => {
    const user = userEvent.setup()
    renderPage()

    const tabs = screen.getByRole('group', { name: 'Filtrer par type' })
    expect(within(tabs).getByRole('button', { name: /Tous\s*8/ })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(tabs).getByRole('button', { name: /Sorties\s*2/ }))
    expect(calls.filters.at(-1)?.type).toBe('exit')
    expect(screen.getByRole('button', { name: 'Retirer le filtre Sorties' })).toBeInTheDocument()
  })

  it('applique le produit passé dans l’adresse et un raccourci de période', async () => {
    const user = userEvent.setup()
    renderPage('/historique?produit=p1')

    expect(calls.filters.at(-1)?.productId).toBe('p1')
    expect(screen.getByRole('button', { name: 'Retirer le filtre Riz basmati' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '7 jours' }))
    const last = calls.filters.at(-1)!
    expect(last.from).not.toBe('')
    expect(last.to).not.toBe('')
    expect(screen.getByRole('button', { name: 'Retirer le filtre 7 jours' })).toBeInTheDocument()
  })

  it('ouvre le détail d’un mouvement', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Voir le détail du mouvement de Riz basmati/ }))

    const dialog = screen.getByRole('dialog', { name: 'Sortie de stock' })
    expect(within(dialog).getByText('Carton abîmé')).toBeInTheDocument()
    expect(within(dialog).getByText('gestion@exemple.fr')).toBeInTheDocument()
    expect(within(dialog).getByText('−3')).toBeInTheDocument()
  })
})
