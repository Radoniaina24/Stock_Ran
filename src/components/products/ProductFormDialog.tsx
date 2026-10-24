import { useId, useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Info, Loader2, PackagePlus, Pencil } from 'lucide-react'
import type { Product } from '../../types/database'
import { PRODUCT_UNITS } from '../../types/database'
import { PRODUCT_DEFAULT_VALUES, productSchema, type ProductFormPayload, type ProductFormValues } from '../../schemas/product'
import { useCategories, useProductMutations } from '../../hooks/useProducts'
import { supabaseErrorMessage } from '../../lib/supabase'
import { getProductStatus } from '../../lib/stock'
import { formatQuantity } from '../../lib/utils'
import { useToast } from '../ui/toast'
import { Modal, ModalIcon } from '../ui/dialog'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Select } from '../ui/select'
import { StockBadge } from './StatusBadge'

const DESCRIPTION_MAX = 500

function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <div>
        <legend className="text-sm font-semibold text-foreground">{title}</legend>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </fieldset>
  )
}

export interface ProductFormDialogProps {
  product: Product | null
  onClose: () => void
}

export function ProductFormDialog({ product, onClose }: ProductFormDialogProps) {
  const toast = useToast()
  const formId = useId()
  const categoriesListId = useId()
  const { create, update } = useProductMutations()
  const categories = useCategories()
  const [serverError, setServerError] = useState<string | null>(null)

  const defaultValues: ProductFormValues = product
    ? {
        reference: product.reference,
        name: product.name,
        description: product.description ?? '',
        category: product.category ?? '',
        unit: product.unit as ProductFormValues['unit'],
        low_stock_threshold: String(product.low_stock_threshold),
      }
    : PRODUCT_DEFAULT_VALUES

  const form = useForm<ProductFormValues, unknown, ProductFormPayload>({
    resolver: zodResolver(productSchema),
    defaultValues,
  })

  const { errors } = form.formState
  const unit = useWatch({ control: form.control, name: 'unit' })
  const descriptionLength = (useWatch({ control: form.control, name: 'description' }) ?? '').length

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null)
    try {
      if (product) {
        await update.mutateAsync({ productId: product.id, input: values })
        toast.success('Produit mis à jour.')
      } else {
        await create.mutateAsync(values)
        toast.success('Produit ajouté.')
      }
      onClose()
    } catch (error) {
      const message = supabaseErrorMessage(error)
      if (message.toLowerCase().includes('référence est déjà utilisée')) {
        form.setError('reference', { type: 'server', message }, { shouldFocus: true })
      } else {
        setServerError(message)
      }
    }
  })

  const isPending = create.isPending || update.isPending

  return (
    <Modal
      open
      size="lg"
      onClose={isPending ? () => undefined : onClose}
      title={product ? 'Modifier le produit' : 'Ajouter un produit'}
      icon={
        <ModalIcon>
          {product ? <Pencil className="size-5" /> : <PackagePlus className="size-5" />}
        </ModalIcon>
      }
      description={
        product
          ? `Mettez à jour les informations de « ${product.name} ».`
          : 'Renseignez les informations du nouveau produit.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Annuler
          </Button>
          <Button type="submit" form={formId} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {product ? 'Enregistrer les modifications' : 'Ajouter le produit'}
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

        {product ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 p-4">
            <div>
              <p className="text-xs text-muted-foreground">Stock actuel</p>
              <p className="text-lg font-semibold text-foreground tabular-nums">
                {formatQuantity(product.quantity)}
                <span className="ms-1 text-sm font-normal text-muted-foreground">{product.unit}</span>
              </p>
            </div>
            <StockBadge status={getProductStatus(product)} />
            <p className="flex w-full items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              La quantité évolue uniquement via les entrées, sorties et ajustements de stock.
            </p>
          </div>
        ) : null}

        <FormSection title="Identification" description="Comment le produit est reconnu dans votre stock.">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <FormField label="Référence" htmlFor="product-reference" required error={errors.reference?.message}>
              <Input
                id="product-reference"
                placeholder="PRD-001"
                maxLength={40}
                autoComplete="off"
                className="font-mono"
                aria-invalid={Boolean(errors.reference)}
                {...form.register('reference')}
              />
            </FormField>

            <FormField label="Nom du produit" htmlFor="product-name" required error={errors.name?.message}>
              <Input
                id="product-name"
                placeholder="Ex. Ramette papier A4"
                maxLength={120}
                aria-invalid={Boolean(errors.name)}
                {...form.register('name')}
              />
            </FormField>
          </div>
        </FormSection>

        <div className="border-t border-border" />

        <FormSection title="Classement et stock" description="Utilisés pour filtrer et déclencher les alertes.">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Catégorie"
              htmlFor="product-category"
              error={errors.category?.message}
              hint="Facultatif — choisissez une catégorie existante ou créez-en une."
            >
              <Input
                id="product-category"
                placeholder="Ex. Fournitures"
                maxLength={60}
                list={categoriesListId}
                autoComplete="off"
                {...form.register('category')}
              />
              <datalist id={categoriesListId}>
                {(categories.data ?? []).map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </FormField>

            <FormField label="Unité de mesure" htmlFor="product-unit" required error={errors.unit?.message}>
              <Select id="product-unit" {...form.register('unit')}>
                {PRODUCT_UNITS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField
            label="Seuil d’alerte"
            htmlFor="product-threshold"
            required
            error={errors.low_stock_threshold?.message}
            hint="Sous ce niveau, le produit passe en « Stock faible »."
          >
            <div className="relative sm:max-w-56">
              <Input
                id="product-threshold"
                inputMode="decimal"
                placeholder="0"
                className="pe-20 tabular-nums"
                aria-invalid={Boolean(errors.low_stock_threshold)}
                {...form.register('low_stock_threshold')}
              />
              <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted-foreground">
                {unit}
              </span>
            </div>
          </FormField>
        </FormSection>

        <div className="border-t border-border" />

        <FormSection title="Description">
          <FormField label="Informations complémentaires" htmlFor="product-description" error={errors.description?.message}>
            <Textarea
              id="product-description"
              placeholder="Fournisseur, emplacement, conditionnement…"
              maxLength={DESCRIPTION_MAX}
              rows={3}
              {...form.register('description')}
            />
            <p className="text-end text-xs text-muted-foreground tabular-nums">
              {descriptionLength} / {DESCRIPTION_MAX}
            </p>
          </FormField>
        </FormSection>
      </form>
    </Modal>
  )
}
