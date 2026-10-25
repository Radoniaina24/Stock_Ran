import { supabase } from '../lib/supabase'

export interface WorkspaceUser {
  id: string
  email: string | null
}

/** Comptes partageant l'espace de travail du compte connecté. */
export async function listWorkspaceUsers(): Promise<WorkspaceUser[]> {
  const { data, error } = await supabase.rpc('workspace_users')
  if (error) throw error
  return (data ?? []) as WorkspaceUser[]
}
