import {
  useTable,
  type ColumnDef,
  type OnChangeFn,
  type RowData,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table'
import { dataTableFeatures, type DataTableFeatures } from './data-table-features'

const NO_SORTING: SortingState = []

export interface DataTableProps<TData extends RowData> {
  columns: ReadonlyArray<ColumnDef<DataTableFeatures, TData>>
  data: TData[]
  getRowId: (row: TData) => string
  /** Tri contrôlé : effectué côté serveur, la table n'applique aucun tri local. */
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  sorting = NO_SORTING,
  onSortingChange,
}: DataTableProps<TData>) {
  const sortable = Boolean(onSortingChange)

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId,
    manualSorting: true,
    enableSorting: sortable,
    enableMultiSort: false,
    enableSortingRemoval: false,
    sortDescFirst: false,
    state: { sorting },
    onSortingChange,
  })

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const { column } = header
              const content = header.isPlaceholder ? null : <table.FlexRender header={header} />
              const sorted = column.getIsSorted()

              return (
                <TableHead
                  key={header.id}
                  scope="col"
                  className={column.columnDef.meta?.headerClassName}
                  aria-sort={
                    sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                  }
                >
                  {column.getCanSort() ? (
                    <button
                      type="button"
                      onClick={column.getToggleSortingHandler()}
                      className="inline-flex cursor-pointer items-center gap-1 rounded uppercase transition-colors hover:text-foreground"
                    >
                      {content}
                      {sorted === 'asc' ? (
                        <ArrowUp className="size-3" aria-hidden="true" />
                      ) : sorted === 'desc' ? (
                        <ArrowDown className="size-3" aria-hidden="true" />
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    content
                  )}
                </TableHead>
              )
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id} className={cell.column.columnDef.meta?.cellClassName}>
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
