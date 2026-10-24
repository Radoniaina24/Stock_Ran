import { useSearchParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/card'
import { MovementForm } from '../components/stock/MovementForm'
import { RecentMovementsCard } from '../components/stock/RecentMovementsCard'
import type { MovementType } from '../types/database'

const KIND_PARAMS: Record<string, MovementType> = {
  entree: 'entry',
  sortie: 'exit',
  ajustement: 'adjustment',
}

export function MovementsPage() {
  const [searchParams] = useSearchParams()
  const initialKind = KIND_PARAMS[searchParams.get('type') ?? ''] ?? 'entry'
  const initialProductId = searchParams.get('produit') ?? ''

  return (
    <div className="w-full">
      <PageHeader
        title="Mouvements de stock"
        description="Enregistrez les entrées, sorties et ajustements. Chaque opération met à jour le stock instantanément et reste tracée dans l’historique."
      />

      <Card className="overflow-hidden rounded-xl">
        <MovementForm initialKind={initialKind} initialProductId={initialProductId} />
      </Card>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
        Le stock ne peut jamais devenir négatif : les opérations sont validées côté base de données.
      </p>

      <div className="mt-6">
        <RecentMovementsCard />
      </div>
    </div>
  )
}
