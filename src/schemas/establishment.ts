import { z } from 'zod'
import { optionalText } from './common'

export const establishmentSchema = z.object({
  name: z.string().trim().max(120, 'Le nom de l’établissement ne doit pas dépasser 120 caractères.'),
  address: optionalText(240, 'L’adresse'),
  phone: z
    .string()
    .trim()
    .max(60, 'Le téléphone ne doit pas dépasser 60 caractères.')
    .superRefine((value, ctx) => {
      if (value !== '' && !/^[+0-9().\s/-]+$/.test(value)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Le téléphone ne peut contenir que des chiffres, espaces, +, -, /, ( et ).',
        })
      }
    })
    .transform((value) => (value === '' ? null : value)),
  timezone: z.string().trim().min(1, 'Choisissez le fuseau horaire de l’établissement.'),
})

export type EstablishmentFormValues = z.input<typeof establishmentSchema>
export type EstablishmentFormPayload = z.output<typeof establishmentSchema>
