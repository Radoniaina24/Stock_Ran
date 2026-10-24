import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  PackageOpen,
  Scale,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Combobox, type ComboboxOption } from '../components/ui/combobox'
import { FormField } from '../components/ui/form-field'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Textarea } from '../components/ui/textarea'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states'
import { useToast } from '../components/ui/toast'
import { RecentMovementsCard } from '../components/stock/RecentMovementsCard'
import {
  adjustmentSchema,
  entrySchema,
  exitSchema,
  MOVEMENT_DEFAULT_VALUES,
  type AdjustmentFormPayload,
  type AdjustmentFormValues,
} from '../schemas/movement'
import { useActiveProducts } from '../hooks/useProducts'
import { useMovementMutations } from '../hooks/useMovements'
import { supabaseErrorMessage } from '../lib/supabase'
import { formatQuantity } from '../lib/utils'
import { ADJUSTMENT_REASONS, ENTRY_REASONS, EXIT_REASONS } from '../types/database'

type MovementKind = 'entry' | 'exit' | 'adjustment'

type MovementValues = AdjustmentFormValues
type MovementPayload = AdjustmentFormPayload

const RESOLVERS: Record<MovementKind, Resolver<MovementValues, unknown, MovementPayload>> = {
  entry: zodResolver(entrySchema) as Resolver<MovementValues, unknown, MovementPayload>,
  exit: zodResolver(exitSchema) as Resolver<MovementValues, unknown, MovementPayload>,
  adjustment: zodResolver(
    adjustmentSchema,
  ) as Resolver<MovementValues, unknown, MovementPayload>,
}

const KIND_CONFIG: Record<
  MovementKind,
  { submit: string; success: string; quantityLabel: string; reasonLabel: string; reasons: readonly string[] }
> = {
  entry: {
    submit: 'Enregistrer l’entrée',
    success: 'Entrée enregistrée.',
    quantityLabel: 'Quantité entrante',
    reasonLabel: 'Motif',
    reasons: ENTRY_REASONS,
  },
  exit: {
    submit: 'Enregistrer la sortie',
    success: 'Sortie enregistrée.',
    quantityLabel: 'Quantité sortante',
    reasonLabel: 'Motif',
    reasons: EXIT_REASONS,
  },
  adjustment: {
    submit: 'Enregistrer l’ajustement',
    success: 'Ajustement enregistré.',
    quantityLabel: 'Valeur de l’ajustement',
    reasonLabel: 'Motif',
    reasons: ADJUSTMENT_REASONS,
  },
}

function MovementForm({ kind }: { kind: MovementKind }) {
  const toast = useToast()
  const navigate = useNavigate()
  const products = useActiveProducts()
  const { addEntry, addExit, addAdjustment } = useMovementMutations()
  const config = KIND_CONFIG[kind]

  const form = useForm<MovementValues, unknown, MovementPayload>({
    resolver: RESOLVERS[kind],
    defaultValues: MOVEMENT_DEFAULT_VALUES,
  })

  const selectedProductId = useWatch({ control: form.control, name: 'productId' })
  const options: ComboboxOption[] = (products.data ?? []).map((product) => ({
    value: product.id,
    label: `${product.name} (${product.reference})`,
    description: `Stock : ${formatQuantity(product.quantity)} ${product.unit}`,
  }))
  const selectedProduct = (products.data ?? []).find(
    (product) => product.id === selectedProductId,
  )

  const isPending =
    kind === 'entry'
      ? addEntry.isPending
      : kind === 'exit'
        ? addExit.isPending
        : addAdjustment.isPending

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      productId: values.productId,
      quantity: values.quantity,
      reason: values.reason,
      comment: values.comment,
    }
    try {
      if (kind === 'entry') await addEntry.mutateAsync(payload)
      else if (kind === 'exit') await addExit.mutateAsync(payload)
      else await addAdjustment.mutateAsync(payload)

      toast.success(config.success)
      form.reset({
        productId: values.productId,
        quantity: '',
        reason: '',
        comment: '',
      })
    } catch (error) {
      toast.error(supabaseErrorMessage(error))
    }
  })

  if (products.isLoading) return <LoadingState label="Chargement des produits…" />

  if (products.isError) {
    return (
      <ErrorState
        message={supabaseErrorMessage(products.error)}
        onRetry={() => void products.refetch()}
      />
    )
  }

  if ((products.data ?? []).length === 0) {
    return (
      <EmptyState
        title="Aucun produit actif."
        description="Ajoutez un produit avant d’enregistrer un mouvement de stock."
        icon={<PackageOpen className="size-5" />}
        action={
          <Button size="sm" onClick={() => navigate('/produits')}>
            Aller aux produits
          </Button>
        }
      />
    )
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-4">
      <FormField
        label="Produit"
        htmlFor={`${kind}-product`}
        required
        error={form.formState.errors.productId?.message}
      >
        <Combobox
          id={`${kind}-product`}
          options={options}
          value={selectedProductId}
          onChange={(value) => form.setValue('productId', value, { shouldValidate: true })}
          placeholder="Rechercher un produit…"
          emptyText="Aucun produit ne correspond."
        />
      </FormField>

      {selectedProduct ? (
        <p className="text-xs text-muted-foreground">
          Stock disponible :{' '}
          <span className="font-medium text-foreground">
            {formatQuantity(selectedProduct.quantity)} {selectedProduct.unit}
          </span>
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={config.quantityLabel}
          htmlFor={`${kind}-quantity`}
          required
          error={form.formState.errors.quantity?.message}
          hint={kind === 'adjustment' ? 'Signe « - » pour retirer, « + » pour ajouter.' : undefined}
        >
          <Input
            id={`${kind}-quantity`}
            inputMode="decimal"
            placeholder={kind === 'adjustment' ? 'ex. -2' : '0'}
            {...form.register('quantity')}
          />
        </FormField>

        <FormField
          label={config.reasonLabel}
          htmlFor={`${kind}-reason`}
          required
          error={form.formState.errors.reason?.message}
        >
          <Select id={`${kind}-reason`} {...form.register('reason')}>
            <option value="">Sélectionnez un motif</option>
            {config.reasons.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <FormField
        label="Commentaire"
        htmlFor={`${kind}-comment`}
        error={form.formState.errors.comment?.message}
        hint="Facultatif"
      >
        <Textarea
          id={`${kind}-comment`}
          rows={2}
          maxLength={500}
          placeholder="Informations complémentaires…"
          {...form.register('comment')}
        />
      </FormField>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {config.submit}
        </Button>
      </div>
    </form>
  )
}

export function MovementsPage() {
  return (
    <>
      <PageHeader
        title="Mouvements de stock"
        description="Enregistrez les entrées, les sorties et les ajustements. Le stock est mis à jour de façon atomique côté base de données."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-md bg-success-soft text-success">
                <ArrowDownToLine className="size-4" />
              </span>
              <CardTitle>Entrée de stock</CardTitle>
            </div>
            <CardDescription>
              Réception, retour ou inventaire : la quantité disponible augmente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MovementForm kind="entry" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-md bg-danger-soft text-danger">
                <ArrowUpFromLine className="size-4" />
              </span>
              <CardTitle>Sortie de stock</CardTitle>
            </div>
            <CardDescription>
              Utilisation, perte ou casse : le stock ne peut jamais passer en négatif.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MovementForm kind="exit" />
          </CardContent>
        </Card>

        <Card className="md:col-span-2 xl:col-span-1">
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-md bg-primary-soft text-primary">
                <Scale className="size-4" />
              </span>
              <CardTitle>Ajustement</CardTitle>
            </div>
            <CardDescription>
              Correction tracée d’un écart d’inventaire. L’opération d’origine est conservée.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MovementForm kind="adjustment" />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <RecentMovementsCard />
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        <Link className="underline-offset-4 hover:underline" to="/historique">
          Consulter l’historique complet des mouvements
        </Link>
      </p>
    </>
  )
}
