import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Pencil, UserPlus } from 'lucide-react'
import type { Client } from '../../types/database'
import { CLIENT_DEFAULT_VALUES, clientSchema, type ClientFormPayload, type ClientFormValues } from '../../schemas/client'
import { useClientMutations } from '../../hooks/useClients'
import { supabaseErrorMessage } from '../../lib/supabase'
import { useToast } from '../ui/toast'
import { Modal, ModalIcon } from '../ui/dialog'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'

const ADDRESS_MAX = 200

export interface ClientFormDialogProps {
  client: Client | null
  onClose: () => void
}

export function ClientFormDialog({ client, onClose }: ClientFormDialogProps) {
  const toast = useToast()
  const formId = useId()
  const { create, update } = useClientMutations()
  const [serverError, setServerError] = useState<string | null>(null)

  const defaultValues: ClientFormValues = client
    ? {
        code: client.code,
        name: client.name,
        phone: client.phone ?? '',
        email: client.email ?? '',
        address: client.address ?? '',
        is_active: client.is_active,
      }
    : CLIENT_DEFAULT_VALUES

  const form = useForm<ClientFormValues, unknown, ClientFormPayload>({
    resolver: zodResolver(clientSchema),
    defaultValues,
  })

  const { errors } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null)
    try {
      if (client) {
        await update.mutateAsync({ clientId: client.id, input: values })
        toast.success('Client mis à jour.')
      } else {
        await create.mutateAsync(values)
        toast.success('Client ajouté.')
      }
      onClose()
    } catch (error) {
      setServerError(supabaseErrorMessage(error))
    }
  })

  const isPending = create.isPending || update.isPending

  return (
    <Modal
      open
      onClose={isPending ? () => undefined : onClose}
      title={client ? 'Modifier le client' : 'Ajouter un client'}
      icon={
        <ModalIcon>
          {client ? <Pencil className="size-5" /> : <UserPlus className="size-5" />}
        </ModalIcon>
      }
      description={
        client
          ? `Mettez à jour les informations de « ${client.name} ».`
          : 'Renseignez les coordonnées du nouveau client.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Annuler
          </Button>
          <Button type="submit" form={formId} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {client ? 'Enregistrer les modifications' : 'Ajouter le client'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-6">
        {serverError ? (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {serverError}
          </p>
        ) : null}

        <FormField
          label="Code client"
          htmlFor="client-code"
          error={errors.code?.message}
          hint="Facultatif — généré automatiquement (CLI-0001) s’il est laissé vide."
        >
          <Input
            id="client-code"
            placeholder="CLI-0001"
            maxLength={40}
            autoComplete="off"
            className="font-mono"
            aria-invalid={Boolean(errors.code)}
            {...form.register('code')}
          />
        </FormField>

        <FormField label="Nom du client" htmlFor="client-name" required error={errors.name?.message}>
          <Input
            id="client-name"
            placeholder="Ex. Épicerie Rakoto"
            maxLength={120}
            autoComplete="off"
            aria-invalid={Boolean(errors.name)}
            {...form.register('name')}
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Téléphone" htmlFor="client-phone" error={errors.phone?.message}>
            <Input
              id="client-phone"
              placeholder="+261 34 00 00 00"
              maxLength={40}
              inputMode="tel"
              autoComplete="off"
              aria-invalid={Boolean(errors.phone)}
              {...form.register('phone')}
            />
          </FormField>

          <FormField label="Adresse e-mail" htmlFor="client-email" error={errors.email?.message}>
            <Input
              id="client-email"
              type="email"
              placeholder="contact@exemple.mg"
              maxLength={160}
              autoComplete="off"
              aria-invalid={Boolean(errors.email)}
              {...form.register('email')}
            />
          </FormField>
        </div>

        <FormField label="Adresse" htmlFor="client-address" error={errors.address?.message}>
          <Textarea
            id="client-address"
            placeholder="Quartier, ville…"
            maxLength={ADDRESS_MAX}
            rows={2}
            {...form.register('address')}
          />
        </FormField>

        <Checkbox
          id="client-active"
          label="Client actif (visible dans les formulaires de vente)"
          {...form.register('is_active')}
        />
      </form>
    </Modal>
  )
}
