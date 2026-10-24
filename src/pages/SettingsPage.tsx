import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, LogOut, ShieldCheck } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { FormField } from '../components/ui/form-field'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { useToast } from '../components/ui/toast'
import {
  PASSWORD_DEFAULT_VALUES,
  passwordMatchSchema,
  settingsSchema,
  type PasswordFormValues,
  type SettingsFormValues,
} from '../schemas/auth'
import { useAuth } from '../hooks/useAuth'
import { usePreferences } from '../hooks/usePreferences'
import { isSupabaseConfigured } from '../lib/supabase'
import { formatDate } from '../lib/utils'

function DisplaySettingsCard() {
  const toast = useToast()
  const { preferences, updatePreferences } = usePreferences()

  const form = useForm<SettingsFormValues, unknown, SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      appName: preferences.appName,
      density: preferences.density,
    },
  })

  const onSubmit = form.handleSubmit((values) => {
    updatePreferences({ appName: values.appName, density: values.density })
    toast.success('Préférences enregistrées.')
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Affichage</CardTitle>
        <CardDescription>
          Nom de l’application et densité d’affichage des tableaux.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-4">
          <FormField
            label="Nom de l’application"
            htmlFor="settings-app-name"
            required
            error={form.formState.errors.appName?.message}
          >
            <Input id="settings-app-name" maxLength={40} {...form.register('appName')} />
          </FormField>

          <FormField
            label="Densité d’affichage"
            htmlFor="settings-density"
            error={form.formState.errors.density?.message}
          >
            <Select id="settings-density" {...form.register('density')}>
              <option value="comfortable">Confortable</option>
              <option value="compact">Compacte</option>
            </Select>
          </FormField>

          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Enregistrer
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function PasswordCard() {
  const toast = useToast()
  const { updatePassword } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<PasswordFormValues, unknown, PasswordFormValues>({
    resolver: zodResolver(passwordMatchSchema),
    defaultValues: PASSWORD_DEFAULT_VALUES,
  })

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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <CardTitle>Mot de passe</CardTitle>
        </div>
        <CardDescription>Modifiez le mot de passe de votre compte.</CardDescription>
      </CardHeader>
      <CardContent>
        {serverError ? (
          <p role="alert" className="mb-4 rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {serverError}
          </p>
        ) : null}

        <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-4">
          <FormField
            label="Nouveau mot de passe"
            htmlFor="settings-password"
            required
            error={form.formState.errors.password?.message}
            hint="6 caractères minimum"
          >
            <Input
              id="settings-password"
              type="password"
              autoComplete="new-password"
              {...form.register('password')}
            />
          </FormField>

          <FormField
            label="Confirmer le mot de passe"
            htmlFor="settings-confirm-password"
            required
            error={form.formState.errors.confirmPassword?.message}
          >
            <Input
              id="settings-confirm-password"
              type="password"
              autoComplete="new-password"
              {...form.register('confirmPassword')}
            />
          </FormField>

          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Mettre à jour
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function AccountCard() {
  const { user, signOut } = useAuth()
  const { preferences } = usePreferences()
  const [pending, setPending] = useState(false)

  const host = isSupabaseConfigured
    ? new URL(import.meta.env.VITE_SUPABASE_URL).host
    : 'non configuré'

  const handleSignOut = async () => {
    setPending(true)
    await signOut()
    setPending(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compte</CardTitle>
        <CardDescription>Informations sur le compte connecté.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2.5">
          <div className="flex items-center justify-between gap-4 border-b border-border pb-2.5">
            <dt className="text-sm text-muted-foreground">Adresse e-mail</dt>
            <dd className="truncate text-sm font-medium">{user?.email ?? '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-border pb-2.5">
            <dt className="text-sm text-muted-foreground">Application</dt>
            <dd className="text-sm font-medium">{preferences.appName}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-border pb-2.5">
            <dt className="text-sm text-muted-foreground">Projet Supabase</dt>
            <dd className="truncate text-sm font-medium">{host}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-border pb-2.5">
            <dt className="text-sm text-muted-foreground">Compte créé le</dt>
            <dd className="text-sm font-medium">{formatDate(user?.created_at)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-sm text-muted-foreground">Session</dt>
            <dd className="text-sm font-medium">{user?.id ?? '—'}</dd>
          </div>
        </dl>

        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={() => void handleSignOut()} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
            Se déconnecter
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Préférences d’affichage, sécurité et informations du compte."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <DisplaySettingsCard />
        <div className="space-y-4">
          <PasswordCard />
          <AccountCard />
        </div>
      </div>
    </>
  )
}
