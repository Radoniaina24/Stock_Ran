import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { getEstablishment, saveEstablishment, type EstablishmentInput } from '../services/establishment'
import type { EstablishmentSettings } from '../types/database'

export function useEstablishment(): UseQueryResult<EstablishmentSettings | null> {
  const { workspaceId } = useAuth()
  const userId = workspaceId ?? ''

  return useQuery({
    queryKey: ['establishment', userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: () => getEstablishment(userId),
  })
}

export function useSaveEstablishment() {
  const { workspaceId } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: EstablishmentInput) => saveEstablishment(workspaceId ?? '', input),
    onSuccess: (data) => {
      queryClient.setQueryData(['establishment', workspaceId ?? ''], data)
      // Le fuseau horaire détermine la journée en cours de la facture.
      void queryClient.invalidateQueries({ queryKey: ['sales', workspaceId ?? '', 'daily-invoice'] })
    },
  })
}
