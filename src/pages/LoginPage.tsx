import { useState, type KeyboardEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  Boxes,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { LOGIN_DEFAULT_VALUES, loginSchema, type LoginFormValues } from '../schemas/auth'
import { useAuth } from '../hooks/useAuth'
import { usePreferences } from '../hooks/usePreferences'
import { isSupabaseConfigured } from '../lib/supabase'
import { Button } from '../components/ui/button'
import { FormField } from '../components/ui/form-field'
import { Input } from '../components/ui/input'

const FEATURES = [
  {
    icon: Boxes,
    title: 'Produits centralisés',
    description: 'Références, catégories et niveaux de stock réunis au même endroit.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Mouvements tracés',
    description: 'Chaque entrée, sortie et ajustement est enregistré et vérifiable.',
  },
  {
    icon: BarChart3,
    title: 'Vision en temps réel',
    description: 'Suivez les stocks faibles et l’activité du jour en un coup d’œil.',
  },
] as const

const CURRENT_YEAR = new Date().getFullYear()

export function LoginPage() {
  const { signIn, loading, session } = useAuth()
  const { preferences } = usePreferences()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
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

  const passwordField = form.register('password')

  const syncCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    if (typeof event.getModifierState === 'function') {
      setCapsLock(event.getModifierState('CapsLock'))
    }
  }

  return (
    <div className="flex min-h-svh bg-card">
      {/* Panneau de marque */}
      <aside className="relative hidden w-[46%] overflow-hidden bg-slate-950 lg:flex xl:w-1/2">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.07)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_100%)]"
        />
        <div
          aria-hidden="true"
          className="absolute -top-32 -left-32 size-[28rem] rounded-full bg-primary/25 blur-[120px]"
        />
        <div
          aria-hidden="true"
          className="absolute -right-24 -bottom-40 size-[26rem] rounded-full bg-primary/15 blur-[110px]"
        />

        <div className="relative flex w-full flex-col p-10 xl:p-14">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/15 backdrop-blur">
              <Boxes className="size-5" />
            </span>
            <span className="truncate text-base font-semibold tracking-tight text-white">
              {preferences.appName}
            </span>
          </div>

          <div className="my-auto max-w-md py-12">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
              <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              Plateforme de gestion
            </span>

            <h1 className="mt-6 text-3xl font-semibold leading-[1.15] tracking-tight text-white xl:text-4xl 2xl:text-[2.75rem]">
              Gardez le contrôle de votre stock, sans effort.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-400 xl:text-base">
              Une vue claire et fiable sur vos produits et vos mouvements, pour décider au bon
              moment.
            </p>

            <ul className="mt-10 space-y-5">
              {FEATURES.map((feature) => {
                const Icon = feature.icon
                return (
                  <li key={feature.title} className="flex items-start gap-3.5">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300">
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-white">{feature.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-400">
                        {feature.description}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="size-4 text-emerald-400" aria-hidden="true" />
            <span>Stockage sécurisé par Supabase</span>
          </div>
        </div>
      </aside>

      {/* Formulaire */}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary-soft/80 to-transparent"
        />

        <div className="relative flex items-center gap-2.5 px-6 pt-6 lg:hidden">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Boxes className="size-4" />
          </span>
          <span className="truncate text-sm font-semibold tracking-tight text-foreground">
            {preferences.appName}
          </span>
        </div>

        <div className="relative flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-sm">
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Espace sécurisé
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                Content de vous revoir
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Connectez-vous pour retrouver vos produits, vos mouvements et votre tableau de
                bord.
              </p>
            </div>

            {!isSupabaseConfigured ? (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Configuration requise</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Renseignez <code className="font-mono text-[11px]">VITE_SUPABASE_URL</code> et{' '}
                    <code className="font-mono text-[11px]">VITE_SUPABASE_ANON_KEY</code> dans{' '}
                    <code className="font-mono text-[11px]">.env</code>, puis relancez le serveur.
                  </p>
                </div>
              </div>
            ) : null}

            {serverError ? (
              <div
                role="alert"
                className="mb-5 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-danger">Connexion impossible</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-danger/90">{serverError}</p>
                </div>
              </div>
            ) : null}

            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <FormField
                label="Adresse e-mail"
                htmlFor="email"
                required
                error={form.formState.errors.email?.message}
              >
                <div className="relative">
                  <Mail
                    aria-hidden="true"
                    className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="vous@exemple.com"
                    aria-invalid={Boolean(form.formState.errors.email)}
                    className="h-11 rounded-lg bg-card ps-10 shadow-none"
                    {...form.register('email')}
                  />
                </div>
              </FormField>

              <FormField
                label="Mot de passe"
                htmlFor="password"
                required
                error={form.formState.errors.password?.message}
              >
                <div className="relative">
                  <Lock
                    aria-hidden="true"
                    className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Votre mot de passe"
                    aria-invalid={Boolean(form.formState.errors.password)}
                    className="h-11 rounded-lg bg-card pe-11 ps-10 shadow-none"
                    {...passwordField}
                    onKeyDown={syncCapsLock}
                    onKeyUp={syncCapsLock}
                    onBlur={(event) => {
                      setCapsLock(false)
                      void passwordField.onBlur(event)
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={
                      showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                    }
                    aria-pressed={showPassword}
                    className="absolute end-1.5 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </FormField>

              <p
                aria-live="polite"
                className={
                  capsLock
                    ? 'flex items-center gap-1.5 text-xs font-medium text-warning'
                    : 'sr-only'
                }
              >
                <TriangleAlert className="size-3.5" aria-hidden="true" />
                La touche Verr. Maj. semble activée.
              </p>

              <Button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className="group h-11 w-full rounded-lg text-sm shadow-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Connexion…
                  </>
                ) : (
                  <>
                    Se connecter
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-success" aria-hidden="true" />
              <span>Connexion chiffrée · Accès réservé</span>
            </div>
          </div>
        </div>

        <p className="relative pb-6 text-center text-xs text-muted-foreground">
          © {CURRENT_YEAR} {preferences.appName}
        </p>
      </main>
    </div>
  )
}
