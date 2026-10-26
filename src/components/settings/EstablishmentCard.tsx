import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Store } from 'lucide-react'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { Select } from '../ui/select'
import { ErrorState } from '../ui/states'
import { Skeleton } from '../ui/skeleton'
import { useToast } from '../ui/toast'
import { useEstablishment, useSaveEstablishment } from '../../hooks/useEstablishment'
import { DEFAULT_TIMEZONE, TIMEZONE_OPTIONS, todayInTimeZone, formatLongDay } from '../../lib/dailyInvoice'
import { supabaseErrorMessage } from '../../lib/supabase'
import {
  establishmentSchema,
  type EstablishmentFormPayload,
  type EstablishmentFormValues,
} from '../../schemas/establishment'
import type { EstablishmentSettings } from '../../types/database'

function toFormValues(settings: EstablishmentSettings | null | undefined): EstablishmentFormValues {
  return {
    name: settings?.name ?? '',
    address: settings?.address ?? '',
    phone: settings?.phone ?? '',
    timezone: settings?.timezone ?? DEFAULT_TIMEZONE,
  }
}

/** En-tête des factures et fuseau horaire, partagés par tous les comptes de l'espace. */
export function EstablishmentCard() {
  const toast = useToast()
  const establishment = useEstablishment()
  const save = useSaveEstablishment()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<EstablishmentFormValues, unknown, EstablishmentFormPayload>({
    resolver: zodResolver(establishmentSchema),
    defaultValues: toFormValues(null),
  })
  const { errors, isDirty } = form.formState

  useEffect(() => {
    if (establishment.isSuccess) form.reset(toFormValues(establishment.data))
  }, [establishment.isSuccess, establishment.data, form])

  const timezone = useWatch({ control: form.control, name: 'timezone' })
  const options = TIMEZONE_OPTIONS.some((option) => option.value === timezone)
    ? TIMEZONE_OPTIONS
    : [...TIMEZONE_OPTIONS, { value: timezone, label: timezone }]

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null)
    try {
      const saved = await save.mutateAsync(values)
      form.reset(toFormValues(saved))
      toast.success('Informations de l’établissement enregistrées.')
    } catch (error) {
      setServerError(supabaseErrorMessage(error))
    }
  })

  if (establishment.isError) {
    return (
      <Card className="rounded-xl">
        <ErrorState
          message={supabaseErrorMessage(establishment.error)}
          onRetry={() => void establishment.refetch()}
        />
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden rounded-xl">
      <form onSubmit={(event) => void onSubmit(event)} noValidate>
        {establishment.isLoading ? (
          <div className="space-y-4 p-5 sm:p-6">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            {serverError ? (
              <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger sm:col-span-2">
                {serverError}
              </p>
            ) : null}
            <FormField
              label="Nom de l’établissement"
              htmlFor="establishment-name"
              error={errors.name?.message}
              hint="Imprimé en tête des factures journalières."
              className="sm:col-span-2"
            >
              <Input id="establishment-name" maxLength={120} className="h-10 rounded-lg" {...form.register('name')} />
            </FormField>
            <FormField label="Adresse" htmlFor="establishment-address" error={errors.address?.message}>
              <Input
                id="establishment-address"
                maxLength={240}
                className="h-10 rounded-lg"
                {...form.register('address')}
              />
            </FormField>
            <FormField label="Téléphone" htmlFor="establishment-phone" error={errors.phone?.message}>
              <Input
                id="establishment-phone"
                type="tel"
                maxLength={60}
                className="h-10 rounded-lg"
                {...form.register('phone')}
              />
            </FormField>
            <FormField
              label="Fuseau horaire"
              htmlFor="establishment-timezone"
              required
              error={errors.timezone?.message}
              hint={`Journée en cours : ${formatLongDay(todayInTimeZone(timezone))}.`}
              className="sm:col-span-2"
            >
              <Select id="establishment-timezone" className="h-10 rounded-lg" {...form.register('timezone')}>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-border bg-muted/40 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Store className="size-3.5" aria-hidden="true" />
            Partagé par tous les comptes de l’espace.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row [&>*]:w-full sm:[&>*]:w-auto">
            {isDirty ? (
              <Button variant="outline" onClick={() => form.reset()}>
                Annuler
              </Button>
            ) : null}
            <Button type="submit" disabled={!isDirty || save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Enregistrer l’établissement
            </Button>
          </div>
        </div>
      </form>
    </Card>
  )
}
