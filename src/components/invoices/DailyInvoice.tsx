import { forwardRef, useMemo, type CSSProperties, type ReactNode } from 'react'
import {
  PAPER_FORMATS,
  formatDateTimeInZone,
  formatLongDay,
  formatTicketNumber,
  formatTimeInZone,
  groupInvoiceByClient,
  type InvoiceClientGroup,
  type PaperWidth,
} from '../../lib/dailyInvoice'
import { formatAmount, formatQuantity } from '../../lib/utils'
import type { DailyInvoiceData, DailyInvoiceSale } from '../../types/database'
import './daily-invoice-print.css'

export interface InvoiceEstablishment {
  name: string
  address: string | null
  phone: string | null
}

export interface DailyInvoiceProps {
  data: DailyInvoiceData
  establishment: InvoiceEstablishment
  timeZone: string
  paper: PaperWidth
  /** Horodatage imprimé : génération, dernière actualisation ou clôture. */
  stampLabel: string
  stampAt: string
  /** Mention d'état imprimée sous l'en-tête (provisoire, clôturée…). */
  statusNote?: string
}

function Row({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={className ? `di-row ${className}` : 'di-row'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function SaleLines({
  sale,
  narrow,
  showHeading,
  timeZone,
}: {
  sale: DailyInvoiceSale
  narrow: boolean
  showHeading: boolean
  timeZone: string
}) {
  const columns = narrow ? 3 : 4
  const discount = Number(sale.discount_amount)

  return (
    <tbody>
      {showHeading ? (
        <tr className="di-sale-heading">
          <td colSpan={columns - 1}>
            {sale.reference} · {formatTimeInZone(sale.created_at, timeZone)}
          </td>
          <td className="di-num">{formatTicketNumber(sale.total_amount)}</td>
        </tr>
      ) : null}
      {sale.items.map((item) =>
        narrow ? (
          <ItemNarrow key={item.id} item={item} />
        ) : (
          <tr key={item.id}>
            <td className="di-name">{item.product_name}</td>
            <td className="di-num">{formatQuantity(item.quantity)}</td>
            <td className="di-num">{formatTicketNumber(item.unit_price)}</td>
            <td className="di-num">{formatTicketNumber(item.line_total)}</td>
          </tr>
        ),
      )}
      {showHeading && discount > 0 ? (
        <tr className="di-discount">
          <td colSpan={columns - 1}>Remise {sale.reference}</td>
          <td className="di-num">-{formatTicketNumber(discount)}</td>
        </tr>
      ) : null}
    </tbody>
  )
}

function ItemNarrow({ item }: { item: DailyInvoiceSale['items'][number] }) {
  return (
    <>
      <tr className="di-item-name">
        <td colSpan={3} className="di-name">
          {item.product_name}
        </td>
      </tr>
      <tr className="di-item-values">
        <td className="di-num">{formatQuantity(item.quantity)}</td>
        <td className="di-num">{formatTicketNumber(item.unit_price)}</td>
        <td className="di-num">{formatTicketNumber(item.line_total)}</td>
      </tr>
    </>
  )
}

function ClientBlock({
  group,
  narrow,
  timeZone,
}: {
  group: InvoiceClientGroup
  narrow: boolean
  timeZone: string
}) {
  const multiple = group.sales.length > 1

  return (
    <section className="di-client" aria-label={`Client ${group.clientName}`}>
      <p>
        <strong>Client :</strong> {group.clientName}
        {group.clientCode ? ` (${group.clientCode})` : null}
      </p>
      <p>
        <strong>Vente{multiple ? 's' : ''} :</strong> {group.references.join(', ')}
      </p>

      <table className={narrow ? 'di-table di-table-narrow' : 'di-table'}>
        {narrow ? (
          <colgroup>
            <col className="di-col-qty" />
            <col className="di-col-price" />
            <col className="di-col-total" />
          </colgroup>
        ) : (
          <colgroup>
            <col className="di-col-product" />
            <col className="di-col-qty" />
            <col className="di-col-price" />
            <col className="di-col-total" />
          </colgroup>
        )}
        <thead>
          {narrow ? (
            <>
              <tr>
                <th colSpan={3} className="di-left">
                  Produit
                </th>
              </tr>
              <tr>
                <th>Qté</th>
                <th>P.U.</th>
                <th>Total</th>
              </tr>
            </>
          ) : (
            <tr>
              <th className="di-left">Produit</th>
              <th>Qté</th>
              <th>P.U.</th>
              <th>Total</th>
            </tr>
          )}
        </thead>
        {group.sales.map((sale) => (
          <SaleLines key={sale.id} sale={sale} narrow={narrow} showHeading={multiple} timeZone={timeZone} />
        ))}
      </table>

      <dl className="di-subtotals">
        <Row label="Sous-total" value={formatAmount(group.subtotal)} />
        {group.discount > 0 ? <Row label="Remise" value={`-${formatAmount(group.discount)}`} /> : null}
        <Row label="Total net" value={formatAmount(group.net)} className="di-strong" />
        <Row label="Payé" value={formatAmount(group.paid)} />
        <Row
          label="Reste à payer"
          value={formatAmount(group.balance)}
          className={group.balance > 0 ? 'di-strong' : undefined}
        />
      </dl>
    </section>
  )
}

/**
 * Facture journalière récapitulative au format ticket de caisse.
 * Composant purement présentationnel : il n'écrit jamais en base.
 */
export const DailyInvoice = forwardRef<HTMLDivElement, DailyInvoiceProps>(
  ({ data, establishment, timeZone, paper, stampLabel, stampAt, statusNote }, ref) => {
    const format = PAPER_FORMATS[paper]
    const narrow = paper === '58'
    const groups = useMemo(() => groupInvoiceByClient(data.sales), [data.sales])
    const totals = data.totals

    const style = {
      '--di-paper': `${format.paperMm}mm`,
      '--di-printable': `${format.printableMm}mm`,
      '--di-font': `${format.fontPx}px`,
    } as CSSProperties

    return (
      <div ref={ref} className="di-paper" data-paper={paper} style={style}>
        <header className="di-header">
          {establishment.name ? <p className="di-shop">{establishment.name}</p> : null}
          {establishment.address ? <p>{establishment.address}</p> : null}
          {establishment.phone ? <p>Tél. {establishment.phone}</p> : null}
          <p className="di-title">FACTURE JOURNALIÈRE RÉCAPITULATIVE</p>
          <dl className="di-meta">
            <Row label="N°" value={data.invoice_number} />
            <Row label="Date" value={formatLongDay(data.invoice_date)} />
            <Row label={stampLabel} value={formatDateTimeInZone(stampAt, timeZone)} />
          </dl>
          {statusNote ? <p className="di-note">{statusNote}</p> : null}
        </header>

        {groups.length === 0 ? (
          <p className="di-empty">Aucune vente validée pour cette date.</p>
        ) : (
          groups.map((group) => (
            <ClientBlock key={group.clientId} group={group} narrow={narrow} timeZone={timeZone} />
          ))
        )}

        <section className="di-totals" aria-label="Totaux de la journée">
          <p className="di-section-title">TOTAUX DE LA JOURNÉE</p>
          <dl>
            <Row label="Clients" value={formatTicketNumber(totals.clients_count)} />
            <Row label="Ventes validées" value={formatTicketNumber(totals.sales_count)} />
            <Row label="Articles vendus" value={formatQuantity(totals.items_quantity)} />
            <Row label="Total brut" value={formatAmount(totals.gross_amount)} />
            <Row label="Remises" value={`-${formatAmount(totals.discount_amount)}`} />
            <Row label="TOTAL NET" value={formatAmount(totals.net_amount)} className="di-strong di-grand" />
            <Row label="Encaissé" value={formatAmount(totals.paid_amount)} className="di-strong" />
            <Row label="Reste à payer" value={formatAmount(totals.balance_due)} className="di-strong" />
          </dl>
          {data.cancelled_sales_count > 0 ? (
            <p className="di-small">
              Vente{data.cancelled_sales_count > 1 ? 's' : ''} annulée{data.cancelled_sales_count > 1 ? 's' : ''}{' '}
              exclue{data.cancelled_sales_count > 1 ? 's' : ''} : {data.cancelled_sales_count}
            </p>
          ) : null}
        </section>

        <footer className="di-footer">
          Document récapitulatif journalier — les ventes individuelles restent consultables dans l’application
        </footer>
      </div>
    )
  },
)
DailyInvoice.displayName = 'DailyInvoice'
