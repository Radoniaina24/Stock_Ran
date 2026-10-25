import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { fetchDashboard } from '../services/dashboard'

export function useDashboard() {
  const { workspaceId } = useAuth()
  const userId = workspaceId ?? ''

  return useQuery({
    queryKey: ['dashboard', userId],
    enabled: Boolean(userId),
    queryFn: () => fetchDashboard(userId),
  })
}
