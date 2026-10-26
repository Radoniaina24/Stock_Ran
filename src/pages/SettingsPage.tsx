import { useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Boxes,
  Check,
  Circle,
  Copy,
  Database,
  Download,
  Loader2,
  LogOut,
  Palette,
  RadioTower,
  RotateCcw,
  ShieldCheck,
  Store,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { EstablishmentCard } from '../components/settings/EstablishmentCard'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { FormField } from '../components/ui/form-field'
import { Input } from '../components/ui/input'
import { PasswordInput } from '../components/ui/password-input'
import { useToast } from '../components/ui/toast'
import {
  PASSWORD_DEFAULT_VALUES,
  passwordMatchSchema,
  settingsSchema,
  type PasswordFormValues,
  type SettingsFormValues,
} from '../schemas/auth'
import { useAuth } from '../hooks/useAuth'
import { fetchMovementsExport } from '../hooks/useMovements'
import { useUserLabel } from '../hooks/useWorkspaceUsers'
import { DEFAULT_PREFERENCES, usePreferences, type Density } from '../hooks/usePreferences'
import { exportMovementsCsv } from '../lib/csv'
import { passwordChecks, passwordStrength } from '../lib/password'
import { isSupabaseConfigured, supabaseErrorMessage } from '../lib/supabase'
import { cn, formatDate, formatDateRange, getInitials } from '../lib/utils'
import { EMPTY_MOVEMENT_FILTERS } from '../types/database'

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'compte', label: 'Compte', icon: UserRound },
  { id: 'etablissement', label: 'Établissement', icon: Store },
  { id: 'apparence', label: 'Apparence', icon: Palette },
  { id: 'securite', label: 'Sécurité', icon: ShieldCheck },
  { id: 'donnees', label: 'Données', icon: Database },
]

function SettingsSection({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string
  icon: LucideIcon
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-32 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8 md:scroll-mt-20"
    >
      <div className="flex items-start gap-3 lg:block">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary lg:mb-3">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 id={`${id}-title`} className="text-base font-semibold text-foreground">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function CardActions({ children, status }: { children: ReactNode; status?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border bg-muted/40 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="text-xs text-muted-foreground">{status}</div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row [&>*]:w-full sm:[&>*]:w-auto">{children}</div>
    </div>
  )
}

function AccountCard() {
  const toast = useToast()
  const { user, signOut } = useAuth()
  const [pending, setPending] = useState(false)
  const email = user?.email ?? '—'

  const copyId = async () => {
    if (!user) return
    try {
      await navigator.clipboard.writeText(user.id)
      toast.success('Identifiant copié.')
    } catch {
      toast.error('Copie impossible dans ce navigateur.')
    }
  }

  const handleSignOut = async () => {
    setPending(true)
    const error = await signOut()
    setPending(false)
    if (error) toast.error(error)
  }

  const items: { label: string; value: ReactNode }[] = [
    { label: 'Adresse e-mail', value: email },
    { label: 'Dernière connexion', value: formatDate(user?.last_sign_in_at) },
    { label: 'Compte créé le', value: formatDate(user?.created_at) },
    {
      label: 'Identifiant',
      value: (
        <span className="flex items-center gap-1.5">
          <span className="truncate font-mono text-xs text-muted-foreground" title={user?.id}>
            {user?.id ?? '—'}
          </span>
          {user ? (
            <button
              type="button"
              onClick={() => void copyId()}
              aria-label="Copier l’identifiant"
              className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Copy className="size-3.5" />
            </button>
          ) : null}
        </span>
      ),
    },
  ]

  return (
    <Card className="overflow-hidden rounded-xl">
      <div className="flex items-center gap-4 p-5 sm:p-6">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-lg font-semibold text-primary-foreground shadow-sm ring-4 ring-primary-soft">
          {user?.email ? getInitials(user.email) : '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground" title={email}>
            {email}
          </p>
          {user?.created_at ? (
            <p className="text-sm text-muted-foreground">Membre depuis le {formatDateRange(user.created_at)}</p>
          ) : null}
        </div>
        <Badge variant="success" className="hidden shrink-0 sm:inline-flex">
          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          Connecté
        </Badge>
      </div>

      <dl className="grid border-t border-border sm:grid-cols-2">
        {items.map((item, index) => (
          <div
            key={item.label}
            className={cn(
              'min-w-0 border-border px-5 py-3.5 sm:px-6',
              index > 0 && 'border-t',
              index === 1 && 'sm:border-t-0 sm:border-s',
              index === 3 && 'sm:border-s',
            )}
          >
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{item.value}</dd>
          </div>
        ))}
      </dl>

      <CardActions status="Vous serez redirigé vers la page de connexion.">
        <Button
          variant="outline"
          onClick={() => void handleSignOut()}
          disabled={pending}
          className="hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
          Se déconnecter
        </Button>
      </CardActions>
    </Card>
  )
}

const DENSITIES: { value: Density; label: string; description: string; rowClass: string }[] = [
  { value: 'comfortable', label: 'Confortable', description: 'Lignes aérées, lecture facilitée.', rowClass: 'h-2.5 my-1.5' },
  { value: 'compact', label: 'Compacte', description: 'Plus de lignes visibles à l’écran.', rowClass: 'h-2 my-0.5' },
]

function AppearanceCard() {
  const toast = useToast()
  const { preferences, updatePreferences } = usePreferences()

  const form = useForm<SettingsFormValues, unknown, SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { appName: preferences.appName, density: preferences.density },
  })

  const [appName, density] = useWatch({ control: form.control, name: ['appName', 'density'] })
  const { isDirty, errors } = form.formState
  const isDefault = appName.trim() === DEFAULT_PREFERENCES.appName && density === DEFAULT_PREFERENCES.density

  const onSubmit = form.handleSubmit((values) => {
    const next = { appName: values.appName.trim(), density: values.density }
    updatePreferences(next)
    form.reset(next)
    toast.success('Préférences enregistrées.')
  })

  return (
    <Card className="overflow-hidden rounded-xl">
      <form onSubmit={(event) => void onSubmit(event)} noValidate>
        <div className="space-y-6 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <FormField
              label="Nom de l’application"
              htmlFor="settings-app-name"
              required
              error={errors.appName?.message}
              hint="Affiché dans la barre latérale et l’onglet du navigateur."
            >
              <Input id="settings-app-name" maxLength={40} className="h-10 rounded-lg" {...form.register('appName')} />
            </FormField>
            <div aria-hidden="true" className="rounded-xl border border-dashed border-border p-3 sm:mb-6">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Aperçu</p>
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
                  <Boxes className="size-4" />
                </span>
                <span className="max-w-44 truncate text-sm font-semibold text-foreground">
                  {appName.trim() || 'Sans nom'}
                </span>
              </div>
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-foreground">Densité des tableaux</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {DENSITIES.map((item) => {
                const selected = density === item.value
                return (
                  <label
                    key={item.value}
                    className={cn(
                      'relative flex cursor-pointer flex-col gap-3 rounded-xl border p-4 transition-all',
                      'has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-primary/40',
                      selected ? 'border-primary bg-primary-soft/50 ring-1 ring-primary' : 'border-border hover:bg-muted/50',
                    )}
                  >
                    <input type="radio" value={item.value} className="sr-only" {...form.register('density')} />
                    <div className="rounded-lg border border-border bg-card px-3 py-1.5" aria-hidden="true">
                      {Array.from({ length: 3 }, (_, i) => (
                        <div key={i} className={cn('flex gap-2', item.rowClass)}>
                          <span className="h-full w-1/3 rounded-sm bg-skeleton" />
                          <span className="h-full flex-1 rounded-sm bg-muted" />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-full border',
                          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                        )}
                        aria-hidden="true"
                      >
                        {selected ? <Check className="size-3" /> : null}
                      </span>
                    </div>
                  </label>
                )
              })}
            </div>
          </fieldset>
        </div>

        <CardActions
          status={
            isDirty ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-warning">
                <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
                Modifications non enregistrées
              </span>
            ) : (
              'Préférences enregistrées sur cet appareil.'
            )
          }
        >
          {!isDefault ? (
            <Button
              variant="ghost"
              onClick={() => form.reset({ ...DEFAULT_PREFERENCES }, { keepDefaultValues: true })}
            >
              <RotateCcw className="size-4" />
              Valeurs par défaut
            </Button>
          ) : null}
          {isDirty ? (
            <Button variant="outline" onClick={() => form.reset()}>
              Annuler
            </Button>
          ) : null}
          <Button type="submit" disabled={!isDirty}>
            Enregistrer
          </Button>
        </CardActions>
      </form>
    </Card>
  )
}

const STRENGTH_COLORS = ['bg-muted', 'bg-danger', 'bg-warning', 'bg-primary', 'bg-success'] as const
const STRENGTH_TEXT = ['', 'text-danger', 'text-warning', 'text-primary', 'text-success'] as const

function SecurityCard() {
  const toast = useToast()
  const { updatePassword } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<PasswordFormValues, unknown, PasswordFormValues>({
    resolver: zodResolver(passwordMatchSchema),
    defaultValues: PASSWORD_DEFAULT_VALUES,
  })

  const [password, confirmPassword] = useWatch({ control: form.control, name: ['password', 'confirmPassword'] })
  const strength = passwordStrength(password)
  const checks = passwordChecks(password)
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null)
    const message = await updatePassword(values.password)
    if (message) {
      setServerError(message)
      return
    }
    form.reset()
    toast.success('Mot de passe mis à jour.')
  })

  return (
    <Card className="overflow-hidden rounded-xl">
      <form onSubmit={(event) => void onSubmit(event)} noValidate>
        <div className="space-y-5 p-5 sm:p-6">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Changer le mot de passe</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Choisissez un mot de passe unique que vous n’utilisez pas ailleurs.
            </p>
          </div>

          {serverError ? (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
              {serverError}
            </p>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <FormField label="Nouveau mot de passe" htmlFor="settings-password" required error={errors.password?.message}>
                <PasswordInput
                  id="settings-password"
                  autoComplete="new-password"
                  className="h-10 rounded-lg"
                  {...form.register('password')}
                />
              </FormField>

              <div aria-live="polite">
                <div className="flex gap-1" aria-hidden="true">
                  {[1, 2, 3, 4].map((step) => (
                    <span
                      key={step}
                      className={cn(
                        'h-1.5 flex-1 rounded-full transition-colors duration-300',
                        strength.score >= step ? STRENGTH_COLORS[strength.score] : 'bg-muted',
                      )}
                    />
                  ))}
                </div>
                <p className={cn('mt-1.5 h-4 text-xs font-medium', STRENGTH_TEXT[strength.score])}>
                  {strength.label ? `Robustesse : ${strength.label}` : ''}
                </p>
              </div>
            </div>

            <FormField
              label="Confirmer le mot de passe"
              htmlFor="settings-confirm-password"
              required
              error={errors.confirmPassword?.message}
            >
              <PasswordInput
                id="settings-confirm-password"
                autoComplete="new-password"
                className="h-10 rounded-lg"
                {...form.register('confirmPassword')}
              />
              {confirmPassword && !errors.confirmPassword ? (
                <p
                  className={cn(
                    'flex items-center gap-1 text-xs font-medium',
                    confirmPassword === password ? 'text-success' : 'text-muted-foreground',
                  )}
                >
                  {confirmPassword === password ? (
                    <>
                      <Check className="size-3.5" aria-hidden="true" />
                      Les mots de passe correspondent.
                    </>
                  ) : (
                    'Les mots de passe ne correspondent pas encore.'
                  )}
                </p>
              ) : null}
            </FormField>
          </div>

          <ul className="grid gap-x-4 gap-y-1.5 rounded-lg bg-muted/50 p-3 text-xs sm:grid-cols-2">
            {checks.map((check) => (
              <li
                key={check.id}
                className={cn('flex items-center gap-2', check.met ? 'text-success' : 'text-muted-foreground')}
              >
                {check.met ? (
                  <Check className="size-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <Circle className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                {check.label}
                {check.id === 'length' ? <span className="text-muted-foreground">(obligatoire)</span> : null}
                <span className="sr-only">{check.met ? ' : rempli' : ' : non rempli'}</span>
              </li>
            ))}
          </ul>
        </div>

        <CardActions status="Vous resterez connecté sur cet appareil.">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            Mettre à jour le mot de passe
          </Button>
        </CardActions>
      </form>
    </Card>
  )
}

function DataCard() {
  const toast = useToast()
  const { workspaceId } = useAuth()
  const userLabel = useUserLabel()
  const [exporting, setExporting] = useState(false)
  const host = isSupabaseConfigured ? new URL(import.meta.env.VITE_SUPABASE_URL).host : null

  const handleExport = async () => {
    if (!workspaceId) return
    setExporting(true)
    try {
      const data = await fetchMovementsExport(workspaceId, EMPTY_MOVEMENT_FILTERS)
      if (data.length === 0) {
        toast.info('Aucun mouvement à exporter.')
        return
      }
      exportMovementsCsv(data, userLabel)
      toast.success(`${data.length} mouvement${data.length > 1 ? 's' : ''} exporté${data.length > 1 ? 's' : ''}.`)
    } catch (error) {
      toast.error(supabaseErrorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  return (
    <Card className="overflow-hidden rounded-xl">
      <ul className="divide-y divide-border">
        <li className="flex items-center gap-4 p-5 sm:px-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Database className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Base de données</p>
            <p className="truncate font-mono text-xs text-muted-foreground" title={host ?? undefined}>
              {host ?? 'Supabase non configuré'}
            </p>
          </div>
          <Badge variant={host ? 'success' : 'danger'} className="shrink-0">
            {host ? 'Connectée' : 'Hors ligne'}
          </Badge>
        </li>
        <li className="flex items-center gap-4 p-5 sm:px-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <RadioTower className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Synchronisation en temps réel</p>
            <p className="text-xs text-muted-foreground">
              Les modifications faites sur un autre appareil apparaissent automatiquement.
            </p>
          </div>
          <Badge variant={host ? 'success' : 'neutral'} className="shrink-0">
            {host ? 'Active' : 'Inactive'}
          </Badge>
        </li>
        <li className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Download className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Exporter l’historique</p>
              <p className="text-xs text-muted-foreground">
                Tous les mouvements de stock au format CSV, lisible dans Excel.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => void handleExport()} disabled={exporting} className="w-full sm:w-auto">
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Exporter en CSV
          </Button>
        </li>
      </ul>
    </Card>
  )
}

export function SettingsPage() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Paramètres"
        description="Gérez votre compte, l’apparence de l’application et la sécurité de votre accès."
      />

      <nav
        aria-label="Sections des paramètres"
        className="sticky top-14 z-10 -mx-4 mb-8 flex gap-1 overflow-x-auto border-b border-border bg-background/90 px-4 py-2 backdrop-blur [scrollbar-width:none] md:top-0"
      >
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => scrollTo(section.id)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <section.icon className="size-4" aria-hidden="true" />
            {section.label}
          </button>
        ))}
      </nav>

      <div className="space-y-10 lg:space-y-12">
        <SettingsSection
          id="compte"
          icon={UserRound}
          title="Compte"
          description="Informations sur le compte actuellement connecté."
        >
          <AccountCard />
        </SettingsSection>

        <SettingsSection
          id="etablissement"
          icon={Store}
          title="Établissement"
          description="Nom, coordonnées et fuseau horaire imprimés sur les factures journalières."
        >
          <EstablishmentCard />
        </SettingsSection>

        <SettingsSection
          id="apparence"
          icon={Palette}
          title="Apparence"
          description="Personnalisez le nom de l’application et la densité d’affichage des tableaux."
        >
          <AppearanceCard />
        </SettingsSection>

        <SettingsSection
          id="securite"
          icon={ShieldCheck}
          title="Sécurité"
          description="Protégez l’accès à votre stock avec un mot de passe robuste."
        >
          <SecurityCard />
        </SettingsSection>

        <SettingsSection
          id="donnees"
          icon={Database}
          title="Données"
          description="Connexion à la base, synchronisation et export de vos données."
        >
          <DataCard />
        </SettingsSection>
      </div>
    </div>
  )
}
