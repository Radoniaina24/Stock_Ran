import { useId, useMemo } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  CircleAlert,
  CircleCheck,
  Loader2,
  Minus,
  PackageOpen,
  PackageSearch,
  Plus,
  Scale,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/button'
import { Combobox, type ComboboxOption } from '../ui/combobox'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Skeleton, SkeletonGroup } from '../ui/skeleton'
import { EmptyState, ErrorState } from '../ui/states'
import { useToast } from '../ui/toast'
import { ProductAvatar, StockLevelBar } from '../products/ProductVisuals'
import { adjustmentFormSchema, entrySchema, exitSchema, type EntryFormPayload } from '../../schemas/movement'
import { useActiveProducts } from '../../hooks/useProducts'
import { useMovementMutations } from '../../hooks/useMovements'
import { supabaseErrorMessage } from '../../lib/supabase'
import { getStockStatus, signedDelta, STOCK_STATUS_LABELS } from '../../lib/stock'
import { cn, formatQuantity } from '../../lib/utils'
import {
  ADJUSTMENT_REASONS,
  ENTRY_REASONS,
  EXIT_REASONS,
  type MovementType,
  type Product,
} from '../../types/database'

type Direction = 'up' | 'down'

interface MovementFormValues {
  kind: MovementType
  direction: Direction
  productId: string
  quantity: string
  reason: string
  comment: string
}

type MovementPayload = EntryFormPayload
type MovementResolver = Resolver<MovementFormValues, unknown, MovementPayload>

const RESOLVERS: Record<MovementType, MovementResolver> = {
  entry: zodResolver(entrySchema) as unknown as MovementResolver,
  exit: zodResolver(exitSchema) as unknown as MovementResolver,
  adjustment: zodResolver(adjustmentFormSchema) as unknown as MovementResolver,
}

const resolver: MovementResolver = (values, context, options) =>
  RESOLVERS[values.kind](values, context, options)

interface KindConfig {
  label: string
  description: string
  icon: LucideIcon
  submit: string
  success: string
  quantityLabel: string
  reasons: readonly string[]
  button: 'success' | 'destructive' | 'default'
  selected: string
  iconTone: string
}

const KINDS: MovementType[] = ['entry', 'exit', 'adjustment']

const KIND_CONFIG: Record<MovementType, KindConfig> = {
  entry: {
    label: 'Entrée',
    description: 'Réception, retour',
    icon: ArrowDownToLine,
    submit: 'Enregistrer l’entrée',
    success: 'Entrée enregistrée.',
    quantityLabel: 'Quantité entrante',
    reasons: ENTRY_REASONS,
    button: 'success',
    selected: 'border-success bg-success-soft/60 ring-success/20',
    iconTone: 'bg-success-soft text-success',
  },
  exit: {
    label: 'Sortie',
    description: 'Utilisation, perte, casse',
    icon: ArrowUpFromLine,
    submit: 'Enregistrer la sortie',
    success: 'Sortie enregistrée.',
    quantityLabel: 'Quantité sortante',
    reasons: EXIT_REASONS,
    button: 'destructive',
    selected: 'border-danger bg-danger-soft/60 ring-danger/20',
    iconTone: 'bg-danger-soft text-danger',
  },
  adjustment: {
    label: 'Ajustement',
    description: 'Correction d’inventaire',
    icon: Scale,
    submit: 'Enregistrer l’ajustement',
    success: 'Ajustement enregistré.',
    quantityLabel: 'Quantité à corriger',
    reasons: ADJUSTMENT_REASONS,
    button: 'default',
    selected: 'border-primary bg-primary-soft/60 ring-primary/20',
    iconTone: 'bg-primary-soft text-primary',
  },
}

const STATUS_TEXT = { out: 'text-danger', low: 'text-warning', ok: 'text-success' } as const

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function parseQuantity(value: string): number | null {
  const parsed = Number(value.trim().replace(',', '.'))
  return value.trim() !== '' && Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

type PreviewNotice = { tone: 'danger' | 'warning' | 'success'; message: string } | null

function getNotice(product: Product, after: number, delta: number): PreviewNotice {
  const before = getStockStatus(product.quantity, product.low_stock_threshold)
  const next = getStockStatus(after, product.low_stock_threshold)
  const unit = product.unit
  if (after < 0) {
    return {
      tone: 'danger',
      message: `Stock insuffisant : seulement ${formatQuantity(product.quantity)} ${unit} disponible(s).`,
    }
  }
  if (delta < 0 && next === 'out') return { tone: 'danger', message: 'Le produit sera en rupture de stock.' }
  if (delta < 0 && next === 'low' && before === 'ok') {
    return { tone: 'warning', message: 'Le produit passera sous son seuil d’alerte.' }
  }
  if (delta > 0 && next === 'ok' && before !== 'ok') {
    return { tone: 'success', message: 'Le stock repassera au-dessus du seuil d’alerte.' }
  }
  return null
}

const NOTICE_STYLES = {
  danger: { className: 'border-danger/30 bg-danger-soft text-danger', icon: CircleAlert },
  warning: { className: 'border-warning/30 bg-warning-soft text-warning', icon: TriangleAlert },
  success: { className: 'border-success/30 bg-success-soft text-success', icon: CircleCheck },
} as const

function MovementPreview({ product, delta }: { product: Product | undefined; delta: number | null }) {
  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <PackageSearch className="size-5" aria-hidden="true" />
        </span>
        <p className="max-w-56 text-sm text-muted-foreground">
          Sélectionnez un produit pour visualiser l’impact sur le stock.
        </p>
      </div>
    )
  }

  const before = Number(product.quantity)
  const after = delta === null ? null : before + delta
  const afterStatus = getStockStatus(after ?? before, product.low_stock_threshold)
  const notice = after === null ? null : getNotice(product, after, delta ?? 0)
  const NoticeIcon = notice ? NOTICE_STYLES[notice.tone].icon : null

  return (
    <div className="rounded-xl border border-border bg-card p-4" aria-live="polite">
      <div className="flex items-center gap-3">
        <ProductAvatar status={getStockStatus(before, product.low_stock_threshold)} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{product.reference}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="rounded-lg bg-muted/70 p-3">
          <p className="text-xs text-muted-foreground">Avant</p>
          <p className="mt-0.5 text-xl font-semibold text-foreground tabular-nums">{formatQuantity(before)}</p>
          <p className="text-xs text-muted-foreground">{product.unit}</p>
        </div>
        <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
        <div
          className={cn(
            'rounded-lg p-3 transition-colors',
            after === null
              ? 'bg-muted/70'
              : after < 0 || afterStatus === 'out'
                ? 'bg-danger-soft'
                : afterStatus === 'low'
                  ? 'bg-warning-soft'
                  : 'bg-success-soft',
          )}
        >
          <p className="text-xs text-muted-foreground">Après</p>
          <p
            className={cn(
              'mt-0.5 text-xl font-semibold tabular-nums',
              after === null ? 'text-muted-foreground' : after < 0 ? 'text-danger' : STATUS_TEXT[afterStatus],
            )}
          >
            {after === null ? '—' : formatQuantity(after)}
          </p>
          <p className="text-xs text-muted-foreground">{product.unit}</p>
        </div>
      </div>

      <StockLevelBar
        className="mt-4 h-2"
        quantity={Math.max(0, after ?? before)}
        threshold={product.low_stock_threshold}
        status={afterStatus}
      />
      <div className="mt-1.5 flex justify-between gap-2 text-xs text-muted-foreground">
        <span>{after !== null && after < 0 ? 'Impossible' : STOCK_STATUS_LABELS[afterStatus]}</span>
        <span>
          Seuil :{' '}
          <span className="font-medium text-foreground tabular-nums">
            {formatQuantity(product.low_stock_threshold)} {product.unit}
          </span>
        </span>
      </div>

      {notice && NoticeIcon ? (
        <p
          className={cn(
            'mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs font-medium',
            NOTICE_STYLES[notice.tone].className,
          )}
        >
          <NoticeIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {notice.message}
        </p>
      ) : null}
    </div>
  )
}

function MovementFormSkeleton() {
  return (
    <SkeletonGroup label="Chargement des produits…" className="space-y-6 p-5 sm:p-6">
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-10 w-full rounded-lg sm:w-60" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
    </SkeletonGroup>
  )
}

export interface MovementFormProps {
  variant?: 'page' | 'dialog'
  initialKind?: MovementType
  initialProductId?: string
  onSuccess?: () => void
  onCancel?: () => void
}

export function MovementForm({
  variant = 'page',
  initialKind = 'entry',
  initialProductId = '',
  onSuccess,
  onCancel,
}: MovementFormProps) {
  const toast = useToast()
  const navigate = useNavigate()
  const uid = useId()
  const products = useActiveProducts()
  const { addEntry, addExit, addAdjustment } = useMovementMutations()
  const isDialog = variant === 'dialog'

  const form = useForm<MovementFormValues, unknown, MovementPayload>({
    resolver,
    defaultValues: {
      kind: initialKind,
      direction: 'up',
      productId: initialProductId,
      quantity: '',
      reason: '',
      comment: '',
    },
  })

  const { errors } = form.formState
  const [kind, direction, productId, quantity] = useWatch({
    control: form.control,
    name: ['kind', 'direction', 'productId', 'quantity'],
  })
  const config = KIND_CONFIG[kind]

  const productList = products.data
  const options = useMemo<ComboboxOption[]>(
    () =>
      (productList ?? []).map((product) => ({
        value: product.id,
        label: product.name,
        description: product.reference,
        aside: (
          <span className={cn('font-medium tabular-nums', STATUS_TEXT[getStockStatus(product.quantity, product.low_stock_threshold)])}>
            {formatQuantity(product.quantity)} {product.unit}
          </span>
        ),
      })),
    [productList],
  )
  const product = productList?.find((item) => item.id === productId)

  const parsed = parseQuantity(quantity ?? '')
  const delta = parsed === null ? null : signedDelta(kind, parsed, direction)
  const insufficient = product !== undefined && delta !== null && Number(product.quantity) + delta < 0

  const isPending = addEntry.isPending || addExit.isPending || addAdjustment.isPending

  const onSubmit = form.handleSubmit(async (payload) => {
    if (insufficient) {
      form.setError('quantity', { type: 'stock', message: 'La quantité dépasse le stock disponible.' })
      return
    }
    const input = {
      productId: payload.productId,
      quantity: kind === 'adjustment' ? signedDelta(kind, payload.quantity, direction) : payload.quantity,
      reason: payload.reason,
      comment: payload.comment,
    }
    try {
      if (kind === 'entry') await addEntry.mutateAsync(input)
      else if (kind === 'exit') await addExit.mutateAsync(input)
      else await addAdjustment.mutateAsync(input)

      toast.success(config.success)
      form.reset({ kind, direction, productId: payload.productId, quantity: '', reason: '', comment: '' })
      onSuccess?.()
    } catch (error) {
      toast.error(supabaseErrorMessage(error))
    }
  })

  if (products.isLoading) return <MovementFormSkeleton />

  if (products.isError) {
    return <ErrorState message={supabaseErrorMessage(products.error)} onRetry={() => void products.refetch()} />
  }

  if ((productList ?? []).length === 0) {
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

  const submitButton = (
    <Button
      type="submit"
      variant={config.button}
      size={isDialog ? 'default' : 'lg'}
      disabled={isPending || insufficient}
      className={isDialog ? undefined : 'w-full'}
    >
      {isPending ? <Loader2 className="size-4 animate-spin" /> : <config.icon className="size-4" />}
      {config.submit}
    </Button>
  )

  const fields = (
    <div className={cn('space-y-6', !isDialog && 'p-5 sm:p-6')}>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-foreground">Type de mouvement</legend>
        <div className="grid grid-cols-3 gap-2">
          {KINDS.map((value) => {
            const item = KIND_CONFIG[value]
            const selected = kind === value
            return (
              <label
                key={value}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all sm:flex-row sm:text-start',
                  'has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-primary/40',
                  selected ? cn('ring-2', item.selected) : 'border-border hover:border-input hover:bg-muted/50',
                )}
              >
                <input
                  type="radio"
                  value={value}
                  className="sr-only"
                  {...form.register('kind', {
                    onChange: () => {
                      form.setValue('reason', '')
                      form.clearErrors()
                    },
                  })}
                />
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', item.iconTone)}>
                  <item.icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                  <span className={cn('truncate text-xs text-muted-foreground', isDialog ? 'hidden' : 'hidden xl:block')}>
                    {item.description}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <FormField label="Produit" htmlFor={`${uid}-product`} required error={errors.productId?.message}>
        <Combobox
          id={`${uid}-product`}
          options={options}
          value={productId}
          onChange={(value) => form.setValue('productId', value, { shouldValidate: true })}
          placeholder="Rechercher par nom ou référence…"
          emptyText="Aucun produit ne correspond."
          invalid={Boolean(errors.productId)}
          autoFocusTarget={isDialog && !initialProductId}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        {kind === 'adjustment' ? (
          <fieldset className="space-y-1.5 sm:col-span-2">
            <legend className="text-sm font-medium text-foreground">Sens de la correction</legend>
            <div className="inline-flex rounded-lg bg-muted p-1">
              {(['up', 'down'] as const).map((value) => (
                <label
                  key={value}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                    'has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-primary/40',
                    direction === value
                      ? cn('bg-card shadow-sm', value === 'up' ? 'text-success' : 'text-danger')
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <input type="radio" value={value} className="sr-only" {...form.register('direction')} />
                  {value === 'up' ? <Plus className="size-3.5" /> : <Minus className="size-3.5" />}
                  {value === 'up' ? 'Augmenter' : 'Diminuer'}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <FormField
          label={config.quantityLabel}
          htmlFor={`${uid}-quantity`}
          required
          error={errors.quantity?.message}
          className="sm:col-span-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-60">
              <Input
                id={`${uid}-quantity`}
                inputMode="decimal"
                placeholder="0"
                autoComplete="off"
                data-autofocus={isDialog && initialProductId ? true : undefined}
                aria-invalid={Boolean(errors.quantity) || insufficient}
                className={cn('h-10 rounded-lg pe-20 text-base tabular-nums sm:text-sm', (errors.quantity || insufficient) && 'border-danger')}
                {...form.register('quantity')}
              />
              <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted-foreground">
                {product?.unit ?? 'unité'}
              </span>
            </div>
            {product && (kind === 'exit' || (kind === 'adjustment' && direction === 'down')) && Number(product.quantity) > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => form.setValue('quantity', String(product.quantity), { shouldValidate: true })}
              >
                Tout le stock ({formatQuantity(product.quantity)})
              </Button>
            ) : null}
          </div>
        </FormField>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-foreground">
          Motif<span className="ms-0.5 text-danger">*</span>
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {config.reasons.map((reason) => (
            <label key={reason} className="cursor-pointer">
              <input type="radio" value={reason} className="peer sr-only" {...form.register('reason')} />
              <span
                className={cn(
                  'inline-flex items-center rounded-full border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted',
                  'peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:font-medium peer-checked:text-primary',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40',
                )}
              >
                {capitalize(reason)}
              </span>
            </label>
          ))}
        </div>
        {errors.reason?.message ? (
          <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
            {errors.reason.message}
          </p>
        ) : null}
      </fieldset>

      <FormField label="Commentaire" htmlFor={`${uid}-comment`} error={errors.comment?.message} hint="Facultatif">
        <Textarea
          id={`${uid}-comment`}
          rows={2}
          maxLength={500}
          placeholder="N° de bon de livraison, destinataire, précision…"
          {...form.register('comment')}
        />
      </FormField>
    </div>
  )

  if (isDialog) {
    return (
      <form onSubmit={(event) => void onSubmit(event)} noValidate>
        {fields}
        <div className="mt-6">
          <MovementPreview product={product} delta={delta} />
        </div>
        <div className="sticky bottom-0 z-10 -mx-5 -mb-5 mt-6 flex flex-col-reverse gap-2 border-t border-border bg-card px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:-mb-6 sm:flex-row sm:justify-end sm:px-6">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Annuler
          </Button>
          {submitButton}
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      {fields}
      <aside className="flex flex-col gap-4 border-t border-border bg-muted/30 p-5 sm:p-6 lg:border-s lg:border-t-0">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aperçu du mouvement</h3>
        <MovementPreview product={product} delta={delta} />
        <div className="mt-auto space-y-2 pt-2">
          {submitButton}
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            disabled={isPending}
            onClick={() =>
              form.reset({ kind, direction: 'up', productId: '', quantity: '', reason: '', comment: '' })
            }
          >
            Réinitialiser le formulaire
          </Button>
        </div>
      </aside>
    </form>
  )
}
