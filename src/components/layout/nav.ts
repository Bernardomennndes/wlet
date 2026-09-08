export interface NavItem {
  to: string
  label: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/**
 * A árvore de navegação, numa fonte só. Ela desenha a barra lateral, nomeia o nó de
 * domínio da trilha e dá o título do documento de cada rota — três leituras do mesmo
 * rótulo, que separadas divergiriam sem nenhum sensor para avisar.
 *
 * **Os itens não têm ícone.** Dez rótulos curtos e sem ambiguidade não precisam de um segundo
 * canal: o ícone teria de carregar a distinção entre "Pagamentos" e "Cobranças", que são
 * adjacentes e simétricos, e num par assim ele vira ruído — a tentativa de desenhá-los como
 * mão-para-cima e mão-para-baixo produziu duas marcas que a 16px se confundiam.
 *
 * **O GRUPO passou a fazer esse trabalho.** Ele separa por PERGUNTA, que é o eixo do app
 * inteiro: o que eu tenho, o que aconteceu, o que está em aberto, o que vem. Um rótulo de
 * grupo distingue quatro blocos de uma vez e não some quando a lista cresce, ao contrário de
 * dez glifos que vão ficando parecidos.
 */
export const NAV: NavGroup[] = [
  {
    label: 'Painéis',
    items: [
      { to: '/', label: 'Visão geral' },
      { to: '/patrimonio', label: 'Patrimônio' },
    ],
  },
  {
    label: 'Lançamentos',
    items: [
      { to: '/transacoes', label: 'Transações' },
      { to: '/categorias', label: 'Categorias' },
      { to: '/contas', label: 'Contas' },
      { to: '/transferencias', label: 'Transferências' },
    ],
  },
  {
    label: 'Compromissos',
    items: [
      { to: '/pagamentos', label: 'Pagamentos' },
      { to: '/cobrancas', label: 'Cobranças' },
    ],
  },
  {
    label: 'Planejamento',
    items: [
      { to: '/previsao', label: 'Previsão' },
      { to: '/planos', label: 'Planos' },
    ],
  },
]

/**
 * Todo item, achatado.
 *
 * A trilha pergunta "que rota governa esta URL?", e para ela o grupo não existe — agrupar é
 * decisão da barra lateral. Sem este achatamento, `navItemFor` teria de conhecer a forma da
 * árvore, e os dois passariam a mudar juntos sem precisar.
 */
const ITEMS: NavItem[] = NAV.flatMap((group) => group.items)

/** O item de navegação que governa uma URL. `/` casa só com ela mesma. */
export function navItemFor(pathname: string): NavItem | undefined {
  return ITEMS.find((item) => (item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`)))
}
