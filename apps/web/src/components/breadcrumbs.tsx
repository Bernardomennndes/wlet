import { Link, useLocation } from 'react-router'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@wlet/ui/components/breadcrumb'
import { navItemFor } from '@/components/layout/nav'

export interface TrailNode {
  label: string
  /** Sem `to` o nó é a página atual. O último da trilha nunca tem. */
  to?: string
}

/**
 * A trilha de navegação, na BARRA da aplicação — não acima do `<h1>` de cada página.
 *
 * Ela é a volta — não existe botão de voltar —, e por ser link de verdade abre em nova aba,
 * mostra o destino na barra de status e é anunciada como "link", não como "botão", para uma
 * ação que é navegação.
 *
 * O lugar mudou porque a natureza dela é chrome, não conteúdo: montada em dez `-content.tsx`,
 * ela empurrava o título de toda tela para baixo e gastava uma linha do primeiro scroll. O
 * `<nav aria-label>` continua sendo um landmark próprio onde quer que ele esteja; o que muda é
 * que agora ele é persistente, e passa a nomear a página justamente quando a barra lateral
 * está escondida.
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
  // apontando duas vezes para a mesma URL. O nó único usa o rótulo da NAVEGAÇÃO, não a palavra
  // "Início": a barra lateral e o `<h1>` chamam essa rota de "Visão geral", e na barra da
  // aplicação a trilha fica visível o tempo todo — um terceiro nome para a mesma tela, sempre
  // na tela, é o tipo de divergência que ninguém consegue ignorar. "Início" segue sendo o
  // rótulo do LINK de volta nas telas de dentro, onde ele nomeia o destino e não a página.
  const nodes: TrailNode[] = domain && domain.to !== '/' ? [{ label: 'Início', to: '/' }, { label: domain.label, to: domain.to }, ...trail] : [{ label: domain?.label ?? 'Início' }, ...trail]

  return (
    <Breadcrumb aria-label="Trilha de navegação">
      <BreadcrumbList>
        {nodes.map((node, i) => {
          const isLast = i === nodes.length - 1
          return (
            <BreadcrumbItem key={`${node.label}-${node.to ?? 'atual'}`}>
              {isLast || !node.to ? <BreadcrumbPage>{node.label}</BreadcrumbPage> : <BreadcrumbLink render={<Link to={node.to} />}>{node.label}</BreadcrumbLink>}
              {/* O separador é uma BARRA, não o chevron padrão do registry.
                  A barra é o separador de caminho — é o que a própria URL usa —, então ela
                  diz "um nível dentro do outro" sem precisar de um glifo desenhado para
                  isso. Sendo texto e não SVG, ela senta na linha de base dos rótulos em vez
                  de flutuar ao lado deles. Passa por `children` para o arquivo do registry
                  ficar intacto. */}
              {isLast ? null : <BreadcrumbSeparator>/</BreadcrumbSeparator>}
            </BreadcrumbItem>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
