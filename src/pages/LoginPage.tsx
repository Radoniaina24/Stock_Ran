import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Boxes, Eye, EyeOff, Loader2, TriangleAlert } from 'lucide-react'
import { LOGIN_DEFAULT_VALUES, loginSchema, type LoginFormValues } from '../schemas/auth'
import { useAuth } from '../hooks/useAuth'
import { usePreferences } from '../hooks/usePreferences'
import { isSupabaseConfigured } from '../lib/supabase'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { FormField } from '../components/ui/form-field'
import { Input } from '../components/ui/input'

export function LoginPage() {
  const { signIn, loading, session } = useAuth()
  const { preferences } = usePreferences()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const form = useForm<LoginFormValues, unknown, LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: LOGIN_DEFAULT_VALUES,
  })

  if (!loading && session) return <Navigate to={from} replace />

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null)
    setSubmitting(true)
    const message = await signIn(values.email, values.password)
    setSubmitting(false)
    if (message) {
      setServerError(message)
      return
    }
    navigate(from, { replace: true })
  })

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Boxes className="size-5" />
          </span>
          <span className="text-lg font-semibold text-foreground">{preferences.appName}</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Connexion</CardTitle>
            <CardDescription>
              Connectez-vous pour accéder à votre espace de gestion.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isSupabaseConfigured ? (
              <div className="mb-4 flex gap-2 rounded-md border border-warning/30 bg-warning-soft p-3 text-sm text-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  Variables <code>VITE_SUPABASE_URL</code> et{' '}
                  <code>VITE_SUPABASE_ANON_KEY</code> absentes. Copiez{' '}
                  <code>.env.example</code> puis relancez le serveur.
                </span>
              </div>
            ) : null}

            {serverError ? (
              <div
                role="alert"
                className="mb-4 flex gap-2 rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            ) : null}

            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <FormField label="Adresse e-mail" htmlFor="email" required error={form.formState.errors.email?.message}>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="vous@exemple.com"
                  {...form.register('email')}
                />
              </FormField>

              <FormField
                label="Mot de passe"
                htmlFor="password"
                required
                error={form.formState.errors.password?.message}
              >
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="pe-9"
                    {...form.register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    className="absolute end-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </FormField>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                Se connecter
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
