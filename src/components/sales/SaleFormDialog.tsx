import { useId, useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { CircleDollarSign, Loader2, Plus, ShoppingCart, Trash2, TriangleAlert } from 'lucide-react'
import type { Product } from '../../types/database'
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
import { TRANSACTION_HINTS } from '../../lib/sales'
import { cn, formatAmount, formatQuantity } from '../../lib/utils'
import { useToast } from '../ui/toast'
import { Modal, ModalIcon } from '../ui/dialog'
import { Button } from '../ui/button'
import { Combobox } from '../ui/combobox'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { PaymentMethodPicker } from './PaymentMethodPicker'
import { PaymentStatusBadge } from './status-badges'

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
  const methodName = useId()
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
  const paymentMethod = useWatch({ control: form.control, name: 'paymentMethod' }) ?? 'cash'

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

  const productsById = useMemo(
    () => new Map((products.data ?? []).map((product: Product) => [product.id, product])),
    [products.data],
  )

  const usedProductIds = useMemo(
    () => new Set((items ?? []).map((line) => line.productId).filter(Boolean)),
    [items],
  )

  const subtotal = computeSubtotal(items ?? [])
  const discount = Math.min(parseNumberInput(discountAmount), subtotal)
  const netTotal = Math.round((subtotal - discount) * 100) / 100
  const immediatePayment = Math.min(parseNumberInput(paymentAmount), netTotal)
  const previewStatus =
    netTotal <= 0 || immediatePayment >= netTotal ? 'paid' : immediatePayment > 0 ? 'partial' : 'unpaid'

  const setPaymentAmount = (value: number) =>
    form.setValue('paymentAmount', String(value), { shouldDirty: true, shouldValidate: true })

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
              placeholder={clientOptions.isLoading ? 'Chargement des clients…' : 'Rechercher un client…'}
              emptyText={
                (clientOptions.data ?? []).length === 0
                  ? 'Aucun client actif : ajoutez-en un dans la page Clients.'
                  : 'Aucun client ne correspond à la recherche'
              }
              disabled={clientOptions.isLoading}
              invalid={Boolean(errors.clientId)}
            />
            {clientOptions.isError ? (
              <p role="alert" className="flex flex-wrap items-center gap-2 text-xs font-medium text-danger">
                Impossible de charger la liste des clients.
                <button
                  type="button"
                  onClick={() => void clientOptions.refetch()}
                  className="cursor-pointer underline underline-offset-2"
                >
                  Réessayer
                </button>
              </p>
            ) : !clientOptions.isLoading && (clientOptions.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Aucun client actif.{' '}
                <Link to="/clients" onClick={onClose} className="font-medium text-primary hover:underline">
                  Ajouter un client
                </Link>
              </p>
            ) : null}
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
              const product = line?.productId ? productsById.get(line.productId) : undefined
              const shortage = product ? parseNumberInput(quantity) > Number(product.quantity) : false

              return (
                <div
                  key={field.id}
                  className={cn(
                    'grid gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]',
                    shortage ? 'border-warning/50' : 'border-border',
                  )}
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
                    label={product ? `Quantité (${product.unit})` : 'Quantité'}
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

                  {shortage && product ? (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-warning sm:col-span-full">
                      <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                      Stock insuffisant — disponible : {formatQuantity(product.quantity)} {product.unit}.
                    </p>
                  ) : null}
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="size-4 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">Encaissement</p>
            </div>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant={immediatePayment >= netTotal && netTotal > 0 ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPaymentAmount(netTotal)}
                disabled={netTotal <= 0}
              >
                Payé comptant
              </Button>
              <Button
                type="button"
                variant={immediatePayment <= 0 ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPaymentAmount(0)}
              >
                À crédit
              </Button>
            </div>
          </div>

          <FormField
            label="Montant encaissé maintenant"
            htmlFor="sale-payment-amount"
            error={errors.paymentAmount?.message}
          >
            <div className="relative">
              <Input
                id="sale-payment-amount"
                inputMode="decimal"
                className="pe-10 tabular-nums"
                aria-invalid={Boolean(errors.paymentAmount)}
                {...form.register('paymentAmount')}
              />
              <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted-foreground">
                Ar
              </span>
            </div>
          </FormField>

          {immediatePayment > 0 ? (
            <>
              <FormField label="Moyen de paiement" error={errors.paymentMethod?.message}>
                <PaymentMethodPicker
                  name={methodName}
                  value={paymentMethod}
                  onChange={(value) => form.setValue('paymentMethod', value, { shouldDirty: true })}
                  invalid={Boolean(errors.paymentMethod)}
                />
              </FormField>

              <FormField
                label="Référence de transaction"
                htmlFor="sale-payment-reference"
                error={errors.transactionReference?.message}
                hint={TRANSACTION_HINTS[paymentMethod]}
              >
                <Input
                  id="sale-payment-reference"
                  maxLength={60}
                  autoComplete="off"
                  aria-invalid={Boolean(errors.transactionReference)}
                  {...form.register('transactionReference')}
                />
              </FormField>
            </>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground tabular-nums">
            <span>
              Encaissé : <strong className="text-foreground">{formatAmount(immediatePayment)}</strong> · reste dû{' '}
              <strong className={netTotal - immediatePayment > 0 ? 'text-danger' : 'text-foreground'}>
                {formatAmount(Math.max(0, netTotal - immediatePayment))}
              </strong>
            </span>
            {subtotal > 0 ? <PaymentStatusBadge status={previewStatus} /> : null}
          </div>
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
