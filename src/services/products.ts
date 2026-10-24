import { supabase } from '../lib/supabase'
import type { Product, ProductFilters } from '../types/database'

/** Nettoie une saisie pour éviter de casser la syntaxe de filtre PostgREST. */
export function sanitizeSearch(value: string): string {
  return value.replace(/[%,()"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
}

export interface ProductListResult {
  data: Product[]
  total: number
}

export async function listProducts(
  userId: string,
  filters: ProductFilters,
): Promise<ProductListResult> {
  const search = sanitizeSearch(filters.search)

  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)

  if (search) {
    query = query.or(`reference.ilike.%${search}%,name.ilike.%${search}%`)
  }
  if (filters.category) {
    query = query.eq('category', filters.category)
  }
  if (filters.status === 'active') {
    query = query.eq('is_active', true)
  } else if (filters.status === 'archived') {
    query = query.eq('is_active', false)
  }
  if (filters.lowStockOnly) {
    query = query.in('stock_status', ['low', 'out'])
  }

  const from = (filters.page - 1) * filters.pageSize
  const to = from + filters.pageSize - 1

  const { data, error, count } = await query
    .order(filters.sort, { ascending: filters.order === 'asc' })
    .order('name', { ascending: true })
    .range(from, to)

  if (error) throw error
  return { data: (data ?? []) as Product[], total: count ?? 0 }
}

export async function listCategories(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('products')
    .select('category')
    .eq('user_id', userId)
    .not('category', 'is', null)
    .order('category')

  if (error) throw error
  const values = (data ?? [])
    .map((row) => row.category as string | null)
    .filter((value): value is string => Boolean(value))
  return Array.from(new Set(values))
}

export async function listActiveProducts(userId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return (data ?? []) as Product[]
}

export interface ProductOption {
  id: string
  name: string
  reference: string
}

/** Liste légère (y compris archivés) utilisée dans les filtres et les listes déroulantes. */
export async function listProductOptions(userId: string): Promise<ProductOption[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, reference')
    .eq('user_id', userId)
    .order('name')
    .limit(1000)

  if (error) throw error
  return (data ?? []) as ProductOption[]
}

export async function getProduct(userId: string, productId: string): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Produit introuvable.')
  return data as Product
}

export interface CreateProductInput {
  reference: string
  name: string
  description: string | null
  category: string | null
  unit: string
  low_stock_threshold: number
}

export async function createProduct(userId: string, input: CreateProductInput): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert({ ...input, user_id: userId, quantity: 0 })
    .select('*')
    .single()

  if (error) throw error
  return data as Product
}

export async function updateProduct(
  userId: string,
  productId: string,
  input: CreateProductInput,
): Promise<Product> {
  // La quantité n'est jamais modifiable ici : uniquement via un mouvement.
  const { data, error } = await supabase
    .from('products')
    .update(input)
    .eq('id', productId)
    .eq('user_id', userId)
    .select('*')
    .single()

  if (error) throw error
  return data as Product
}

export async function setProductActive(
  userId: string,
  productId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({ is_active: isActive })
    .eq('id', productId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function deleteProduct(userId: string, productId: string): Promise<void> {
  const { data, error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId)
    .eq('user_id', userId)
    .select('id')

  if (error) throw error
  // La politique RLS masque les produits ayant des mouvements : la suppression
  // ne renvoie alors aucune erreur mais n'affecte aucune ligne.
  if (!data || data.length === 0) {
    throw new Error('Ce produit possède des mouvements de stock et ne peut pas être supprimé.')
  }
}

export function hasMovementsErrorMessage(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return (
    message.includes('stock_movements') ||
    message.includes('violates foreign key') ||
    message.includes('23503')
  )
}
