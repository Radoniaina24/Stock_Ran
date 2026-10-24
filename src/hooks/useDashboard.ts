import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { fetchDashboard } from '../services/dashboard'

export function useDashboard() {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  return useQuery({
    queryKey: ['dashboard', userId],
    enabled: Boolean(userId),
    queryFn: () => fetchDashboard(userId),
  })
}
