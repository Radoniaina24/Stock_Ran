import { useMemo, useState, type ReactNode } from 'react'
import {
  Ban,
  Banknote,
  FileText,
  ReceiptText,
  ShoppingBag,
} from 'lucide-react'
import {
  PAYMENT_METHOD_LABELS,
  type PaymentRow,
  type SaleBalance,
} from '../../types/database'
import { useSale, useSaleItems, useSaleMutations } from '../../hooks/useSales'
import { useSalePayments, usePaymentMutations } from '../../hooks/usePayments'
import { supabaseErrorMessage } from '../../lib/supabase'
import { cn, formatAmount, formatDate, formatQuantity } from '../../lib/utils'
import { useToast } from '../ui/toast'
import { Modal, ModalIcon } from '../ui/dialog'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { Input } from '../ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import { EmptyState, LoadingState } from '../ui/states'
import { PaymentFormDialog } from './PaymentFormDialog'
import {
  PaymentMethodBadge,
  PaymentRecordStatusBadge,
  PaymentStatusBadge,
  SaleStatusBadge,
} from './status-badges'

export interface SaleDetailsDialogProps {
  sale: SaleBalance | null
  onClose: () => void
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-end text-sm font-medium text-foreground">{value}</dd>
    </div>
  )
}

export function SaleDetailsDialog({ sale, onClose }: SaleDetailsDialogProps) {
  const toast = useToast()
  const saleId = sale?.id
  const current = useSale(saleId)
  const items = useSaleItems(saleId)
  const payments = useSalePayments(saleId)
  const { cancel } = useSaleMutations()
  const { cancel: cancelPayment } = usePaymentMutations()

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [cancelSaleOpen, setCancelSaleOpen] = useState(false)
  const [cancellingPayment, setCancellingPayment] = useState<PaymentRow | null>(null)
  const [cancelComment, setCancelComment] = useState('')
  const [paymentComment, setPaymentComment] = useState('')

  const data = current.data ?? sale
  const isLoading = Boolean(saleId) && current.isLoading
  const isCancelled = data?.status === 'cancelled'
  const canPay = Boolean(data) && !isCancelled && (data?.balance_due ?? 0) > 0

  const lines = useMemo(() => items.data ?? [], [items.data])

  const handleCancelSale = async () => {
    if (!data) return
    try {
      await cancel.mutateAsync({
        saleId: data.id,
        comment: cancelComment.trim() === '' ? null : cancelComment.trim(),
      })
      toast.success('Vente annulée et stock réintégré.')
      setCancelSaleOpen(false)
      setCancelComment('')
      onClose()
    } catch (error) {
      toast.error(supabaseErrorMessage(error))
    }
  }

  const handleCancelPayment = async () => {
    if (!cancellingPayment) return
    try {
      await cancelPayment.mutateAsync({
        paymentId: cancellingPayment.id,
        comment: paymentComment.trim() === '' ? null : paymentComment.trim(),
      })
      toast.success('Paiement annulé.')
      setCancellingPayment(null)
      setPaymentComment('')
    } catch (error) {
      toast.error(supabaseErrorMessage(error))
    }
  }

  return (
    <>
      <Modal
        open={Boolean(sale)}
        size="lg"
        onClose={onClose}
        title={data ? `Vente ${data.reference}` : 'Vente'}
        icon={
          <ModalIcon>
            <ReceiptText className="size-5" />
          </ModalIcon>
        }
        description={
          data
            ? `${data.client_name ?? 'Client supprimé'} — ${formatDate(data.sale_date)}`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Fermer
            </Button>
            {isCancelled ? null : (
              <>
                <Button
                  variant="destructive"
                  onClick={() => setCancelSaleOpen(true)}
                  disabled={!data}
                >
                  <Ban className="size-4" />
                  Annuler la vente
                </Button>
                <Button onClick={() => setPaymentOpen(true)} disabled={!canPay}>
                  <Banknote className="size-4" />
                  Encaisser
                </Button>
              </>
            )}
          </>
        }
      >
        {isLoading ? (
          <LoadingState label="Chargement de la vente…" />
        ) : !data ? (
          <EmptyState title="Vente introuvable." />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <SaleStatusBadge status={data.status} />
              <PaymentStatusBadge status={data.payment_status} />
              {data.cancel_comment ? (
                <Badge variant="outline">Motif : {data.cancel_comment}</Badge>
              ) : null}
            </div>

            <dl className="divide-y divide-border rounded-xl border border-border px-4">
              <Row label="Client" value={`${data.client_code ?? ''} ${data.client_name ?? ''}`.trim() || '—'} />
              <Row label="Date de vente" value={formatDate(data.sale_date)} />
              <Row label="Montant brut" value={formatAmount(data.subtotal)} />
              <Row label="Remise" value={formatAmount(data.discount_amount)} />
              <Row label="Montant net" value={<strong>{formatAmount(data.total_amount)}</strong>} />
              <Row label="Encaissé" value={formatAmount(data.paid_amount)} />
              <Row
                label="Reste dû"
                value={
                  <span className={cn(data.balance_due > 0 ? 'text-danger' : 'text-success')}>
                    {formatAmount(data.balance_due)}
                  </span>
                }
              />
              {data.comment ? <Row label="Commentaire" value={data.comment} /> : null}
            </dl>

            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShoppingBag className="size-4 text-muted-foreground" aria-hidden="true" />
                Articles ({lines.length})
              </h3>
              {items.isLoading ? (
                <LoadingState label="Chargement des articles…" />
              ) : lines.length === 0 ? (
                <EmptyState title="Aucun article." />
              ) : (
                <div className="overflow-hidden rounded-xl border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produit</TableHead>
                        <TableHead className="text-end">Qté</TableHead>
                        <TableHead className="text-end">Prix unitaire</TableHead>
                        <TableHead className="text-end">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell>
                            <p className="truncate font-medium text-foreground">
                              {line.product_name_snapshot}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              <span className="font-mono">{line.product_reference_snapshot}</span>
                            </p>
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {formatQuantity(line.quantity)}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {formatAmount(line.unit_price)}
                          </TableCell>
                          <TableCell className="text-end font-medium tabular-nums">
                            {formatAmount(line.line_total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                Paiements ({(payments.data ?? []).length})
              </h3>
              {payments.isLoading ? (
                <LoadingState label="Chargement des paiements…" />
              ) : (payments.data ?? []).length === 0 ? (
                <EmptyState title="Aucun paiement enregistré." />
              ) : (
                <ul className="space-y-2">
                  {(payments.data ?? []).map((payment) => (
                    <li
                      key={payment.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <span className="font-mono">{payment.reference}</span>
                          <PaymentRecordStatusBadge status={payment.status} />
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(payment.paid_at)}
                          {payment.transaction_reference ? ` · ${payment.transaction_reference}` : ''}
                          {payment.cancel_comment ? ` · ${payment.cancel_comment}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <PaymentMethodBadge method={payment.payment_method} />
                        <span
                          className={cn(
                            'text-sm font-semibold tabular-nums',
                            payment.status === 'cancelled'
                              ? 'text-muted-foreground line-through'
                              : 'text-foreground',
                          )}
                        >
                          {formatAmount(payment.amount)}
                        </span>
                        {payment.status === 'cancelled' ? null : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:bg-danger-soft hover:text-danger"
                            onClick={() => setCancellingPayment(payment)}
                          >
                            Annuler
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Moyens acceptés : {Object.values(PAYMENT_METHOD_LABELS).join(', ')}.
              </p>
            </section>
          </div>
        )}
      </Modal>

      {paymentOpen && data ? (
        <PaymentFormDialog sale={data} onClose={() => setPaymentOpen(false)} />
      ) : null}

      <ConfirmDialog
        open={cancelSaleOpen}
        title="Annuler la vente ?"
        icon={<Ban className="size-5" />}
        destructive
        loading={cancel.isPending}
        message={
          <>
            Le stock sera réintégré et les paiements déjà encaissés resteront tracés. La vente
            ne disparaît pas de l’historique.
            <label htmlFor="cancel-sale-comment" className="mt-3 block text-sm font-medium text-foreground">
              Motif d’annulation (facultatif)
            </label>
            <Input
              id="cancel-sale-comment"
              className="mt-1.5"
              maxLength={200}
              autoComplete="off"
              value={cancelComment}
              onChange={(event) => setCancelComment(event.target.value)}
            />
          </>
        }
        confirmLabel="Annuler la vente"
        onConfirm={() => void handleCancelSale()}
        onCancel={() => setCancelSaleOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(cancellingPayment)}
        title="Annuler le paiement ?"
        icon={<Ban className="size-5" />}
        destructive
        loading={cancelPayment.isPending}
        message={
          <>
            Le paiement{' '}
            <strong className="font-mono">{cancellingPayment?.reference}</strong> ({formatAmount(cancellingPayment?.amount ?? 0)})
            sera marqué annulé et le solde de la vente sera recalculé.
            <label htmlFor="cancel-payment-comment" className="mt-3 block text-sm font-medium text-foreground">
              Motif (facultatif)
            </label>
            <Input
              id="cancel-payment-comment"
              className="mt-1.5"
              maxLength={200}
              autoComplete="off"
              value={paymentComment}
              onChange={(event) => setPaymentComment(event.target.value)}
            />
          </>
        }
        confirmLabel="Annuler le paiement"
        onConfirm={() => void handleCancelPayment()}
        onCancel={() => {
          setCancellingPayment(null)
          setPaymentComment('')
        }}
      />
    </>
  )
}
