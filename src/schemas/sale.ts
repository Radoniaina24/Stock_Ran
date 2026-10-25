import { z } from 'zod'
import { PAYMENT_METHODS } from '../types/database'
import { numberField, optionalText, parseNumberInput } from './common'

/** Champ date « AAAA-MM-JJ » (input type="date"). */
function dateField(label: string) {
  return z.string().superRefine((value, ctx) => {
    if (value.trim() === '') {
      ctx.addIssue({ code: 'custom', message: `${label} est obligatoire.` })
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
      ctx.addIssue({ code: 'custom', message: `${label} est invalide.` })
    }
  })
}

export const paymentMethodField = z.enum(PAYMENT_METHODS, {
  error: 'Sélectionnez un moyen de paiement.',
})

const quantityField = numberField('La quantité', { min: 0, strictMin: true, max: 1_000_000 })

const unitPriceField = numberField('Le prix unitaire', { min: 0, max: 1_000_000_000 })

const amountField = numberField('Le montant', { min: 0, max: 1_000_000_000_000 })

/** Ligne du panier : les montants restent des chaînes tant que l’utilisateur tape. */
export const saleLineSchema = z.object({
  productId: z.string().min(1, 'Sélectionnez un produit.'),
  quantity: quantityField,
  unitPrice: unitPriceField,
})

export type SaleLineValues = z.input<typeof saleLineSchema>
export type SaleLinePayload = z.output<typeof saleLineSchema>

/** Total des lignes, arrondi au centime comme le fait PostgreSQL. */
export function computeSubtotal(
  lines: readonly { quantity: string | number; unitPrice: string | number }[],
): number {
  const total = lines.reduce(
    (sum, line) => sum + parseNumberInput(line.quantity) * parseNumberInput(line.unitPrice),
    0,
  )
  return Math.round(total * 100) / 100
}

export const saleSchema = z
  .object({
    clientId: z.string().min(1, 'Sélectionnez un client.'),
    saleDate: dateField('La date de vente'),
    comment: optionalText(500, 'Le commentaire'),
    discountAmount: numberField('La remise', { min: 0, max: 1_000_000_000_000 }),
    paymentAmount: amountField,
    paymentMethod: paymentMethodField,
    transactionReference: optionalText(60, 'La référence de transaction'),
    paymentComment: optionalText(200, 'Le commentaire du paiement'),
    items: z.array(saleLineSchema).min(1, 'Ajoutez au moins un produit à la vente.'),
  })
  .superRefine((values, ctx) => {
    const seen = new Set<string>()
    values.items.forEach((line, index) => {
      if (seen.has(line.productId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Ce produit apparaît plusieurs fois dans la vente.',
          path: ['items', index, 'productId'],
        })
      }
      seen.add(line.productId)
    })

    const subtotal = computeSubtotal(values.items)
    if (values.discountAmount > subtotal) {
      ctx.addIssue({
        code: 'custom',
        message: 'La remise ne peut pas dépasser le montant brut de la vente.',
        path: ['discountAmount'],
      })
    }
    if (values.paymentAmount > subtotal - values.discountAmount) {
      ctx.addIssue({
        code: 'custom',
        message: 'Le montant encaissé dépasse le montant net de la vente.',
        path: ['paymentAmount'],
      })
    }
  })

export type SaleFormValues = z.input<typeof saleSchema>
export type SaleFormPayload = z.output<typeof saleSchema>

const today = new Date()

export const SALE_DEFAULT_VALUES: SaleFormValues = {
  clientId: '',
  saleDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`,
  comment: '',
  discountAmount: '0',
  paymentAmount: '0',
  paymentMethod: 'cash',
  transactionReference: '',
  paymentComment: '',
  items: [],
}

export const paymentSchema = z.object({
  amount: amountField,
  paymentMethod: paymentMethodField,
  transactionReference: optionalText(60, 'La référence de transaction'),
  comment: optionalText(200, 'Le commentaire'),
})

export type PaymentFormValues = z.input<typeof paymentSchema>
export type PaymentFormPayload = z.output<typeof paymentSchema>

export const PAYMENT_DEFAULT_VALUES: PaymentFormValues = {
  amount: '',
  paymentMethod: 'cash',
  transactionReference: '',
  comment: '',
}
