import { Skeleton, SkeletonGroup } from './skeleton'
import { cn } from '../../lib/utils'

/** Squelette « cartes sur mobile, tableau dès @3xl » des listes commerciales. */
export function ListSkeleton({
  label,
  rows = 6,
  avatar = 'rounded-full',
}: {
  label: string
  rows?: number
  avatar?: string
}) {
  return (
    <SkeletonGroup label={label}>
      <ul className="grid grid-cols-1 gap-3 p-4 @xl:grid-cols-2 @3xl:hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="rounded-xl border border-border p-4">
            <div className="flex items-start gap-3">
              <Skeleton className={cn('size-9', avatar)} />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
            <div className="mt-3 flex justify-between">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden @3xl:block">
        <div className="flex gap-6 bg-muted/60 px-4 py-3.5">
          {['w-40', 'w-20', 'w-24', 'w-28', 'w-16'].map((width, i) => (
            <Skeleton key={i} className={cn('h-3 bg-muted', width, i === 0 && 'me-auto')} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-t border-border px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Skeleton className={cn('size-9 shrink-0', avatar)} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-full max-w-44" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-24" />
            <div className="w-28 space-y-1.5">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  )
}
