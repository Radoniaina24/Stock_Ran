import { z } from 'zod'
import { PRODUCT_UNITS } from '../types/database'
import { numberField, optionalText } from './common'

export const productSchema = z.object({
  reference: z
    .string()
    .trim()
    .min(1, 'La référence est obligatoire.')
    .min(2, 'La référence doit contenir au moins 2 caractères.')
    .max(40, 'La référence ne doit pas dépasser 40 caractères.'),
  name: z
    .string()
    .trim()
    .min(1, 'Le nom est obligatoire.')
    .min(2, 'Le nom doit contenir au moins 2 caractères.')
    .max(120, 'Le nom ne doit pas dépasser 120 caractères.'),
  description: optionalText(500, 'La description'),
  category: optionalText(60, 'La catégorie'),
  unit: z.enum(PRODUCT_UNITS, { error: 'Sélectionnez une unité de mesure.' }),
  low_stock_threshold: numberField("Le seuil d'alerte", { min: 0 }),
  sale_price: numberField('Le prix de vente', { min: 0, max: 1_000_000_000_000 }),
})

export type ProductFormValues = z.input<typeof productSchema>
export type ProductFormPayload = z.output<typeof productSchema>

export const PRODUCT_DEFAULT_VALUES: ProductFormValues = {
  reference: '',
  name: '',
  description: '',
  category: '',
  unit: 'pièce',
  low_stock_threshold: '0',
  sale_price: '0',
}
