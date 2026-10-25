import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], selects: [] as string[] }))

vi.mock('../lib/supabase', () => {
  const builder: Record<string, unknown> = {}
  for (const method of ['eq', 'or', 'gt', 'order', 'range', 'limit']) {
    builder[method] = () => builder
  }
  builder.then = (resolve: (value: unknown) => void) =>
    resolve({ data: state.rows, error: null, count: state.rows.length })
  return {
    supabase: {
      from: () => ({
        select: (columns: string) => {
          state.selects.push(columns)
          return builder
        },
      }),
    },
  }
})

const { listClientOptions, listClients } = await import('./clients')
const { EMPTY_CLIENT_FILTERS } = await import('../types/database')

describe('vue client_balances', () => {
  beforeEach(() => {
    state.selects = []
    state.rows = [{ client_id: 'c-1', code: 'CLI-0001', name: 'Épicerie Rasoa', balance_due: 50000 }]
  })

  it('expose client_id comme id dans la liste des clients', async () => {
    const result = await listClients('u-1', EMPTY_CLIENT_FILTERS)
    expect(result.data[0]).toMatchObject({ id: 'c-1', name: 'Épicerie Rasoa' })
    expect(result.data[0]).not.toHaveProperty('client_id')
  })

  it('sélectionne client_id (et non id) pour les listes déroulantes', async () => {
    const options = await listClientOptions('u-1')
    expect(state.selects[0]).toContain('client_id')
    expect(state.selects[0]).not.toMatch(/(^|[\s,])id\b/)
    expect(options).toEqual([{ id: 'c-1', code: 'CLI-0001', name: 'Épicerie Rasoa', balance_due: 50000 }])
  })
})
