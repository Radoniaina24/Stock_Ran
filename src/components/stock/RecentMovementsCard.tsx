import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { EmptyState, ErrorState, LoadingState } from '../ui/states'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import { supabaseErrorMessage } from '../../lib/supabase'
import { formatDate, formatQuantity } from '../../lib/utils'
import { useAuth } from '../../hooks/useAuth'
import { useRecentMovements } from '../../hooks/useMovements'
import { MovementBadge } from './MovementBadge'

export interface RecentMovementsCardProps {
  limit?: number
  showHistoryLink?: boolean
}

export function RecentMovementsCard({ limit = 8, showHistoryLink = true }: RecentMovementsCardProps) {
  const recent = useRecentMovements(limit)
  const navigate = useNavigate()
  const { user } = useAuth()
  const userEmail = user?.email ?? '—'

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Derniers mouvements</CardTitle>
          <CardDescription>Les {limit} dernières opérations enregistrées.</CardDescription>
        </div>
        {showHistoryLink ? (
          <Button variant="outline" size="sm" onClick={() => navigate('/historique')}>
            Voir l’historique
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {recent.isLoading ? (
          <LoadingState />
        ) : recent.isError ? (
          <ErrorState
            message={supabaseErrorMessage(recent.error)}
            onRetry={() => void recent.refetch()}
          />
        ) : (recent.data ?? []).length === 0 ? (
          <EmptyState
            title="Aucun mouvement enregistré."
            description="Les entrées et sorties apparaîtront ici."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date et heure</TableHead>
                <TableHead>Produit</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-end">Quantité</TableHead>
                <TableHead>Motif</TableHead>
                <TableHead className="hidden sm:table-cell">Utilisateur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(recent.data ?? []).map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(movement.created_at)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {movement.product_name}
                    <span className="ms-2 font-mono text-xs text-muted-foreground">
                      {movement.product_reference}
                    </span>
                  </TableCell>
                  <TableCell>
                    <MovementBadge type={movement.type} />
                  </TableCell>
                  <TableCell className="text-end font-medium">
                    {formatQuantity(movement.quantity)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{movement.reason}</TableCell>
                  <TableCell
                    className="hidden max-w-40 truncate text-muted-foreground sm:table-cell"
                    title={userEmail}
                  >
                    {userEmail}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
