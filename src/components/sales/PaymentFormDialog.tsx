import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Banknote, Loader2 } from 'lucide-react'
import { PAYMENT_METHODS, type SaleBalance } from '../../types/database'
import { PAYMENT_METHOD_LABELS } from '../../types/database'
import {
  PAYMENT_DEFAULT_VALUES,
  paymentSchema,
  type PaymentFormPayload,
  type PaymentFormValues,
} from '../../schemas/sale'
import { usePaymentMutations } from '../../hooks/usePayments'
import { supabaseErrorMessage } from '../../lib/supabase'
import { formatAmount } from '../../lib/utils'
import { useToast } from '../ui/toast'
import { Modal, ModalIcon } from '../ui/dialog'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { Select } from '../ui/select'

export interface PaymentFormDialogProps {
  sale: SaleBalance
  onClose: () => void
}

export function PaymentFormDialog({ sale, onClose }: PaymentFormDialogProps) {
  const toast = useToast()
  const formId = useId()
  const { record } = usePaymentMutations()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<PaymentFormValues, unknown, PaymentFormPayload>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      ...PAYMENT_DEFAULT_VALUES,
      amount: String(sale.balance_due > 0 ? sale.balance_due : ''),
    },
  })

  const { errors } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null)
    try {
      await record.mutateAsync({
        saleId: sale.id,
        amount: values.amount,
        paymentMethod: values.paymentMethod,
        transactionReference: values.transactionReference,
        comment: values.comment,
      })
      toast.success('Paiement enregistré.')
      onClose()
    } catch (error) {
      setServerError(supabaseErrorMessage(error))
    }
  })

  return (
    <Modal
      open
      onClose={record.isPending ? () => undefined : onClose}
      title="Enregistrer un paiement"
      icon={
        <ModalIcon tone="success">
          <Banknote className="size-5" />
        </ModalIcon>
      }
      description={`Vente ${sale.reference} — reste dû ${formatAmount(sale.balance_due)}.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={record.isPending}>
            Annuler
          </Button>
          <Button type="submit" form={formId} disabled={record.isPending}>
            {record.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Encaisser
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

        <FormField label="Montant encaissé" htmlFor="payment-amount" required error={errors.amount?.message}>
          <div className="relative">
            <Input
              id="payment-amount"
              inputMode="decimal"
              className="pe-10 tabular-nums"
              aria-invalid={Boolean(errors.amount)}
              autoFocus
              {...form.register('amount')}
            />
            <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted-foreground">
              Ar
            </span>
          </div>
        </FormField>

        <FormField
          label="Moyen de paiement"
          htmlFor="payment-method"
          required
          error={errors.paymentMethod?.message}
        >
          <Select id="payment-method" {...form.register('paymentMethod')}>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Référence de transaction"
          htmlFor="payment-reference"
          error={errors.transactionReference?.message}
          hint="Facultatif — numéro Mobile Money, chèque, virement…"
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
      </form>
    </Modal>
  )
}
