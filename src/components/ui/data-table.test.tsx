import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createColumnHelper, type SortingState } from '@tanstack/react-table'
import { DataTable } from './data-table'
import type { DataTableFeatures } from './data-table-features'

interface Item {
  id: string
  name: string
  quantity: number
}

const ITEMS: Item[] = [
  { id: 'a', name: 'Riz', quantity: 80 },
  { id: 'b', name: 'Huile', quantity: 90 },
]

const column = createColumnHelper<DataTableFeatures, Item>()
const COLUMNS = column.columns([
  column.accessor('name', { header: 'Nom', meta: { cellClassName: 'font-medium' } }),
  column.accessor('quantity', { header: 'Quantité', cell: (info) => `${info.getValue()} kg` }),
  column.display({ id: 'actions', header: 'Actions', cell: ({ row }) => `#${row.original.id}` }),
])

function SortableTable({ onSort }: { onSort: (sorting: SortingState) => void }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }])
  return (
    <DataTable
      columns={COLUMNS}
      data={ITEMS}
      getRowId={(item) => item.id}
      sorting={sorting}
      onSortingChange={(updater) => {
        const next = typeof updater === 'function' ? updater(sorting) : updater
        setSorting(next)
        onSort(next)
      }}
    />
  )
}

describe('DataTable', () => {
  afterEach(cleanup)

  it('affiche les en-têtes, les cellules personnalisées et les classes de colonne', () => {
    render(<DataTable columns={COLUMNS} data={ITEMS} getRowId={(item) => item.id} />)

    expect(screen.getByRole('columnheader', { name: 'Nom' })).toBeInTheDocument()
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3)
    const first = within(rows[1]!).getAllByRole('cell')
    expect(first.map((cell) => cell.textContent)).toEqual(['Riz', '80 kg', '#a'])
    expect(first[0]).toHaveClass('font-medium')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('délègue le tri : ascendant au premier clic, puis alterne', async () => {
    const calls: SortingState[] = []
    render(<SortableTable onSort={(sorting) => calls.push(sorting)} />)

    expect(screen.queryByRole('button', { name: /Actions/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Quantité/ }))
    await userEvent.click(screen.getByRole('button', { name: /Quantité/ }))
    await userEvent.click(screen.getByRole('button', { name: /Quantité/ }))
    await userEvent.click(screen.getByRole('button', { name: /Nom/ }))

    expect(calls).toEqual([
      [{ id: 'quantity', desc: false }],
      [{ id: 'quantity', desc: true }],
      [{ id: 'quantity', desc: false }],
      [{ id: 'name', desc: false }],
    ])
    expect(screen.getByRole('columnheader', { name: /Nom/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getAllByRole('cell')[0]).toHaveTextContent('Riz')
  })
})
