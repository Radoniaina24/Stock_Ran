import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { invalidateSalesQueries } from './salesQueries'
import type { Client, ClientBalance, ClientFilters } from '../types/database'
import type { ClientFormPayload } from '../schemas/client'
import {
  createClient,
  deleteClient,
  fetchClientSummary,
  getClient,
  listClientOptions,
  listClients,
  updateClient,
  type ClientOption,
  type ClientSummary,
} from '../services/clients'

export function useClientSummary(): UseQueryResult<ClientSummary> {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  return useQuery({
    queryKey: ['clients', userId, 'summary'],
    enabled: Boolean(userId),
    queryFn: () => fetchClientSummary(userId),
  })
}

export function useClients(filters: ClientFilters): UseQueryResult<{
  data: ClientBalance[]
  total: number
}> {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  return useQuery({
    queryKey: ['clients', userId, filters],
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
    queryFn: () => listClients(userId, filters),
  })
}

export function useClientOptions(): UseQueryResult<ClientOption[]> {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  return useQuery({
    queryKey: ['client-options', userId],
    enabled: Boolean(userId),
    refetchOnMount: 'always',
    queryFn: () => listClientOptions(userId),
  })
}

export function useClient(clientId: string | undefined): UseQueryResult<Client> {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  return useQuery({
    queryKey: ['clients', userId, 'detail', clientId],
    enabled: Boolean(userId && clientId),
    queryFn: () => getClient(userId, clientId!),
  })
}

export function useClientMutations() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const queryClient = useQueryClient()

  const invalidate = () => invalidateSalesQueries(queryClient)

  const create = useMutation({
    mutationFn: (input: ClientFormPayload) => createClient(userId, input),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: ({ clientId, input }: { clientId: string; input: ClientFormPayload }) =>
      updateClient(userId, clientId, input),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (clientId: string) => deleteClient(userId, clientId),
    onSuccess: invalidate,
  })

  return { create, update, remove }
}
