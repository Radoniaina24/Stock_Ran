import { Suspense, useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { LayoutGrid, LogOut } from 'lucide-react'
import { Brand, NavList, SidebarFooter } from './Sidebar'
import { isNavItemActive, MOBILE_PRIMARY_PATHS, NAV_ITEMS } from './nav'
import { cn } from '../../lib/utils'
import { useAuth } from '../../hooks/useAuth'
import { useRealtimeSync } from '../../hooks/useRealtimeSync'
import { LoadingState } from '../ui/states'
import { SyncIndicator } from './SyncIndicator'

const PRIMARY_ITEMS = NAV_ITEMS.filter((item) =>
  (MOBILE_PRIMARY_PATHS as readonly string[]).includes(item.to),
)
const SECONDARY_ITEMS = NAV_ITEMS.filter((item) => !PRIMARY_ITEMS.includes(item))

const TAB_CLASS =
  'flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 px-1 py-2 text-center text-[11px] font-medium leading-tight transition-colors outline-none focus-visible:bg-muted'

function MobileNav() {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const secondaryActive = SECONDARY_ITEMS.some((item) => isNavItemActive(item, location))

  useEffect(() => {
    if (!moreOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [moreOpen])

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <div
            className="absolute inset-0 animate-overlay-in bg-slate-900/40 backdrop-blur-[2px]"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div
            id="mobile-more-menu"
            className="absolute inset-x-0 bottom-0 animate-sheet-in rounded-t-2xl border-t border-border bg-card px-4 pt-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] shadow-2xl motion-reduce:animate-none"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
            <p className="mb-3 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Tous les modules
            </p>
            <nav aria-label="Autres modules" className="grid grid-cols-3 gap-2">
              {SECONDARY_ITEMS.map((item) => {
                const Icon = item.icon
                const active = isNavItemActive(item, location)
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                      active
                        ? 'border-primary/30 bg-primary-soft text-primary'
                        : 'border-border text-foreground hover:bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-9 items-center justify-center rounded-lg',
                        active ? 'bg-card text-primary' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="leading-tight">{item.label}</span>
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Navigation mobile"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {PRIMARY_ITEMS.map((item) => {
          const Icon = item.icon
          const active = !moreOpen && isNavItemActive(item, location)
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMoreOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={cn(TAB_CLASS, active ? 'text-primary' : 'text-muted-foreground')}
            >
              <Icon className="size-5" />
              <span className="w-full truncate">{item.to === '/' ? 'Accueil' : item.label}</span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          className={cn(TAB_CLASS, moreOpen || secondaryActive ? 'text-primary' : 'text-muted-foreground')}
        >
          <LayoutGrid className="size-5" />
          <span>Plus</span>
        </button>
      </nav>
    </>
  )
}

export function AppLayout() {
  const { signOut } = useAuth()
  const syncStatus = useRealtimeSync()

  return (
    <div className="min-h-svh">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-60 flex-col border-e border-border bg-card md:flex">
        <div className="flex h-14 items-center border-b border-border">
          <Brand />
        </div>
        <NavList className="py-4" />
        <div className="mt-auto px-6 pb-2">
          <SyncIndicator status={syncStatus} />
        </div>
        <SidebarFooter />
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          <SyncIndicator status={syncStatus} />
          <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Se déconnecter"
          className="cursor-pointer rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <main className="px-4 py-6 pb-24 md:ms-60 md:pb-10">
        <div className="w-full">
          <Suspense fallback={<LoadingState label="Chargement de la page…" />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      <MobileNav />
    </div>
  )
}
