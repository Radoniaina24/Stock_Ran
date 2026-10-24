import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Product } from '../../types/database'
import { MovementForm } from './MovementForm'

const PRODUCT: Product = {
  id: 'p1',
  user_id: 'u1',
  reference: 'RIZ-01',
  name: 'Riz',
  description: null,
  category: null,
  unit: 'kg',
  quantity: 10,
  low_stock_threshold: 4,
  is_active: true,
  stock_status: 'ok',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
}

const mutations = vi.hoisted(() => ({
  entry: vi.fn(),
  exit: vi.fn(),
  adjustment: vi.fn(),
}))

vi.mock('../../hooks/useProducts', () => ({
  useActiveProducts: () => ({ data: [PRODUCT], isLoading: false, isError: false }),
}))

vi.mock('../../hooks/useMovements', () => ({
  useMovementMutations: () => ({
    addEntry: { mutateAsync: mutations.entry, isPending: false },
    addExit: { mutateAsync: mutations.exit, isPending: false },
    addAdjustment: { mutateAsync: mutations.adjustment, isPending: false },
  }),
}))

vi.mock('../ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

function renderForm() {
  return render(
    <MemoryRouter>
      <MovementForm initialProductId="p1" />
    </MemoryRouter>,
  )
}

describe('MovementForm', () => {
  beforeEach(() => {
    Object.values(mutations).forEach((fn) => fn.mockReset().mockResolvedValue({}))
  })
  afterEach(cleanup)

  it('enregistre une entrée et affiche le stock après mouvement', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText(/Quantité entrante/), '5')
    expect(screen.getByText('15')).toBeInTheDocument()

    await user.click(screen.getByText('Réception'))
    await user.click(screen.getByRole('button', { name: /Enregistrer l’entrée/ }))

    await waitFor(() =>
      expect(mutations.entry).toHaveBeenCalledWith({
        productId: 'p1',
        quantity: 5,
        reason: 'réception',
        comment: null,
      }),
    )
  })

  it('bloque une sortie supérieure au stock disponible', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByText('Sortie'))
    await user.type(screen.getByLabelText(/Quantité sortante/), '12')

    expect(screen.getByText(/Stock insuffisant/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Enregistrer la sortie/ })).toBeDisabled()
  })

  it('envoie un ajustement négatif quand le sens « Diminuer » est choisi', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByText('Ajustement'))
    await user.click(screen.getByText('Diminuer'))
    await user.type(screen.getByLabelText(/Quantité à corriger/), '3')
    await user.click(screen.getByText('Inventaire'))
    await user.click(screen.getByRole('button', { name: /Enregistrer l’ajustement/ }))

    await waitFor(() =>
      expect(mutations.adjustment).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'p1', quantity: -3, reason: 'inventaire' }),
      ),
    )
  })

  it('exige un motif avant l’enregistrement', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText(/Quantité entrante/), '2')
    await user.click(screen.getByRole('button', { name: /Enregistrer l’entrée/ }))
    expect(await screen.findByText('Sélectionnez un motif.')).toBeInTheDocument()
    expect(mutations.entry).not.toHaveBeenCalled()
  })
})
