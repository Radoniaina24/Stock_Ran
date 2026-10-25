import { z } from 'zod'
import { optionalText } from './common'

const nameField = z
  .string()
  .trim()
  .min(1, 'Le nom du client est obligatoire.')
  .min(2, 'Le nom du client doit contenir au moins 2 caractères.')
  .max(120, 'Le nom du client ne doit pas dépasser 120 caractères.')

const phoneField = z
  .string()
  .trim()
  .max(40, 'Le numéro de téléphone ne doit pas dépasser 40 caractères.')
  .superRefine((value, ctx) => {
    if (value === '') return
    if (!/^[+0-9().\s-]+$/.test(value)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Le numéro de téléphone ne peut contenir que des chiffres, espaces, +, -, ( et ).',
      })
    }
  })
  .transform((value) => (value === '' ? null : value))

const emailField = z
  .string()
  .trim()
  .max(160, 'L’adresse e-mail ne doit pas dépasser 160 caractères.')
  .superRefine((value, ctx) => {
    if (value === '') return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      ctx.addIssue({ code: 'custom', message: 'Adresse e-mail invalide.' })
    }
  })
  .transform((value) => (value === '' ? null : value))

export const clientSchema = z.object({
  code: z
    .string()
    .trim()
    .max(40, 'Le code client ne doit pas dépasser 40 caractères.')
    .transform((value) => (value === '' ? null : value.toUpperCase())),
  name: nameField,
  phone: phoneField,
  email: emailField,
  address: optionalText(200, 'L’adresse'),
  is_active: z.boolean(),
})

export type ClientFormValues = z.input<typeof clientSchema>
export type ClientFormPayload = z.output<typeof clientSchema>

export const CLIENT_DEFAULT_VALUES: ClientFormValues = {
  code: '',
  name: '',
  phone: '',
  email: '',
  address: '',
  is_active: true,
}
