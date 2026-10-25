import { useId, useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CircleDollarSign, Loader2, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type Product,
} from '../../types/database'
import {
  SALE_DEFAULT_VALUES,
  computeSubtotal,
  saleSchema,
  type SaleFormPayload,
  type SaleFormValues,
} from '../../schemas/sale'
import { parseNumberInput } from '../../schemas/common'
import { useSaleMutations } from '../../hooks/useSales'
import { useActiveProducts } from '../../hooks/useProducts'
import { useClientOptions } from '../../hooks/useClients'
import { supabaseErrorMessage } from '../../lib/supabase'
import { formatAmount, formatQuantity } from '../../lib/utils'
import { useToast } from '../ui/toast'
import { Modal, ModalIcon } from '../ui/dialog'
import { Button } from '../ui/button'
import { Combobox } from '../ui/combobox'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { Select } from '../ui/select'
import { Textarea } from '../ui/textarea'

export interface SaleFormDialogProps {
  /** Client présélectionné (depuis la page Créances clients). */
  initialClientId?: string
  onClose: () => void
}

function lineTotal(quantity: string | number, unitPrice: string | number): number {
  return Math.round(parseNumberInput(quantity) * parseNumberInput(unitPrice) * 100) / 100
}

const EMPTY_ITEMS: SaleFormValues['items'] = []

export function SaleFormDialog({ initialClientId, onClose }: SaleFormDialogProps) {
  const toast = useToast()
  const formId = useId()
  const commentId = useId()
  const { create } = useSaleMutations()
  const products = useActiveProducts()
  const clientOptions = useClientOptions()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<SaleFormValues, unknown, SaleFormPayload>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      ...SALE_DEFAULT_VALUES,
      clientId: initialClientId ?? '',
      items: [{ productId: '', quantity: '1', unitPrice: '0' }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' })
  const items = useWatch({ control: form.control, name: 'items' }) ?? EMPTY_ITEMS
  const clientId = useWatch({ control: form.control, name: 'clientId' })
  const discountAmount = useWatch({ control: form.control, name: 'discountAmount' })
  const paymentAmount = useWatch({ control: form.control, name: 'paymentAmount' })

  const { errors } = form.formState
  const itemsRootError = (
    errors.items as unknown as { root?: { message?: string } } | undefined
  )?.root?.message

  const productOptions = useMemo(() => {
    const list = products.data ?? []
    return list.map((product: Product) => ({
      value: product.id,
      label: product.name,
      description: `${product.reference} · ${formatQuantity(product.quantity)} ${product.unit} en stock`,
      aside: <span className="tabular-nums">{formatAmount(product.sale_price)}</span>,
    }))
  }, [products])

  const usedProductIds = useMemo(
    () => new Set((items ?? []).map((line) => line.productId).filter(Boolean)),
    [items],
  )

  const subtotal = computeSubtotal(items ?? [])
  const discount = Math.min(parseNumberInput(discountAmount), subtotal)
  const netTotal = Math.round((subtotal - discount) * 100) / 100
  const immediatePayment = Math.min(parseNumberInput(paymentAmount), netTotal)

  const addLine = () => append({ productId: '', quantity: '1', unitPrice: '0' })

  const onProductChange = (index: number, productId: string) => {
    const product = (products.data ?? []).find((item) => item.id === productId)
    form.setValue(`items.${index}.productId`, productId, { shouldDirty: true })
    if (product) {
      form.setValue(`items.${index}.unitPrice`, String(product.sale_price), {
        shouldDirty: true,
      })
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null)
    try {
      await create.mutateAsync({
        clientId: values.clientId,
        saleDate: values.saleDate,
        comment: values.comment,
        discountAmount: values.discountAmount,
        items: values.items.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
        paymentAmount: values.paymentAmount,
        paymentMethod: values.paymentMethod,
        transactionReference: values.transactionReference,
        paymentComment: values.paymentComment,
      })
      toast.success('Vente enregistrée.')
      onClose()
    } catch (error) {
      setServerError(supabaseErrorMessage(error))
    }
  })

  const isPending = create.isPending

  return (
    <Modal
      open
      size="lg"
      onClose={isPending ? () => undefined : onClose}
      title="Nouvelle vente"
      icon={
        <ModalIcon>
          <ShoppingCart className="size-5" />
        </ModalIcon>
      }
      description="Le stock est décrémenté et la vente est enregistrée en une seule opération."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Annuler
          </Button>
          <Button type="submit" form={formId} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Enregistrer la vente
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

        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <FormField label="Client" htmlFor="sale-client" required error={errors.clientId?.message}>
            <Combobox
              id="sale-client"
              options={(clientOptions.data ?? []).map((client) => ({
                value: client.id,
                label: client.name,
                description: client.code,
                aside:
                  client.balance_due > 0 ? (
                    <span className="tabular-nums text-danger">{formatAmount(client.balance_due)}</span>
                  ) : null,
              }))}
              value={clientId}
              onChange={(value) => form.setValue('clientId', value, { shouldDirty: true })}
              placeholder="Rechercher un client…"
              emptyText="Aucun client trouvé"
              invalid={Boolean(errors.clientId)}
            />
          </FormField>

          <FormField label="Date de vente" htmlFor="sale-date" required error={errors.saleDate?.message}>
            <Input
              id="sale-date"
              type="date"
              aria-invalid={Boolean(errors.saleDate)}
              {...form.register('saleDate')}
            />
          </FormField>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">Articles</p>
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="size-3.5" />
              Ajouter un produit
            </Button>
          </div>

          {itemsRootError ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {itemsRootError}
            </p>
          ) : null}

          <div className="space-y-3">
            {fields.map((field, index) => {
              const line = items?.[index]
              const quantity = line?.quantity ?? '1'
              const unitPrice = line?.unitPrice ?? '0'

              return (
                <div
                  key={field.id}
                  className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <FormField
                    label="Produit"
                    htmlFor={`sale-item-${index}`}
                    error={errors.items?.[index]?.productId?.message}
                  >
                    <Combobox
                      id={`sale-item-${index}`}
                      options={productOptions.filter((option) => !usedProductIds.has(option.value) || option.value === line?.productId)}
                      value={line?.productId ?? ''}
                      onChange={(value) => onProductChange(index, value)}
                      placeholder="Rechercher un produit…"
                      emptyText="Tous les produits sont déjà dans la vente"
                      invalid={Boolean(errors.items?.[index]?.productId)}
                    />
                  </FormField>

                  <FormField
                    label="Quantité"
                    htmlFor={`sale-qty-${index}`}
                    error={errors.items?.[index]?.quantity?.message}
                  >
                    <Input
                      id={`sale-qty-${index}`}
                      inputMode="decimal"
                      className="tabular-nums"
                      aria-invalid={Boolean(errors.items?.[index]?.quantity)}
                      {...form.register(`items.${index}.quantity`)}
                    />
                  </FormField>

                  <FormField
                    label="Prix unitaire"
                    htmlFor={`sale-price-${index}`}
                    error={errors.items?.[index]?.unitPrice?.message}
                  >
                    <Input
                      id={`sale-price-${index}`}
                      inputMode="decimal"
                      className="tabular-nums"
                      aria-invalid={Boolean(errors.items?.[index]?.unitPrice)}
                      {...form.register(`items.${index}.unitPrice`)}
                    />
                  </FormField>

                  <div className="flex items-end justify-between gap-2">
                    <div className="pb-2 text-end">
                      <p className="text-xs text-muted-foreground">Total ligne</p>
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {formatAmount(lineTotal(quantity, unitPrice))}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-danger hover:bg-danger-soft hover:text-danger"
                      title="Retirer la ligne"
                      aria-label={`Retirer la ligne ${index + 1}`}
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Montant brut</dt>
              <dd className="tabular-nums text-foreground">{formatAmount(subtotal)}</dd>
            </div>

            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                <label htmlFor="sale-discount">Remise</label>
              </dt>
              <dd className="flex items-center gap-2">
                <Input
                  id="sale-discount"
                  inputMode="decimal"
                  className="h-8 w-32 tabular-nums"
                  aria-invalid={Boolean(errors.discountAmount)}
                  {...form.register('discountAmount')}
                />
                <span className="text-xs text-muted-foreground">Ar</span>
              </dd>
            </div>
            {errors.discountAmount ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {errors.discountAmount.message}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
              <dt className="font-semibold text-foreground">Montant net</dt>
              <dd className="text-base font-semibold tabular-nums text-foreground">
                {formatAmount(netTotal)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4 rounded-xl border border-border p-4">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="size-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">Encaissement initial</p>
            <span className="text-xs text-muted-foreground">(facultatif)</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Montant encaissé"
              htmlFor="sale-payment-amount"
              error={errors.paymentAmount?.message}
            >
              <Input
                id="sale-payment-amount"
                inputMode="decimal"
                className="tabular-nums"
                aria-invalid={Boolean(errors.paymentAmount)}
                {...form.register('paymentAmount')}
              />
            </FormField>

            <FormField
              label="Moyen de paiement"
              htmlFor="sale-payment-method"
              error={errors.paymentMethod?.message}
            >
              <Select
                id="sale-payment-method"
                aria-invalid={Boolean(errors.paymentMethod)}
                {...form.register('paymentMethod')}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField
            label="Référence de transaction"
            htmlFor="sale-payment-reference"
            error={errors.transactionReference?.message}
            hint="Facultatif — numéro de transaction Mobile Money, chèque…"
          >
            <Input
              id="sale-payment-reference"
              maxLength={60}
              autoComplete="off"
              aria-invalid={Boolean(errors.transactionReference)}
              {...form.register('transactionReference')}
            />
          </FormField>

          <p className="text-xs text-muted-foreground tabular-nums">
            Encaissé avec cette vente : <strong>{formatAmount(immediatePayment)}</strong> — reste dû{' '}
            <strong>{formatAmount(netTotal - immediatePayment)}</strong>.
          </p>
        </div>

        <FormField
          label="Commentaire"
          htmlFor={commentId}
          error={errors.comment?.message}
          hint="Facultatif — note interne sur la vente."
        >
          <Textarea
            id={commentId}
            rows={2}
            maxLength={500}
            {...form.register('comment')}
          />
        </FormField>
      </form>
    </Modal>
  )
}
