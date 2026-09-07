import { ArrowLeftRight, CalendarClock, HandCoins, Landmark, LayoutDashboard, List, PieChart, Receipt, TrendingUp, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

/**
 * A árvore de navegação, numa fonte só. Ela desenha a barra lateral, nomeia o nó de
 * domínio da trilha e dá o título do documento de cada rota — três leituras do mesmo
 * rótulo, que separadas divergiriam sem nenhum sensor para avisar.
 */
export const NAV: NavItem[] = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard },
  { to: '/transacoes', label: 'Transações', icon: List },
  { to: '/categorias', label: 'Categorias', icon: PieChart },
  { to: '/contas', label: 'Contas', icon: Landmark },
  { to: '/transferencias', label: 'Transferências', icon: ArrowLeftRight },
  { to: '/patrimonio', label: 'Patrimônio', icon: TrendingUp },
  { to: '/pagamentos', label: 'Pagamentos', icon: Receipt },
  { to: '/cobrancas', label: 'Cobranças', icon: HandCoins },
  { to: '/previsao', label: 'Previsão', icon: CalendarClock },
]

/** O item de navegação que governa uma URL. `/` casa só com ela mesma. */
export function navItemFor(pathname: string): NavItem | undefined {
  return NAV.find((item) => (item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`)))
}
