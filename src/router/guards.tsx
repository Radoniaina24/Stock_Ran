import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Settings2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { LoadingState } from '../components/ui/states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

function FullPageLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <LoadingState label="Vérification de la session…" />
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="max-w-lg">
        <CardHeader>
          <div className="mb-1 flex size-9 items-center justify-center rounded-md bg-warning-soft text-warning">
            <Settings2 className="size-5" />
          </div>
          <CardTitle>Configuration Supabase manquante</CardTitle>
          <CardDescription>
            Renseignez les variables d’environnement puis relancez le serveur de développement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>
              Copiez <code className="rounded bg-muted px-1.5 py-0.5">.env.example</code> en{' '}
              <code className="rounded bg-muted px-1.5 py-0.5">.env</code>
            </li>
            <li>
              Définissez <code className="rounded bg-muted px-1.5 py-0.5">VITE_SUPABASE_URL</code>
            </li>
            <li>
              Définissez{' '}
              <code className="rounded bg-muted px-1.5 py-0.5">VITE_SUPABASE_ANON_KEY</code>
            </li>
            <li>Exécutez les migrations SQL dans l’ordre 0001, 0002, 0003</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

export function ProtectedRoute() {
  const { session, loading, isConfigured } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader />
  if (!isConfigured) return <NotConfigured />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return <Outlet />
}
