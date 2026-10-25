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

const KIND_COPY: Record<MovementType, { title: string; description: string }> = {
  entry: {
    title: 'Entrées de stock',
    description:
      'Enregistrez les réceptions, retours et inventaires. Chaque entrée augmente le stock et reste tracée dans l’historique.',
  },
  exit: {
    title: 'Sorties de stock',
    description:
      'Enregistrez les sorties, pertes et consommations internes. Le stock ne peut jamais devenir négatif.',
  },
  adjustment: {
    title: 'Ajustements de stock',
    description:
      'Corrigez un écart d’inventaire. Les ajustements sont autorisés et tracés comme les autres mouvements.',
  },
}

export function MovementsPage() {
  const [searchParams] = useSearchParams()
  const initialKind = KIND_PARAMS[searchParams.get('type') ?? ''] ?? 'entry'
  const initialProductId = searchParams.get('produit') ?? ''
  const copy = KIND_COPY[initialKind]

  return (
    <div className="w-full">
      <PageHeader title={copy.title} description={copy.description} />

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
