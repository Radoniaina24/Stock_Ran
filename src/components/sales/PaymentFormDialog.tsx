import { useId, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Banknote, Loader2 } from 'lucide-react'
import type { SaleBalance } from '../../types/database'
import {
  PAYMENT_DEFAULT_VALUES,
  paymentSchema,
  type PaymentFormPayload,
  type PaymentFormValues,
} from '../../schemas/sale'
import { parseNumberInput } from '../../schemas/common'
import { usePaymentMutations } from '../../hooks/usePayments'
import { useSale } from '../../hooks/useSales'
import { supabaseErrorMessage } from '../../lib/supabase'
import { cn, formatAmount } from '../../lib/utils'
import { useToast } from '../ui/toast'
import { Modal, ModalIcon } from '../ui/dialog'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { TRANSACTION_HINTS } from '../../lib/sales'
import { PaymentMethodPicker } from './PaymentMethodPicker'
import { PaymentProgress } from './status-badges'

export interface PaymentFormDialogProps {
  sale: SaleBalance
  onClose: () => void
}

export function PaymentFormDialog({ sale, onClose }: PaymentFormDialogProps) {
  const toast = useToast()
  const formId = useId()
  const methodName = useId()
  const { record } = usePaymentMutations()
  const [serverError, setServerError] = useState<string | null>(null)

  const live = useSale(sale.id)
  // Figé pendant l'envoi : le rechargement qui suit notre propre paiement
  // ne doit pas faire clignoter les montants avant la fermeture.
  const [frozen, setFrozen] = useState<SaleBalance | null>(null)
  const current = frozen ?? live.data ?? sale
  const balance = Number(current.balance_due)
  const total = Number(current.total_amount)
  const paid = Number(current.paid_amount)
  const closed = !frozen && (current.status === 'cancelled' || balance <= 0)

  const form = useForm<PaymentFormValues, unknown, PaymentFormPayload>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      ...PAYMENT_DEFAULT_VALUES,
      amount: balance > 0 ? String(balance) : '',
    },
  })

  const { errors } = form.formState
  const amountValue = useWatch({ control: form.control, name: 'amount' })
  const method = useWatch({ control: form.control, name: 'paymentMethod' }) ?? 'cash'

  const amount = parseNumberInput(amountValue)
  const exceeds = amount > balance
  const remaining = Math.max(0, Math.round((balance - amount) * 100) / 100)

  const setAmount = (value: number) =>
    form.setValue('amount', String(value), { shouldDirty: true, shouldValidate: true })

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null)
    if (values.amount > balance) {
      form.setError('amount', { message: `Le montant dépasse le solde restant dû (${formatAmount(balance)}).` })
      return
    }
    const remainingAfter = Math.max(0, Math.round((balance - values.amount) * 100) / 100)
    setFrozen(current)
    try {
      await record.mutateAsync({
        saleId: sale.id,
        amount: values.amount,
        paymentMethod: values.paymentMethod,
        transactionReference: values.transactionReference,
        comment: values.comment,
      })
      toast.success(
        remainingAfter <= 0
          ? `Vente ${sale.reference} soldée.`
          : `Paiement enregistré — reste ${formatAmount(remainingAfter)} à encaisser.`,
      )
      onClose()
    } catch (error) {
      setFrozen(null)
      setServerError(supabaseErrorMessage(error))
    }
  })

  const half = Math.round((balance / 2) * 100) / 100

  return (
    <Modal
      open
      onClose={record.isPending ? () => undefined : onClose}
      title="Encaisser un paiement"
      icon={
        <ModalIcon tone="success">
          <Banknote className="size-5" />
        </ModalIcon>
      }
      description={
        <>
          Vente <span className="font-mono">{sale.reference}</span> · {sale.client_name ?? 'Client'}
        </>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={record.isPending}>
            Annuler
          </Button>
          <Button type="submit" form={formId} disabled={record.isPending || closed || exceeds || amount <= 0}>
            {record.isPending ? <Loader2 className="size-4 animate-spin" /> : <Banknote className="size-4" />}
            Encaisser {amount > 0 && !exceeds ? formatAmount(amount) : ''}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-5">
        {serverError ? (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {serverError}
          </p>
        ) : null}

        {closed ? (
          <p role="alert" className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
            {current.status === 'cancelled'
              ? 'Cette vente vient d’être annulée : aucun paiement ne peut plus être enregistré.'
              : 'Cette vente vient d’être entièrement réglée (depuis un autre onglet ou appareil).'}
          </p>
        ) : null}

        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <dl className="grid grid-cols-3 gap-3 text-center">
            <div>
              <dt className="text-xs text-muted-foreground">Montant net</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{formatAmount(total)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Déjà encaissé</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-success">{formatAmount(paid)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Reste dû</dt>
              <dd
                className={cn(
                  'mt-0.5 text-sm font-semibold tabular-nums',
                  balance > 0 ? 'text-danger' : 'text-foreground',
                )}
              >
                {formatAmount(balance)}
              </dd>
            </div>
          </dl>
          <PaymentProgress className="mt-3" paid={paid} total={total} />
        </div>

        <FormField label="Montant encaissé" htmlFor="payment-amount" required error={errors.amount?.message}>
          <div className="relative">
            <Input
              id="payment-amount"
              inputMode="decimal"
              className="h-11 pe-10 text-base font-semibold tabular-nums"
              aria-invalid={Boolean(errors.amount) || exceeds}
              data-autofocus
              {...form.register('amount')}
            />
            <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted-foreground">
              Ar
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => setAmount(balance)}>
              Tout le solde
            </Button>
            {half > 0 && half < balance ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setAmount(half)}>
                Moitié ({formatAmount(half)})
              </Button>
            ) : null}
          </div>
        </FormField>

        <FormField label="Moyen de paiement" required error={errors.paymentMethod?.message}>
          <PaymentMethodPicker
            name={methodName}
            value={method}
            onChange={(value) => form.setValue('paymentMethod', value, { shouldDirty: true })}
            invalid={Boolean(errors.paymentMethod)}
          />
        </FormField>

        <FormField
          label="Référence de transaction"
          htmlFor="payment-reference"
          error={errors.transactionReference?.message}
          hint={TRANSACTION_HINTS[method]}
        >
          <Input
            id="payment-reference"
            maxLength={60}
            autoComplete="off"
            aria-invalid={Boolean(errors.transactionReference)}
            {...form.register('transactionReference')}
          />
        </FormField>

        <FormField label="Commentaire" htmlFor="payment-comment" error={errors.comment?.message}>
          <Input
            id="payment-comment"
            maxLength={200}
            autoComplete="off"
            aria-invalid={Boolean(errors.comment)}
            {...form.register('comment')}
          />
        </FormField>

        <p
          aria-live="polite"
          className={cn(
            'rounded-lg px-3 py-2 text-sm',
            exceeds
              ? 'bg-danger-soft text-danger'
              : remaining <= 0 && amount > 0
                ? 'bg-success-soft text-success'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {exceeds
            ? `Le montant dépasse le solde restant dû de ${formatAmount(amount - balance)}.`
            : amount <= 0
              ? 'Saisissez le montant reçu.'
              : remaining <= 0
                ? 'La vente sera entièrement soldée.'
                : `Après ce paiement, il restera ${formatAmount(remaining)} à encaisser.`}
        </p>
      </form>
    </Modal>
  )
}
