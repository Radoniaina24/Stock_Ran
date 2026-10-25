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
  sale_price: number
  is_active: boolean
  stock_status: StockStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProductListItem extends Product {
  /** Somme des entrées de stock, hors retours et annulations de vente. */
  entered_quantity: number
}

export type NewProduct = Omit<Product, 'id' | 'user_id' | 'quantity' | 'created_by' | 'created_at' | 'updated_at'> &
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

// -----------------------------------------------------------------------
// Clients, ventes et paiements
// -----------------------------------------------------------------------

export type PaymentMethod = 'cash' | 'mobile_money' | 'bank_transfer' | 'check' | 'other'

export type SalePaymentStatus = 'unpaid' | 'partial' | 'paid' | 'cancelled'

export type SaleStatus = 'validated' | 'cancelled'

export type PaymentStatus = 'pending' | 'validated' | 'cancelled'

export interface Client {
  id: string
  user_id: string
  code: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Vue `client_balances` : client avec ses totaux de vente et de créance. */
export interface ClientBalance extends Client {
  total_sales: number
  total_paid: number
  balance_due: number
  sales_count: number
  open_sales_count: number
}

export interface Sale {
  id: string
  user_id: string
  reference: string
  client_id: string
  sale_date: string
  subtotal: number
  discount_amount: number
  total_amount: number
  payment_status: SalePaymentStatus
  status: SaleStatus
  comment: string | null
  cancelled_at: string | null
  cancel_comment: string | null
  created_by: string | null
  cancelled_by: string | null
  created_at: string
  updated_at: string
}

/** Vue `sale_balances` : vente avec encaissé, solde restant dû et client. */
export interface SaleBalance extends Sale {
  client_name: string | null
  client_code: string | null
  paid_amount: number
  balance_due: number
  payments_count: number
  last_payment_at: string | null
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  product_reference_snapshot: string
  product_name_snapshot: string
  quantity: number
  unit_price: number
  line_total: number
}

export interface Payment {
  id: string
  user_id: string
  reference: string
  sale_id: string
  client_id: string
  amount: number
  payment_method: PaymentMethod
  transaction_reference: string | null
  status: PaymentStatus
  paid_at: string
  comment: string | null
  cancelled_at: string | null
  cancel_comment: string | null
  created_by: string | null
  cancelled_by: string | null
  created_at: string
}

/** Ligne de paiement enrichie du nom du client et de la référence de vente. */
export interface PaymentRow extends Payment {
  client_name: string | null
  sale_reference: string
  sale_status: SaleStatus
}

/** Réponse JSON de la fonction `sales_overview()` (tableau de bord). */
export interface SalesOverview {
  total_sales: number
  total_paid: number
  total_receivables: number
  unpaid_count: number
  partial_count: number
  paid_count: number
  sales_count: number
  receivables_count: number
  latest_sales: {
    id: string
    reference: string
    client_name: string | null
    sale_date: string
    total_amount: number
    paid_amount: number
    balance_due: number
    payment_status: SalePaymentStatus
    created_at: string
  }[]
  latest_payments: {
    id: string
    reference: string
    amount: number
    payment_method: PaymentMethod
    paid_at: string
    client_name: string | null
    sale_reference: string
  }[]
  top_products: {
    name: string
    reference: string
    quantity: number
    amount: number
  }[]
}

export interface ClientFilters {
  search: string
  status: 'all' | 'active' | 'archived'
  balance: 'all' | 'with_balance' | 'settled'
  sort: ClientSortKey
  order: 'asc' | 'desc'
  page: number
  pageSize: number
}

export type ClientSortKey = 'code' | 'name' | 'balance_due' | 'total_sales' | 'created_at'

export interface SaleFilters {
  search: string
  status: 'all' | SaleStatus
  paymentStatus: 'all' | Exclude<SalePaymentStatus, 'cancelled'>
  clientId: string
  from: string
  to: string
}

export interface PaymentFilters {
  search: string
  method: 'all' | PaymentMethod
  clientId: string
  from: string
  to: string
}

export const EMPTY_CLIENT_FILTERS: ClientFilters = {
  search: '',
  status: 'all',
  balance: 'all',
  sort: 'created_at',
  order: 'desc',
  page: 1,
  pageSize: 10,
}

export const EMPTY_SALE_FILTERS: SaleFilters = {
  search: '',
  status: 'all',
  paymentStatus: 'all',
  clientId: '',
  from: '',
  to: '',
}

export const EMPTY_PAYMENT_FILTERS: PaymentFilters = {
  search: '',
  method: 'all',
  clientId: '',
  from: '',
  to: '',
}

export const PAYMENT_METHODS = [
  'cash',
  'mobile_money',
  'bank_transfer',
  'check',
  'other',
] as const

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile Money',
  bank_transfer: 'Virement bancaire',
  check: 'Chèque',
  other: 'Autre',
}

export const PAYMENT_STATUS_LABELS: Record<SalePaymentStatus, string> = {
  unpaid: 'Non payée',
  partial: 'Partiellement payée',
  paid: 'Payée',
  cancelled: 'Annulée',
}

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  validated: 'Validée',
  cancelled: 'Annulée',
}

export const PAYMENT_RECORD_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'En attente',
  validated: 'Encaissé',
  cancelled: 'Annulé',
}
