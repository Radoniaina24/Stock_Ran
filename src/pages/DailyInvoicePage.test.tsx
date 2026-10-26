import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { PreferencesProvider } from '../hooks/usePreferences'
import { DailyInvoicePage } from './DailyInvoicePage'
import { emptyInvoice, sampleInvoice } from '../test/dailyInvoiceFixtures'
import type { DailyInvoiceResponse } from '../types/database'

const mocks = vi.hoisted(() => ({
  fetchDailyInvoice: vi.fn(),
  closeDailyInvoice: vi.fn(),
  reopenDailyInvoice: vi.fn(),
  print: vi.fn(),
  printOptions: [] as { pageStyle?: string; documentTitle?: string | (() => string) }[],
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'caisse@exemple.mg' }, workspaceId: 'u1' }),
}))
vi.mock('../hooks/useWorkspaceUsers', () => ({ useUserLabel: () => () => 'caisse@exemple.mg' }))
vi.mock('../hooks/useEstablishment', () => ({
  useEstablishment: () => ({
    data: { user_id: 'u1', name: 'Dépôt Analakely', address: null, phone: null, timezone: 'Indian/Antananarivo' },
  }),
}))
vi.mock('../services/dailyInvoices', () => ({
  fetchDailyInvoice: mocks.fetchDailyInvoice,
  closeDailyInvoice: mocks.closeDailyInvoice,
  reopenDailyInvoice: mocks.reopenDailyInvoice,
}))
// Aucun appel direct à Supabase (RPC d'écriture, insert, update) depuis la page.
vi.mock('../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/supabase')>()),
  supabase: { rpc: mocks.rpc, from: mocks.from },
}))
vi.mock('react-to-print', () => ({
  useReactToPrint: (options: { pageStyle?: string; documentTitle?: string }) => {
    mocks.printOptions.push(options)
    return mocks.print
  },
}))
vi.mock('../components/ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

function response(overrides: Partial<DailyInvoiceResponse> = {}): DailyInvoiceResponse {
  return { ...sampleInvoice(), today: '2026-10-26', can_reopen: true, closing: null, ...overrides }
}

function renderPage(path = '/factures?date=2026-10-26') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <MemoryRouter initialEntries={[path]}>
          <DailyInvoicePage />
        </MemoryRouter>
      </PreferencesProvider>
    </QueryClientProvider>,
  )
}

describe('DailyInvoicePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.printOptions.length = 0
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('affiche l’aperçu de la facture de la date demandée', async () => {
    mocks.fetchDailyInvoice.mockResolvedValue(response())
    renderPage()

    expect(await screen.findByText('FACTURE JOURNALIÈRE RÉCAPITULATIVE')).toBeInTheDocument()
    expect(mocks.fetchDailyInvoice).toHaveBeenCalledWith('2026-10-26')
    expect(screen.getByText('PROVISOIRE — JOURNÉE NON CLÔTURÉE')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Imprimer la facture/ })).toBeEnabled()
  })

  it('recharge les données puis imprime via react-to-print, sans aucune écriture', async () => {
    const user = userEvent.setup()
    mocks.fetchDailyInvoice.mockResolvedValue(response())
    renderPage()

    const printButton = await screen.findByRole('button', { name: /Imprimer la facture/ })
    await user.click(printButton)

    await waitFor(() => expect(mocks.print).toHaveBeenCalledTimes(1))
    expect(mocks.fetchDailyInvoice).toHaveBeenCalledTimes(2)
    expect(mocks.closeDailyInvoice).not.toHaveBeenCalled()
    expect(mocks.reopenDailyInvoice).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()

    const last = mocks.printOptions.at(-1)!
    expect(last.documentTitle).toBe('FACT-20261026')
    expect(last.pageStyle).toContain('margin: 0;')
  })

  it('imprime au format 80 mm une fois le papier changé', async () => {
    const user = userEvent.setup()
    mocks.fetchDailyInvoice.mockResolvedValue(response())
    const { container } = renderPage()

    await screen.findByText('FACTURE JOURNALIÈRE RÉCAPITULATIVE')
    await user.click(screen.getByRole('button', { name: '80 mm' }))

    expect(container.querySelector<HTMLElement>('.di-paper')!.dataset.paper).toBe('80')
    expect(mocks.printOptions.at(-1)!.pageStyle).toContain('width: 80mm;')
    expect(JSON.parse(window.localStorage.getItem('ran-daily-invoice-print')!)).toMatchObject({ paper: '80' })
  })

  it('signale une journée sans vente et désactive l’impression', async () => {
    mocks.fetchDailyInvoice.mockResolvedValue({
      ...emptyInvoice('2026-10-25'),
      today: '2026-10-26',
      can_reopen: true,
      closing: null,
    })
    renderPage('/factures?date=2026-10-25')

    expect(await screen.findByText(/Aucune vente validée le dimanche 25 octobre 2026/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Imprimer la facture/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Clôturer la journée/ })).toBeDisabled()
  })

  it('imprime la version figée d’une journée clôturée et signale les écarts', async () => {
    const frozen = sampleInvoice()
    mocks.fetchDailyInvoice.mockResolvedValue(
      response({
        totals: { ...frozen.totals, paid_amount: 12500, balance_due: 10000 },
        closing: {
          id: 'd1',
          status: 'closed',
          revision: 1,
          closed_at: '2026-10-26T16:00:00Z',
          closed_by: 'u1',
          close_comment: null,
          reopened_at: null,
          reopened_by: null,
          reopen_reason: null,
          snapshot: frozen,
          events: [],
        },
      }),
    )
    renderPage()

    expect(await screen.findByText('JOURNÉE CLÔTURÉE — RÉVISION 1')).toBeInTheDocument()
    expect(screen.getByText('Les données ont évolué depuis la clôture')).toBeInTheDocument()
    expect(screen.getByText('Arrêtée le')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rouvrir la journée/ })).toBeInTheDocument()
  })

  it('explique comment installer la migration si le module est absent', async () => {
    mocks.fetchDailyInvoice.mockRejectedValue({
      code: 'PGRST202',
      message: 'Could not find the function public.daily_invoice(p_date) in the schema cache',
    })
    renderPage()

    expect(await screen.findByText(/exécutez la migration supabase\/migrations\/0010_daily_invoices.sql/)).toBeInTheDocument()
  })
})
