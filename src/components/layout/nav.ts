import {
  ArrowLeftRight,
  History,
  LayoutDashboard,
  Package,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  end?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Tableau de bord', to: '/', icon: LayoutDashboard, end: true },
  { label: 'Produits', to: '/produits', icon: Package },
  { label: 'Mouvements de stock', to: '/mouvements', icon: ArrowLeftRight },
  { label: 'Historique', to: '/historique', icon: History },
  { label: 'Paramètres', to: '/parametres', icon: Settings },
]
