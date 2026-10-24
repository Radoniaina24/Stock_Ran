import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import type { Product } from '../../types/database'
import { PRODUCT_UNITS } from '../../types/database'
import { PRODUCT_DEFAULT_VALUES, productSchema, type ProductFormPayload, type ProductFormValues } from '../../schemas/product'
import { useProductMutations } from '../../hooks/useProducts'
import { supabaseErrorMessage } from '../../lib/supabase'
import { useToast } from '../ui/toast'
import { Modal } from '../ui/dialog'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Select } from '../ui/select'

export interface ProductFormDialogProps {
  product: Product | null
  onClose: () => void
}

export function ProductFormDialog({ product, onClose }: ProductFormDialogProps) {
  const toast = useToast()
  const { create, update } = useProductMutations()
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
        form.setError('reference', { type: 'server', message })
        setServerError(message)
      } else {
        setServerError(message)
      }
    }
  })

  const isPending = create.isPending || update.isPending

  return (
    <Modal
      open
      onClose={isPending ? () => undefined : onClose}
      title={product ? 'Modifier le produit' : 'Ajouter un produit'}
      description={
        product
          ? 'La quantité ne se modifie pas ici : elle évolue uniquement par les entrées et sorties.'
          : 'Le produit est créé avec une quantité initiale de zéro.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Annuler
          </Button>
          <Button onClick={() => void onSubmit()} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {product ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </>
      }
    >
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-4">
        {serverError ? (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {serverError}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Référence"
            htmlFor="product-reference"
            required
            error={form.formState.errors.reference?.message}
          >
            <Input
              id="product-reference"
              placeholder="PRD-001"
              maxLength={40}
              {...form.register('reference')}
            />
          </FormField>

          <FormField
            label="Nom du produit"
            htmlFor="product-name"
            required
            error={form.formState.errors.name?.message}
          >
            <Input
              id="product-name"
              placeholder="Nom du produit"
              maxLength={120}
              {...form.register('name')}
            />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Catégorie"
            htmlFor="product-category"
            error={form.formState.errors.category?.message}
            hint="Facultatif"
          >
            <Input
              id="product-category"
              placeholder="Ex. Fournitures"
              maxLength={60}
              {...form.register('category')}
            />
          </FormField>

          <FormField
            label="Unité de mesure"
            htmlFor="product-unit"
            required
            error={form.formState.errors.unit?.message}
          >
            <Select id="product-unit" {...form.register('unit')}>
              {PRODUCT_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <FormField
          label="Seuil d'alerte"
          htmlFor="product-threshold"
          required
          error={form.formState.errors.low_stock_threshold?.message}
          hint="Le passage sous ce seuil déclenche le badge « Stock faible »."
        >
          <Input
            id="product-threshold"
            inputMode="decimal"
            placeholder="0"
            className="max-w-40"
            {...form.register('low_stock_threshold')}
          />
        </FormField>

        <FormField
          label="Description"
          htmlFor="product-description"
          error={form.formState.errors.description?.message}
          hint="Facultatif"
        >
          <Textarea
            id="product-description"
            placeholder="Informations complémentaires…"
            maxLength={500}
            rows={3}
            {...form.register('description')}
          />
        </FormField>

        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  )
}
