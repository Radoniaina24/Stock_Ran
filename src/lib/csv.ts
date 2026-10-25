import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_RECORD_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  type PaymentRow,
  type SaleBalance,
  type StockMovement,
} from '../types/database'

type AuthorLabel = (userId: string | null) => string

const rawAuthor: AuthorLabel = (userId) => userId ?? ''

const TYPE_LABELS: Record<StockMovement['type'], string> = {
  entry: 'Entrée',
  exit: 'Sortie',
  adjustment: 'Ajustement',
}

function escapeCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

/**
 * Convertit les mouvements en CSV (séparateur `;`, encodage UTF-8 avec BOM
 * pour être lisible directement dans Excel).
 */
export function movementsToCsv(rows: StockMovement[], authorLabel: AuthorLabel = rawAuthor): string {
  const header = [
    'Date et heure',
    'Référence produit',
    'Nom du produit',
    'Type',
    'Quantité',
    'Stock avant',
    'Stock après',
    'Motif',
    'Commentaire',
    'Utilisateur',
  ]

  const lines = rows.map((row) =>
    [
      new Date(row.created_at).toLocaleString('fr-FR'),
      row.product_reference,
      row.product_name,
      TYPE_LABELS[row.type] ?? row.type,
      row.quantity,
      row.quantity_before,
      row.quantity_after,
      row.reason,
      row.comment ?? '',
      authorLabel(row.created_by),
    ]
      .map(escapeCell)
      .join(';'),
  )

  return [header.map(escapeCell).join(';'), ...lines].join('\r\n')
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([`\uFEFF${content}`], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportMovementsCsv(rows: StockMovement[], authorLabel: AuthorLabel = rawAuthor): void {
  const stamp = new Date().toISOString().slice(0, 10)
  downloadTextFile(`mouvements-${stamp}.csv`, movementsToCsv(rows, authorLabel), 'text/csv')
}

function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((cells) => cells.map(escapeCell).join(';')).join('\r\n')
}

export function salesToCsv(rows: SaleBalance[], authorLabel: AuthorLabel = rawAuthor): string {
  return toCsv(
    [
      'Référence',
      'Date',
      'Code client',
      'Client',
      'Montant brut',
      'Remise',
      'Montant net',
      'Encaissé',
      'Reste dû',
      'Paiement',
      'Commentaire',
      'Créée par',
      'Annulée par',
    ],
    rows.map((row) => [
      row.reference,
      row.sale_date,
      row.client_code ?? '',
      row.client_name ?? '',
      row.subtotal,
      row.discount_amount,
      row.total_amount,
      row.paid_amount,
      row.balance_due,
      PAYMENT_STATUS_LABELS[row.payment_status] ?? row.payment_status,
      row.comment ?? '',
      authorLabel(row.created_by),
      row.cancelled_by ? authorLabel(row.cancelled_by) : '',
    ]),
  )
}

export function paymentsToCsv(rows: PaymentRow[], authorLabel: AuthorLabel = rawAuthor): string {
  return toCsv(
    [
      'Référence',
      'Date et heure',
      'Vente',
      'Client',
      'Montant',
      'Moyen',
      'Transaction',
      'Statut',
      'Commentaire',
      'Encaissé par',
      'Annulé par',
    ],
    rows.map((row) => [
      row.reference,
      new Date(row.paid_at).toLocaleString('fr-FR'),
      row.sale_reference,
      row.client_name ?? '',
      row.amount,
      PAYMENT_METHOD_LABELS[row.payment_method] ?? row.payment_method,
      row.transaction_reference ?? '',
      PAYMENT_RECORD_STATUS_LABELS[row.status] ?? row.status,
      row.cancel_comment ?? row.comment ?? '',
      authorLabel(row.created_by),
      row.cancelled_by ? authorLabel(row.cancelled_by) : '',
    ]),
  )
}

export function exportSalesCsv(rows: SaleBalance[], authorLabel: AuthorLabel = rawAuthor): void {
  const stamp = new Date().toISOString().slice(0, 10)
  downloadTextFile(`ventes-${stamp}.csv`, salesToCsv(rows, authorLabel), 'text/csv')
}

export function exportPaymentsCsv(rows: PaymentRow[], authorLabel: AuthorLabel = rawAuthor): void {
  const stamp = new Date().toISOString().slice(0, 10)
  downloadTextFile(`paiements-${stamp}.csv`, paymentsToCsv(rows, authorLabel), 'text/csv')
}
