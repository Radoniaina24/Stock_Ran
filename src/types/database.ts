export type MovementType = 'entry' | 'exit' | 'adjustment'

export interface Product {
  id: string
  user_id: string
  reference: string
  name: string
  description: string | null
  category: string | null
  unit: string
  quantity: number
  low_stock_threshold: number
  is_active: boolean
  stock_status: StockStatus
  created_at: string
  updated_at: string
}

export type NewProduct = Omit<Product, 'id' | 'user_id' | 'quantity' | 'created_at' | 'updated_at'> &
  Partial<Pick<Product, 'quantity'>>

export interface StockMovement {
  id: string
  user_id: string
  product_id: string
  type: MovementType
  quantity: number
  quantity_before: number
  quantity_after: number
  reason: string
  comment: string | null
  product_reference: string
  product_name: string
  created_at: string
  created_by: string | null
}

export type StockStatus = 'out' | 'low' | 'ok'

export interface ProductFilters {
  search: string
  category: string
  status: 'all' | 'active' | 'archived'
  lowStockOnly: boolean
  sort: ProductSortKey
  order: 'asc' | 'desc'
  page: number
  pageSize: number
}

export type ProductSortKey =
  | 'reference'
  | 'name'
  | 'category'
  | 'quantity'
  | 'low_stock_threshold'
  | 'created_at'

export interface MovementFilters {
  search: string
  type: 'all' | MovementType
  productId: string
  reason: string
  from: string
  to: string
}

export interface DashboardStats {
  activeProducts: number
  totalQuantity: number
  lowStockProducts: number
  outOfStockProducts: number
  entriesToday: number
  exitsToday: number
}

export const EMPTY_PRODUCT_FILTERS: ProductFilters = {
  search: '',
  category: '',
  status: 'all',
  lowStockOnly: false,
  sort: 'created_at',
  order: 'desc',
  page: 1,
  pageSize: 10,
}

export const EMPTY_MOVEMENT_FILTERS: MovementFilters = {
  search: '',
  type: 'all',
  productId: '',
  reason: '',
  from: '',
  to: '',
}

export const ENTRY_REASONS = ['réception', 'retour', 'inventaire', 'autre'] as const

export const EXIT_REASONS = [
  'utilisation interne',
  'perte',
  'casse',
  'ajustement autorisé',
  'autre',
] as const

export const ADJUSTMENT_REASONS = [
  'inventaire',
  'ajustement autorisé',
  'perte',
  'retour',
  'autre',
] as const

export const PRODUCT_UNITS = [
  'pièce',
  'kg',
  'g',
  'litre',
  'ml',
  'mètre',
  'boîte',
  'palette',
  'lot',
] as const
