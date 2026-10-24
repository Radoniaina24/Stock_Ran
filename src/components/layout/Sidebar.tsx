import { NavLink } from 'react-router-dom'
import { Boxes, LogOut } from 'lucide-react'
import { NAV_ITEMS } from './nav'
import { cn } from '../../lib/utils'
import { useAuth } from '../../hooks/useAuth'
import { usePreferences } from '../../hooks/usePreferences'

export function NavList({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  return (
    <nav className={cn('flex flex-col gap-1 px-3', className)} aria-label="Navigation principale">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-soft text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            }
          >
            <Icon className="size-4 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

export function Brand() {
  const { preferences } = usePreferences()

  return (
    <div className="flex items-center gap-2 px-3">
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Boxes className="size-4" />
      </span>
      <span className="truncate text-sm font-semibold text-foreground">{preferences.appName}</span>
    </div>
  )
}

export function SidebarFooter() {
  const { user, signOut } = useAuth()
  const email = user?.email ?? '—'

  return (
    <div className="mt-auto border-t border-border p-3">
      <p className="truncate px-3 pb-2 text-xs text-muted-foreground" title={email}>
        {email}
      </p>
      <button
        type="button"
        onClick={() => void signOut()}
        className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <LogOut className="size-4" />
        Se déconnecter
      </button>
    </div>
  )
}
