import { useId, useMemo, useState } from 'react'
import { Loader2, Lock, LockOpen, TriangleAlert } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Modal, ModalIcon } from '../ui/dialog'
import { FormField } from '../ui/form-field'
import { SegmentedTabs } from '../ui/segmented'
import { Textarea } from '../ui/textarea'
import { useToast } from '../ui/toast'
import { useDailyInvoiceMutations } from '../../hooks/useDailyInvoice'
import { useUserLabel } from '../../hooks/useWorkspaceUsers'
import { compareTotals, formatDateTimeInZone, formatLongDay } from '../../lib/dailyInvoice'
import { supabaseErrorMessage } from '../../lib/supabase'
import { formatAmount, formatQuantity } from '../../lib/utils'
import type { DailyInvoiceResponse, DailyInvoiceTotals } from '../../types/database'

export type InvoiceView = 'frozen' | 'current'

const COUNT_KEYS: (keyof DailyInvoiceTotals)[] = ['clients_count', 'sales_count']

function formatTotal(key: keyof DailyInvoiceTotals, value: number): string {
  if (COUNT_KEYS.includes(key)) return String(value)
  if (key === 'items_quantity') return formatQuantity(value)
  return formatAmount(value)
}

function ReasonDialog({
  open,
  title,
  description,
  label,
  required,
  confirmLabel,
  tone,
  loading,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: string
  label: string
  required: boolean
  confirmLabel: string
  tone: 'primary' | 'warning'
  loading: boolean
  error: string | null
  onConfirm: (value: string) => void
  onClose: () => void
}) {
  const id = useId()
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)
  const invalid = required && value.trim().length < 3

  const submit = () => {
    setTouched(true)
    if (invalid) return
    onConfirm(value.trim())
  }

  return (
    <Modal
      open={open}
      size="sm"
      onClose={loading ? () => undefined : onClose}
      title={title}
      icon={
        <ModalIcon tone={tone}>
          {tone === 'warning' ? <LockOpen className="size-5" /> : <Lock className="size-5" />}
        </ModalIcon>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        {error ? (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <FormField
          label={label}
          htmlFor={id}
          required={required}
          error={touched && invalid ? 'Indiquez un motif d’au moins 3 caractères.' : undefined}
          hint={required ? undefined : 'Facultatif — visible dans le journal de clôture.'}
        >
          <Textarea
            id={id}
            value={value}
            maxLength={500}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={touched && invalid}
          />
        </FormField>
      </div>
    </Modal>
  )
}

export function DailyClosingCard({
  invoice,
  view,
  onViewChange,
  timeZone,
}: {
  invoice: DailyInvoiceResponse
  view: InvoiceView
  onViewChange: (view: InvoiceView) => void
  timeZone: string
}) {
  const toast = useToast()
  const userLabel = useUserLabel()
  const { close, reopen } = useDailyInvoiceMutations(invoice.invoice_date)
  const [dialog, setDialog] = useState<'close' | 'reopen' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const closing = invoice.closing
  const isClosed = closing?.status === 'closed'
  const differences = useMemo(
    () => (isClosed && closing ? compareTotals(closing.snapshot.totals, invoice.totals) : []),
    [closing, invoice.totals, isClosed],
  )
  const isFuture = invoice.invoice_date > invoice.today
  const canClose = !isClosed && !isFuture && invoice.totals.sales_count > 0

  const openDialog = (kind: 'close' | 'reopen') => {
    setError(null)
    setDialog(kind)
  }

  const onConfirmClose = async (comment: string) => {
    setError(null)
    try {
      await close.mutateAsync(comment || null)
      setDialog(null)
      onViewChange('frozen')
      toast.success(`Journée du ${formatLongDay(invoice.invoice_date)} clôturée.`)
    } catch (err) {
      setError(supabaseErrorMessage(err))
    }
  }

  const onConfirmReopen = async (reason: string) => {
    setError(null)
    try {
      await reopen.mutateAsync(reason)
      setDialog(null)
      onViewChange('current')
      toast.success('Journée rouverte. La réouverture est enregistrée dans le journal.')
    } catch (err) {
      setError(supabaseErrorMessage(err))
    }
  }

  return (
    <Card className="overflow-hidden rounded-xl">
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Clôture de la journée</h2>
          {isClosed ? (
            <Badge variant="success">
              <Lock className="size-3" aria-hidden="true" />
              Clôturée · révision {closing.revision}
            </Badge>
          ) : closing?.status === 'reopened' ? (
            <Badge variant="warning">
              <LockOpen className="size-3" aria-hidden="true" />
              Rouverte
            </Badge>
          ) : (
            <Badge variant="neutral">Ouverte</Badge>
          )}
        </div>

        {isClosed ? (
          <p className="text-sm text-muted-foreground">
            Totaux arrêtés le {formatDateTimeInZone(closing.closed_at, timeZone)} par{' '}
            <span className="font-medium text-foreground">{userLabel(closing.closed_by)}</span>. Les ventes de cette
            journée ne peuvent plus être ajoutées ni annulées.
          </p>
        ) : closing?.status === 'reopened' ? (
          <p className="text-sm text-muted-foreground">
            Rouverte le {formatDateTimeInZone(closing.reopened_at, timeZone)} par{' '}
            <span className="font-medium text-foreground">{userLabel(closing.reopened_by)}</span>
            {closing.reopen_reason ? ` — « ${closing.reopen_reason} »` : ''}. La facture est de nouveau provisoire.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Facture provisoire : elle suit en temps réel les ventes et paiements validés. Clôturez la journée pour
            figer les totaux.
          </p>
        )}

        {differences.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-warning">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              Les données ont évolué depuis la clôture
            </p>
            <ul className="space-y-0.5 text-xs text-foreground">
              {differences.map((diff) => (
                <li key={diff.key} className="flex flex-wrap justify-between gap-x-3 tabular-nums">
                  <span className="text-muted-foreground">{diff.label}</span>
                  <span>
                    {formatTotal(diff.key, diff.frozen)} → <strong>{formatTotal(diff.key, diff.current)}</strong>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Typiquement un encaissement de créance après la clôture. Le document clôturé reste inchangé.
            </p>
          </div>
        ) : null}

        {isClosed ? (
          <SegmentedTabs<InvoiceView>
            label="Version de la facture"
            value={view}
            onChange={onViewChange}
            options={[
              { value: 'frozen', label: 'Version clôturée' },
              { value: 'current', label: 'État actuel' },
            ]}
          />
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {isClosed ? (
            invoice.can_reopen ? (
              <Button variant="outline" onClick={() => openDialog('reopen')}>
                <LockOpen className="size-4" />
                Rouvrir la journée
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Seul le propriétaire de l’espace peut rouvrir une journée clôturée.
              </p>
            )
          ) : (
            <Button
              onClick={() => openDialog('close')}
              disabled={!canClose}
              title={
                isFuture
                  ? 'Cette journée n’a pas encore commencé.'
                  : invoice.totals.sales_count === 0
                    ? 'Aucune vente validée à clôturer.'
                    : undefined
              }
            >
              <Lock className="size-4" />
              {closing ? 'Clôturer à nouveau' : 'Clôturer la journée'}
            </Button>
          )}
        </div>
      </div>

      {closing && closing.events.length > 0 ? (
        <div className="border-t border-border bg-muted/40 px-4 py-3 sm:px-5">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Journal</p>
          <ol className="space-y-2">
            {closing.events.map((event) => (
              <li key={event.id} className="text-xs">
                <p className="text-foreground">
                  <span className="font-medium">{event.action === 'closed' ? 'Clôture' : 'Réouverture'}</span> ·
                  révision {event.revision} · {formatDateTimeInZone(event.created_at, timeZone)}
                </p>
                <p className="text-muted-foreground">
                  {userLabel(event.created_by)} · net {formatAmount(event.net_amount)} · encaissé{' '}
                  {formatAmount(event.paid_amount)}
                  {event.comment ? ` · « ${event.comment} »` : ''}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {dialog === 'close' ? (
        <ReasonDialog
          open
          title="Clôturer la journée"
          description={`Les totaux du ${formatLongDay(invoice.invoice_date)} seront figés (${formatAmount(invoice.totals.net_amount)} net, ${formatAmount(invoice.totals.paid_amount)} encaissés). Aucune vente ne pourra plus être ajoutée ni annulée à cette date sans réouverture tracée. La clôture ne modifie ni les ventes, ni les paiements, ni le stock.`}
          label="Commentaire"
          required={false}
          confirmLabel="Clôturer"
          tone="primary"
          loading={close.isPending}
          error={error}
          onConfirm={(value) => void onConfirmClose(value)}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === 'reopen' ? (
        <ReasonDialog
          open
          title="Rouvrir la journée"
          description="La facture redeviendra provisoire et les ventes de cette date pourront être corrigées. La réouverture est enregistrée avec votre compte, la date et le motif."
          label="Motif de la réouverture"
          required
          confirmLabel="Rouvrir"
          tone="warning"
          loading={reopen.isPending}
          error={error}
          onConfirm={(value) => void onConfirmReopen(value)}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </Card>
  )
}
