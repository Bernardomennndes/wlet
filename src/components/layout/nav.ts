import { ArrowsLeftRight, Bank, CalendarDot, ChartPie, HandCoins, List, Receipt, SquaresFour, Target, TrendUp, type Icon as PhosphorIcon } from '@phosphor-icons/react'

export interface NavItem {
  to: string
  label: string
  icon: PhosphorIcon
}

/**
 * A árvore de navegação, numa fonte só. Ela desenha a barra lateral, nomeia o nó de
 * domínio da trilha e dá o título do documento de cada rota — três leituras do mesmo
 * rótulo, que separadas divergiriam sem nenhum sensor para avisar.
 */
export const NAV: NavItem[] = [
  { to: '/', label: 'Visão geral', icon: SquaresFour },
  { to: '/transacoes', label: 'Transações', icon: List },
  { to: '/categorias', label: 'Categorias', icon: ChartPie },
  { to: '/contas', label: 'Contas', icon: Bank },
  { to: '/transferencias', label: 'Transferências', icon: ArrowsLeftRight },
  { to: '/patrimonio', label: 'Patrimônio', icon: TrendUp },
  { to: '/pagamentos', label: 'Pagamentos', icon: Receipt },
  { to: '/cobrancas', label: 'Cobranças', icon: HandCoins },
  { to: '/previsao', label: 'Previsão', icon: CalendarDot },
  { to: '/planos', label: 'Planos', icon: Target },
]

/** O item de navegação que governa uma URL. `/` casa só com ela mesma. */
export function navItemFor(pathname: string): NavItem | undefined {
  return NAV.find((item) => (item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`)))
}
