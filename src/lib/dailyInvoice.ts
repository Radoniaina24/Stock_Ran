import type { DailyInvoiceSale, DailyInvoiceTotals } from '../types/database'

/** Fuseau de l'établissement tant qu'aucun n'est configuré. */
export const DEFAULT_TIMEZONE = 'Indian/Antananarivo'

export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Indian/Antananarivo', label: 'Madagascar (UTC+3)' },
  { value: 'Indian/Comoro', label: 'Comores (UTC+3)' },
  { value: 'Indian/Mayotte', label: 'Mayotte (UTC+3)' },
  { value: 'Indian/Reunion', label: 'La Réunion (UTC+4)' },
  { value: 'Indian/Mauritius', label: 'Maurice (UTC+4)' },
  { value: 'Africa/Nairobi', label: 'Afrique de l’Est (UTC+3)' },
  { value: 'Africa/Johannesburg', label: 'Afrique du Sud (UTC+2)' },
  { value: 'Europe/Paris', label: 'France métropolitaine' },
  { value: 'UTC', label: 'UTC' },
]

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidDay(value: string): boolean {
  const match = DAY_PATTERN.exec(value)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.toISOString().slice(0, 10) === value
}

/** Numéro stable de la facture logique d'une journée : FACT-AAAAMMJJ. */
export function invoiceNumber(day: string): string {
  return `FACT-${day.replaceAll('-', '')}`
}

/** Date AAAA-MM-JJ du jour dans le fuseau de l'établissement. */
export function todayInTimeZone(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  }
}

export function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, date! + days)).toISOString().slice(0, 10)
}

/** « lundi 26 octobre 2026 » pour une date calendaire, sans glissement de fuseau. */
export function formatLongDay(day: string): string {
  if (!isValidDay(day)) return day
  const [year, month, date] = day.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, month! - 1, date!)))
}

export function formatDateTimeInZone(value: string | null | undefined, timeZone: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }
  try {
    return new Intl.DateTimeFormat('fr-FR', { ...options, timeZone }).format(date)
  } catch {
    return new Intl.DateTimeFormat('fr-FR', options).format(date)
  }
}

export function formatTimeInZone(value: string, timeZone: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  try {
    return new Intl.DateTimeFormat('fr-FR', { ...options, timeZone }).format(date)
  } catch {
    return new Intl.DateTimeFormat('fr-FR', options).format(date)
  }
}

const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/** Montant sans devise pour les colonnes étroites du ticket. */
export function formatTicketNumber(value: number | string): string {
  const n = Number(value)
  return Number.isFinite(n) ? numberFormat.format(n) : '0'
}

/** Somme au centime près (évite les dérives des flottants). */
function addAmount(total: number, value: number | string): number {
  return Math.round((total + Number(value)) * 100) / 100
}

function addQuantity(total: number, value: number | string): number {
  return Math.round((total + Number(value)) * 1000) / 1000
}

export interface InvoiceClientGroup {
  clientId: string
  clientName: string
  clientCode: string | null
  sales: DailyInvoiceSale[]
  references: string[]
  itemsQuantity: number
  subtotal: number
  discount: number
  net: number
  paid: number
  balance: number
}

/**
 * Regroupe les ventes par client (un bloc par client, ventes conservées
 * séparément). Les achats de clients différents ne sont jamais fusionnés.
 */
export function groupInvoiceByClient(sales: DailyInvoiceSale[]): InvoiceClientGroup[] {
  const groups = new Map<string, InvoiceClientGroup>()

  for (const sale of sales) {
    let group = groups.get(sale.client_id)
    if (!group) {
      group = {
        clientId: sale.client_id,
        clientName: sale.client_name,
        clientCode: sale.client_code,
        sales: [],
        references: [],
        itemsQuantity: 0,
        subtotal: 0,
        discount: 0,
        net: 0,
        paid: 0,
        balance: 0,
      }
      groups.set(sale.client_id, group)
    }
    group.sales.push(sale)
    group.references.push(sale.reference)
    group.subtotal = addAmount(group.subtotal, sale.subtotal)
    group.discount = addAmount(group.discount, sale.discount_amount)
    group.net = addAmount(group.net, sale.total_amount)
    group.paid = addAmount(group.paid, sale.paid_amount)
    group.balance = addAmount(group.balance, sale.balance_due)
    for (const item of sale.items) group.itemsQuantity = addQuantity(group.itemsQuantity, item.quantity)
  }

  return Array.from(groups.values()).sort(
    (a, b) =>
      a.clientName.localeCompare(b.clientName, 'fr', { sensitivity: 'base' }) ||
      (a.clientCode ?? '').localeCompare(b.clientCode ?? ''),
  )
}

export const TOTAL_LABELS: Record<keyof DailyInvoiceTotals, string> = {
  clients_count: 'Clients',
  sales_count: 'Ventes validées',
  items_quantity: 'Articles vendus',
  gross_amount: 'Total brut',
  discount_amount: 'Remises',
  net_amount: 'Total net',
  paid_amount: 'Encaissé',
  balance_due: 'Reste à payer',
}

export interface TotalDifference {
  key: keyof DailyInvoiceTotals
  label: string
  frozen: number
  current: number
}

/** Écarts entre l'état figé à la clôture et l'état actuel en base. */
export function compareTotals(frozen: DailyInvoiceTotals, current: DailyInvoiceTotals): TotalDifference[] {
  return (Object.keys(TOTAL_LABELS) as (keyof DailyInvoiceTotals)[])
    .filter((key) => Number(frozen[key]) !== Number(current[key]))
    .map((key) => ({ key, label: TOTAL_LABELS[key], frozen: Number(frozen[key]), current: Number(current[key]) }))
}

// -----------------------------------------------------------------------
// Impression thermique
// -----------------------------------------------------------------------

export type PaperWidth = '58' | '80'

export interface PaperFormat {
  label: string
  /** Largeur du rouleau. */
  paperMm: number
  /** Zone réellement imprimée par la tête thermique. */
  printableMm: number
  fontPx: number
}

export const PAPER_FORMATS: Record<PaperWidth, PaperFormat> = {
  '58': { label: '58 mm', paperMm: 58, printableMm: 48, fontPx: 11 },
  '80': { label: '80 mm', paperMm: 80, printableMm: 72, fontPx: 12 },
}

export function isPaperWidth(value: unknown): value is PaperWidth {
  return value === '58' || value === '80'
}

const MM_PER_CSS_PX = 25.4 / 96

/** Longueur de page (mm) couvrant le contenu mesuré, avec une marge de coupe. */
export function pageLengthMm(heightPx: number): number {
  return Math.max(60, Math.ceil(heightPx * MM_PER_CSS_PX) + 8)
}

/**
 * Règles @page transmises à react-to-print. Sans longueur, le format de
 * papier choisi dans le pilote de l'imprimante s'applique.
 */
export function buildPageStyle(paper: PaperWidth, lengthMm: number | null): string {
  const { paperMm } = PAPER_FORMATS[paper]
  const size = lengthMm ? `size: ${paperMm}mm ${lengthMm}mm;` : ''
  return `
    @page { ${size} margin: 0; }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: ${paperMm}mm;
        background: #fff !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  `
}
