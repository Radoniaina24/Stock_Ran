import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useReactToPrint } from 'react-to-print'
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  HandCoins,
  Info,
  Loader2,
  Printer,
  ReceiptText,
  RefreshCw,
  ShoppingCart,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { StatCard, StatCardSkeleton } from '../components/dashboard/StatCard'
import { DailyClosingCard, type InvoiceView } from '../components/invoices/DailyClosingCard'
import { DailyInvoice } from '../components/invoices/DailyInvoice'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { SegmentedTabs } from '../components/ui/segmented'
import { Skeleton } from '../components/ui/skeleton'
import { ErrorState } from '../components/ui/states'
import { useToast } from '../components/ui/toast'
import { useDailyInvoice } from '../hooks/useDailyInvoice'
import { useEstablishment } from '../hooks/useEstablishment'
import { usePreferences } from '../hooks/usePreferences'
import { usePrintSettings } from '../hooks/usePrintSettings'
import {
  DEFAULT_TIMEZONE,
  PAPER_FORMATS,
  buildPageStyle,
  formatLongDay,
  invoiceNumber,
  isValidDay,
  pageLengthMm,
  shiftDay,
  todayInTimeZone,
  type PaperWidth,
} from '../lib/dailyInvoice'
import { supabaseErrorMessage } from '../lib/supabase'
import { formatAmount, formatQuantity } from '../lib/utils'

/** Fonctions ou tables de la migration 0010 absentes de la base. */
function isModuleMissing(error: unknown): boolean {
  const { code, message = '' } = (error ?? {}) as { code?: string; message?: string }
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42883' || code === '42P01') return true
  return /daily_invoice|establishment_settings/.test(message) && /schema cache|does not exist/.test(message)
}

function PrinterHelp() {
  return (
    <Card className="rounded-xl">
      <details className="group p-4 sm:p-5">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground">
          <Printer className="size-4 text-muted-foreground" aria-hidden="true" />
          Configurer l’imprimante thermique
          <ChevronRight className="ms-auto size-4 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <ol className="mt-3 list-decimal space-y-1.5 ps-5 text-sm text-muted-foreground">
          <li>
            Dans la fenêtre d’impression (Chrome ou Edge recommandés), choisissez l’imprimante thermique comme
            destination.
          </li>
          <li>
            <span className="text-foreground">Plus de paramètres → Format du papier</span> : rouleau 58 mm ou 80 mm,
            identique au papier sélectionné ici.
          </li>
          <li>
            <span className="text-foreground">Marges</span> : Aucune · <span className="text-foreground">Échelle</span>{' '}
            : 100 % (par défaut).
          </li>
          <li>
            Décochez <span className="text-foreground">En-têtes et pieds de page</span> (sinon l’URL et la date du
            navigateur sont imprimées).
          </li>
          <li>
            Ticket coupé ou réparti sur plusieurs pages : décochez « Ajuster la longueur au contenu » pour laisser le
            pilote gérer la longueur du rouleau. Firefox ignore ce réglage : le format choisi dans le pilote
            s’applique.
          </li>
          <li>
            Texte rogné sur les côtés : vérifiez dans les préférences du pilote que la largeur imprimable est de 48 mm
            (papier 58 mm) ou 72 mm (papier 80 mm).
          </li>
        </ol>
      </details>
    </Card>
  )
}

export function DailyInvoicePage() {
  const toast = useToast()
  const dateId = useId()
  const fitId = useId()
  const { preferences } = usePreferences()
  const establishment = useEstablishment()
  const timeZone = establishment.data?.timezone ?? DEFAULT_TIMEZONE
  const today = todayInTimeZone(timeZone)

  const [searchParams, setSearchParams] = useSearchParams()
  const requestedDate = searchParams.get('date') ?? ''
  const date = isValidDay(requestedDate) ? requestedDate : today
  const setDate = (next: string) => {
    if (!isValidDay(next)) return
    setSearchParams(next === today ? {} : { date: next }, { replace: true })
  }

  const invoice = useDailyInvoice(date)
  const [settings, updateSettings] = usePrintSettings()

  const [viewState, setViewState] = useState<{ date: string; view: InvoiceView }>({ date, view: 'frozen' })
  const view = viewState.date === date ? viewState.view : 'frozen'
  const setView = (next: InvoiceView) => setViewState({ date, view: next })

  const data = invoice.data
  const closing = data?.closing ?? null
  const showFrozen = closing?.status === 'closed' && view === 'frozen'
  const shown = data ? (showFrozen && closing ? closing.snapshot : data) : null

  const statusNote = showFrozen
    ? `JOURNÉE CLÔTURÉE — RÉVISION ${closing?.revision ?? 1}`
    : closing?.status === 'closed'
      ? 'ÉTAT ACTUEL — NON ARRÊTÉ'
      : closing?.status === 'reopened'
        ? 'PROVISOIRE — JOURNÉE ROUVERTE'
        : 'PROVISOIRE — JOURNÉE NON CLÔTURÉE'

  const header = {
    name: establishment.data?.name || preferences.appName,
    address: establishment.data?.address ?? null,
    phone: establishment.data?.phone ?? null,
  }

  // Longueur de page mesurée sur l'aperçu, rendu à la taille réelle du papier.
  const invoiceRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)
  useLayoutEffect(() => {
    const node = invoiceRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const measure = () => setContentHeight(node.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [shown])

  const pageLength = settings.fitLength && contentHeight > 0 ? pageLengthMm(contentHeight) : null

  const print = useReactToPrint({
    contentRef: invoiceRef,
    documentTitle: shown?.invoice_number ?? 'Facture journalière',
    pageStyle: buildPageStyle(settings.paper, pageLength),
    onPrintError: (_location, error) => toast.error(`Impression impossible : ${error.message}`),
  })

  const [refreshing, setRefreshing] = useState(false)
  const [printing, setPrinting] = useState(false)
  const busy = refreshing || printing

  // Impression lancée une fois les données rechargées affichées et mesurées.
  const [printRequest, setPrintRequest] = useState<number | null>(null)
  useEffect(() => {
    if (printRequest === null || invoice.dataUpdatedAt < printRequest) return
    const node = invoiceRef.current
    if (!node) return
    if (settings.fitLength && node.offsetHeight !== contentHeight) {
      setContentHeight(node.offsetHeight)
      return
    }
    setPrintRequest(null)
    setPrinting(false)
    print()
  }, [printRequest, invoice.dataUpdatedAt, contentHeight, settings.fitLength, print])

  const onRefresh = async () => {
    setRefreshing(true)
    const result = await invoice.refetch()
    setRefreshing(false)
    if (result.error) toast.error(supabaseErrorMessage(result.error))
    else toast.success('Facture actualisée.')
  }

  const onPrint = async () => {
    setPrinting(true)
    const result = await invoice.refetch()
    if (result.error || !result.data) {
      setPrinting(false)
      toast.error(supabaseErrorMessage(result.error))
      return
    }
    setPrintRequest(result.dataUpdatedAt)
  }

  const isEmpty = Boolean(shown && shown.sales.length === 0)
  const totals = shown?.totals
  const missingModule = invoice.isError && isModuleMissing(invoice.error)

  return (
    <div className="w-full" data-daily-invoice-page>
      <PageHeader
        title="Factures journalières"
        description="Une facture récapitulative unique par jour : toutes les ventes validées, regroupées par client, prête pour l’imprimante thermique."
        actions={
          <>
            <Button variant="outline" onClick={() => void onRefresh()} disabled={busy || !invoice.data}>
              <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} />
              Actualiser
            </Button>
            <Button onClick={() => void onPrint()} disabled={busy || !shown || isEmpty}>
              {printing ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
              Imprimer la facture
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="min-w-0 space-y-4">
          <Card className="space-y-4 rounded-xl p-4 sm:p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={dateId}>Date de la facture</Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Jour précédent"
                    onClick={() => setDate(shiftDay(date, -1))}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Input
                    id={dateId}
                    type="date"
                    value={date}
                    max={today}
                    onChange={(event) => setDate(event.target.value)}
                    className="w-44"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Jour suivant"
                    disabled={date >= today}
                    onClick={() => setDate(shiftDay(date, 1))}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
              {date !== today ? (
                <Button variant="ghost" onClick={() => setDate(today)}>
                  Aujourd’hui
                </Button>
              ) : null}
              <p className="w-full text-sm text-muted-foreground sm:ms-auto sm:w-auto sm:pb-2">
                <span className="inline-block font-medium text-foreground first-letter:uppercase">
                  {formatLongDay(date)}
                </span>
                {' · '}
                <span className="font-mono text-xs">{invoiceNumber(date)}</span>
              </p>
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-foreground">Papier</span>
                <SegmentedTabs<PaperWidth>
                  label="Largeur du papier"
                  value={settings.paper}
                  onChange={(paper) => updateSettings({ paper })}
                  options={(Object.keys(PAPER_FORMATS) as PaperWidth[]).map((value) => ({
                    value,
                    label: PAPER_FORMATS[value].label,
                  }))}
                  className="mx-0 px-0"
                />
              </div>
              <Checkbox
                id={fitId}
                label="Ajuster la longueur au contenu"
                checked={settings.fitLength}
                onChange={(event) => updateSettings({ fitLength: event.target.checked })}
              />
            </div>
          </Card>

          {invoice.isError ? (
            <Card className="rounded-xl">
              <ErrorState
                message={
                  missingModule
                    ? 'Le module de facturation journalière n’est pas encore installé dans Supabase : exécutez la migration supabase/migrations/0010_daily_invoices.sql puis réessayez.'
                    : supabaseErrorMessage(invoice.error)
                }
                onRetry={() => void invoice.refetch()}
              />
            </Card>
          ) : (
            <>
              <section aria-label="Synthèse de la journée" className="grid grid-cols-2 gap-3 sm:gap-4 2xl:grid-cols-4">
                {!totals ? (
                  Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)
                ) : (
                  <>
                    <StatCard
                      label="Total net des ventes"
                      value={formatAmount(totals.net_amount)}
                      icon={CircleDollarSign}
                      footer={
                        Number(totals.discount_amount) > 0
                          ? `Brut ${formatAmount(totals.gross_amount)} · remises ${formatAmount(totals.discount_amount)}`
                          : `Brut ${formatAmount(totals.gross_amount)}`
                      }
                    />
                    <StatCard
                      label="Encaissé"
                      value={formatAmount(totals.paid_amount)}
                      icon={Banknote}
                      tone="success"
                      footer="Paiements validés affectés aux ventes du jour"
                    />
                    <StatCard
                      label="Reste à payer"
                      value={formatAmount(totals.balance_due)}
                      icon={HandCoins}
                      tone={Number(totals.balance_due) > 0 ? 'danger' : 'success'}
                      footer="Créances nées ce jour"
                      to="/creances"
                    />
                    <StatCard
                      label="Ventes validées"
                      value={String(totals.sales_count)}
                      icon={ShoppingCart}
                      tone="violet"
                      footer={`${totals.clients_count} client${totals.clients_count > 1 ? 's' : ''} · ${formatQuantity(totals.items_quantity)} article${Number(totals.items_quantity) > 1 ? 's' : ''}`}
                    />
                  </>
                )}
              </section>

              {isEmpty ? (
                <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary-soft p-4 text-sm">
                  <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-foreground">Aucune vente validée le {formatLongDay(date)}.</p>
                    <p className="mt-0.5 text-muted-foreground">
                      Il n’y a rien à imprimer pour cette date. Les ventes annulées ne sont jamais incluses.{' '}
                      <Link to="/ventes" className="font-medium text-primary hover:underline">
                        Voir les ventes
                      </Link>
                    </p>
                  </div>
                </div>
              ) : null}

              {data ? (
                <DailyClosingCard invoice={data} view={view} onViewChange={setView} timeZone={timeZone} />
              ) : (
                <Card className="space-y-3 rounded-xl p-5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-9 w-44" />
                </Card>
              )}
            </>
          )}

          <PrinterHelp />
        </div>

        <Card className="rounded-xl xl:sticky xl:top-6">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ReceiptText className="size-4 text-muted-foreground" aria-hidden="true" />
              Aperçu avant impression
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {PAPER_FORMATS[settings.paper].label}
              {pageLength ? ` × ${pageLength} mm` : ''}
            </span>
          </div>
          <div className="flex min-h-64 justify-center overflow-x-auto bg-muted/60 p-4 sm:p-6" aria-busy={invoice.isFetching}>
            {shown ? (
              <DailyInvoice
                ref={invoiceRef}
                data={shown}
                establishment={header}
                timeZone={timeZone}
                paper={settings.paper}
                stampLabel={showFrozen ? 'Arrêtée le' : 'Généré le'}
                stampAt={showFrozen && closing ? closing.closed_at : shown.generated_at}
                statusNote={statusNote}
              />
            ) : invoice.isError ? (
              <p className="self-center text-sm text-muted-foreground">Aperçu indisponible.</p>
            ) : (
              <Skeleton className="h-96 w-[58mm] rounded-none" />
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
