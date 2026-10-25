import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { listWorkspaceUsers } from '../services/workspace'

export type UserLabel = (userId: string | null | undefined) => string

/** Email du compte ayant effectué une action dans l'espace partagé. */
export function useUserLabel(): UserLabel {
  const { user, workspaceId } = useAuth()
  const users = useQuery({
    queryKey: ['workspace-users', workspaceId ?? ''],
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
    queryFn: listWorkspaceUsers,
  })
  const members = users.data

  return useCallback<UserLabel>(
    (userId) => {
      if (!userId) return '—'
      if (user && userId === user.id) return user.email ?? 'Vous'
      return members?.find((member) => member.id === userId)?.email ?? 'Utilisateur inconnu'
    },
    [members, user],
  )
}
