import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { invalidateStockQueries } from './stockQueries'
import type { ProductFilters } from '../types/database'
import {
  createProduct,
  deleteProduct,
  listActiveProducts,
  listCategories,
  listProductOptions,
  listProducts,
  setProductActive,
  updateProduct,
  type CreateProductInput,
  type ProductListResult,
} from '../services/products'

export function useProducts(filters: ProductFilters): UseQueryResult<ProductListResult> {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  return useQuery({
    queryKey: ['products', userId, filters],
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
    queryFn: () => listProducts(userId, filters),
  })
}

export function useCategories() {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  return useQuery({
    queryKey: ['product-categories', userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: () => listCategories(userId),
  })
}

export function useActiveProducts() {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  return useQuery({
    queryKey: ['products-active', userId],
    enabled: Boolean(userId),
    staleTime: 30_000,
    queryFn: () => listActiveProducts(userId),
  })
}

export function useProductOptions() {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  return useQuery({
    queryKey: ['product-options', userId],
    enabled: Boolean(userId),
    staleTime: 30_000,
    queryFn: () => listProductOptions(userId),
  })
}

export function useProductMutations() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const queryClient = useQueryClient()

  const invalidate = () => invalidateStockQueries(queryClient)

  const create = useMutation({
    mutationFn: (input: CreateProductInput) => createProduct(userId, input),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: ({ productId, input }: { productId: string; input: CreateProductInput }) =>
      updateProduct(userId, productId, input),
    onSuccess: invalidate,
  })

  const setActive = useMutation({
    mutationFn: ({ productId, isActive }: { productId: string; isActive: boolean }) =>
      setProductActive(userId, productId, isActive),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (productId: string) => deleteProduct(userId, productId),
    onSuccess: invalidate,
  })

  return { create, update, setActive, remove }
}
