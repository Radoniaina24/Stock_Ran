import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { Brand, NavList, SidebarFooter } from './Sidebar'
import { NAV_ITEMS } from './nav'
import { cn } from '../../lib/utils'
import { useAuth } from '../../hooks/useAuth'
import { useRealtimeSync } from '../../hooks/useRealtimeSync'
import { LoadingState } from '../ui/states'

function MobileNav() {
  return (
    <nav
      aria-label="Navigation mobile"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-center text-[10px] font-medium leading-tight transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            <Icon className="size-4" />
            <span className="w-full break-words">{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

export function AppLayout() {
  const { signOut } = useAuth()
  useRealtimeSync()

  return (
    <div className="min-h-svh">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-60 flex-col border-e border-border bg-card md:flex">
        <div className="flex h-14 items-center border-b border-border">
          <Brand />
        </div>
        <NavList className="py-4" />
        <SidebarFooter />
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Se déconnecter"
          className="cursor-pointer rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" />
        </button>
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
