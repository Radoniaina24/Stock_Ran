import { NavLink } from 'react-router-dom'
import { Boxes, LogOut } from 'lucide-react'
import { NAV_ITEMS } from './nav'
import { cn, getInitials } from '../../lib/utils'
import { useAuth } from '../../hooks/useAuth'
import { usePreferences } from '../../hooks/usePreferences'

export function NavList({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  return (
    <nav className={cn('flex flex-col gap-0.5 px-3', className)} aria-label="Navigation principale">
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
                'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium outline-none transition-all duration-200',
                'focus-visible:ring-2 focus-visible:ring-primary/40',
                isActive
                  ? 'bg-primary-soft text-primary shadow-sm'
                  : 'text-muted-foreground hover:translate-x-0.5 hover:bg-muted hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Indicateur d'état actif */}
                <span
                  className={cn(
                    'absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-all duration-200',
                    isActive ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden="true"
                />
                <Icon
                  className={cn(
                    'size-4 shrink-0 transition-transform duration-200',
                    isActive ? 'scale-105' : 'group-hover:scale-105',
                  )}
                />
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

export function Brand() {
  const { preferences } = usePreferences()

  return (
    <div className="flex items-center gap-3 px-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm ring-1 ring-primary/20">
        <Boxes className="size-4.5" />
      </span>
      <span
        className="truncate text-sm font-semibold tracking-tight text-foreground"
        title={preferences.appName}
      >
        {preferences.appName}
      </span>
    </div>
  )
}

export function SidebarFooter() {
  const { user, signOut } = useAuth()
  const email = user?.email ?? '—'
  const initials = user?.email ? getInitials(user.email) : '?'

  return (
    <div className="mt-auto border-t border-border p-3">
      <div className="flex items-center gap-3 rounded-lg px-3 py-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground ring-1 ring-border">
          {initials}
        </span>
        <p className="truncate text-xs font-medium text-muted-foreground" title={email}>
          {email}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="group mt-1 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors duration-200 hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-danger/40"
      >
        <LogOut className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        Se déconnecter
      </button>
    </div>
  )
}