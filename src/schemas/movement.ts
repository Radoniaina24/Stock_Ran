import { z } from 'zod'
import { ADJUSTMENT_REASONS, ENTRY_REASONS, EXIT_REASONS } from '../types/database'
import { numberField, optionalText } from './common'

function reasonField(reasons: readonly string[]) {
  return z.string().superRefine((value, ctx) => {
    if (value === '') {
      ctx.addIssue({ code: 'custom', message: 'Sélectionnez un motif.' })
      return
    }
    if (!reasons.includes(value)) {
      ctx.addIssue({ code: 'custom', message: 'Motif non autorisé.' })
    }
  })
}

const quantitySchema = numberField('La quantité', {
  min: 0,
  strictMin: true,
  max: 1_000_000,
})

export const entrySchema = z.object({
  productId: z.string().min(1, 'Sélectionnez un produit.'),
  quantity: quantitySchema,
  reason: reasonField(ENTRY_REASONS),
  comment: optionalText(500, 'Le commentaire'),
})

export const exitSchema = z.object({
  productId: z.string().min(1, 'Sélectionnez un produit.'),
  quantity: quantitySchema,
  reason: reasonField(EXIT_REASONS),
  comment: optionalText(500, 'Le commentaire'),
})

/** Ajustement : valeur signée, non nulle, bornée. */
const adjustmentQuantity = z
  .string()
  .superRefine((value, ctx) => {
    const raw = value.trim().replace(',', '.')
    if (raw === '') {
      ctx.addIssue({ code: 'custom', message: 'La quantité est obligatoire.' })
      return
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: 'custom', message: 'La quantité doit être un nombre valide.' })
      return
    }
    if (parsed === 0) {
      ctx.addIssue({ code: 'custom', message: 'L’ajustement ne peut pas être nul.' })
      return
    }
    if (Math.abs(parsed) > 1_000_000) {
      ctx.addIssue({
        code: 'custom',
        message: 'La valeur d’ajustement ne doit pas dépasser 1 000 000.',
      })
    }
  })
  .transform((value) => Number(value.trim().replace(',', '.')))

export const adjustmentSchema = z.object({
  productId: z.string().min(1, 'Sélectionnez un produit.'),
  quantity: adjustmentQuantity,
  reason: reasonField(ADJUSTMENT_REASONS),
  comment: optionalText(500, 'Le commentaire'),
})

export type AdjustmentFormValues = z.input<typeof adjustmentSchema>
export type AdjustmentFormPayload = z.output<typeof adjustmentSchema>

export type EntryFormValues = z.input<typeof entrySchema>
export type EntryFormPayload = z.output<typeof entrySchema>
export type ExitFormValues = z.input<typeof exitSchema>
export type ExitFormPayload = z.output<typeof exitSchema>

export const MOVEMENT_DEFAULT_VALUES: EntryFormValues = {
  productId: '',
  quantity: '',
  reason: '',
  comment: '',
}
