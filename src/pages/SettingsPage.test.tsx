import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PreferencesProvider } from '../hooks/usePreferences'
import { SettingsPage } from './SettingsPage'

const auth = vi.hoisted(() => ({ updatePassword: vi.fn(), signOut: vi.fn() }))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'jean.dupont@exemple.fr', created_at: '2026-01-15T10:00:00Z' },
    workspaceId: 'u1',
    updatePassword: auth.updatePassword,
    signOut: auth.signOut,
  }),
}))

vi.mock('../hooks/useMovements', () => ({ fetchMovementsExport: vi.fn() }))
vi.mock('../hooks/useWorkspaceUsers', () => ({ useUserLabel: () => () => '—' }))

vi.mock('../components/ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

function renderPage() {
  return render(
    <PreferencesProvider>
      <SettingsPage />
    </PreferencesProvider>,
  )
}

describe('SettingsPage', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('affiche le compte connecté avec ses initiales', () => {
    renderPage()
    expect(screen.getByText('JD')).toBeInTheDocument()
    expect(screen.getAllByText('jean.dupont@exemple.fr').length).toBeGreaterThan(0)
  })

  it('n’active l’enregistrement de l’apparence qu’après une modification', async () => {
    const user = userEvent.setup()
    renderPage()

    const save = screen.getByRole('button', { name: 'Enregistrer' })
    expect(save).toBeDisabled()

    const name = screen.getByLabelText(/Nom de l’application/)
    await user.clear(name)
    await user.type(name, 'Dépôt Nord')
    expect(screen.getByText('Modifications non enregistrées')).toBeInTheDocument()

    await user.click(save)
    expect(document.title).toBe('Dépôt Nord')
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  })

  it('évalue la robustesse du mot de passe et vérifie la confirmation', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/Nouveau mot de passe/), 'Abcdef12!')
    expect(screen.getByText('Robustesse : Fort')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/Confirmer le mot de passe/), 'Abcdef12!')
    expect(screen.getByText('Les mots de passe correspondent.')).toBeInTheDocument()

    auth.updatePassword.mockResolvedValue(null)
    await user.click(screen.getByRole('button', { name: /Mettre à jour le mot de passe/ }))
    expect(auth.updatePassword).toHaveBeenCalledWith('Abcdef12!')
  })
})
