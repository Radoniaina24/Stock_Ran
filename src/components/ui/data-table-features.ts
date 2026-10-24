import { rowSortingFeature, tableFeatures } from '@tanstack/react-table'

export interface DataTableColumnMeta {
  headerClassName?: string
  cellClassName?: string
}

export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  columnMeta: {} as DataTableColumnMeta,
})

export type DataTableFeatures = typeof dataTableFeatures
