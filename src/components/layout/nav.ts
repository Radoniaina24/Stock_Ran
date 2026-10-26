import {
  ArrowDownToLine,
  ArrowUpFromLine,
  HandCoins,
  History,
  LayoutDashboard,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { Location } from 'react-router-dom'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  end?: boolean
  /**
   * Permet de différencier deux entrées partageant le même chemin
   * (entrées et sorties pointent vers /mouvements avec un paramètre).
   */
  match?: (location: Pick<Location, 'pathname' | 'search'>) => boolean
}

function movementsKind(kind: 'entree' | 'sortie') {
  return (location: Pick<Location, 'pathname' | 'search'>): boolean => {
    if (location.pathname !== '/mouvements') return false
    const current = new URLSearchParams(location.search).get('type') ?? 'entree'
    return current === kind
  }
}

/** État actif calculé ici : deux entrées peuvent partager le même chemin (?type=...). */
export function isNavItemActive(
  item: NavItem,
  location: Pick<Location, 'pathname' | 'search'>,
): boolean {
  if (item.match) return item.match(location)

  const path = item.to.split('?')[0] ?? '/'
  if (item.end) return location.pathname === path
  return location.pathname === path || location.pathname.startsWith(`${path}/`)
}

/** Entrées toujours visibles dans la barre de navigation mobile. */
export const MOBILE_PRIMARY_PATHS = ['/', '/ventes', '/produits', '/clients'] as const

export const NAV_ITEMS: NavItem[] = [
  { label: 'Tableau de bord', to: '/', icon: LayoutDashboard, end: true },
  { label: 'Produits', to: '/produits', icon: Package },
  { label: 'Clients', to: '/clients', icon: Users },
  { label: 'Ventes', to: '/ventes', icon: ShoppingCart },
  { label: 'Factures journalières', to: '/factures', icon: ReceiptText },
  { label: 'Entrées de stock', to: '/mouvements?type=entree', icon: ArrowDownToLine, match: movementsKind('entree') },
  { label: 'Sorties de stock', to: '/mouvements?type=sortie', icon: ArrowUpFromLine, match: movementsKind('sortie') },
  { label: 'Historique', to: '/historique', icon: History },
  { label: 'Paiements', to: '/paiements', icon: Wallet },
  { label: 'Créances clients', to: '/creances', icon: HandCoins },
  { label: 'Paramètres', to: '/parametres', icon: Settings },
]
