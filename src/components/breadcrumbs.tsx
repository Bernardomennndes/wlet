import { Link, useLocation } from 'react-router'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { navItemFor } from '@/components/layout/nav'

export interface TrailNode {
  label: string
  /** Sem `to` o nó é a página atual. O último da trilha nunca tem. */
  to?: string
}

/**
 * A trilha de navegação da página. Ela é a volta — não existe botão de voltar —, e por ser
 * link de verdade abre em nova aba, mostra o destino na barra de status e é anunciada como
 * "link", não como "botão", para uma ação que é navegação.
 *
 * O componente prefixa "Início" e o nó do domínio, lido da mesma lista que desenha a barra
 * lateral; `trail` é só o que vem depois do domínio. Em tela de nível 1 ele fica vazio.
 *
 * O `aria-label` do registry vem em inglês ("breadcrumb") e é sobrescrito aqui: texto que
 * chega ao usuário, leitor de tela incluído, é pt-BR.
 */
export function Breadcrumbs({ trail = [] }: { trail?: TrailNode[] }) {
  const { pathname } = useLocation()
  const domain = navItemFor(pathname)

  // Na raiz, "Início" e o domínio são o mesmo nó — repeti-lo daria "Início / Visão geral"
  // apontando duas vezes para a mesma URL.
  const nodes: TrailNode[] = domain && domain.to !== '/' ? [{ label: 'Início', to: '/' }, { label: domain.label, to: domain.to }, ...trail] : [{ label: 'Início' }, ...trail]

  return (
    <Breadcrumb aria-label="Trilha de navegação">
      <BreadcrumbList>
        {nodes.map((node, i) => {
          const isLast = i === nodes.length - 1
          return (
            <BreadcrumbItem key={`${node.label}-${node.to ?? 'atual'}`}>
              {isLast || !node.to ? <BreadcrumbPage>{node.label}</BreadcrumbPage> : <BreadcrumbLink render={<Link to={node.to} />}>{node.label}</BreadcrumbLink>}
              {isLast ? null : <BreadcrumbSeparator />}
            </BreadcrumbItem>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
