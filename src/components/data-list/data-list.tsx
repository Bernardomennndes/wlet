import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Lista de leitura por ITEM, a alternativa à data table. A semântica é metade da razão de
 * escolher lista: com `<ul>` o leitor de tela anuncia "lista, N itens" e navega item a item,
 * e `<dt>`/`<dd>` fazem ouvir "Cobertura, 09/01/2026" em vez de dois textos soltos.
 *
 * Os itens ficam colados, divididos por 1px — nunca cartões soltos.
 */

export function DataList({ children, className, ...props }: { children: ReactNode; className?: string; 'aria-label': string }) {
  return (
    <ul className={cn('divide-y divide-border overflow-hidden rounded-lg ring-1 ring-foreground/10', className)} {...props}>
      {children}
    </ul>
  )
}

/**
 * Um item. `selected` é o destaque do item aberto, declarado como estado e não escrito em
 * `className` no call site — assim a cor do destaque existe num lugar só.
 *
 * O item aceita os atributos de `<li>` porque uma lista de drill-down responde ao clique na
 * linha inteira. Isso é conveniência de mouse: quem chega pelo teclado ou por leitor de tela
 * usa o botão dentro do item, que é o alvo focável e o que carrega o `aria-expanded`.
 */
export function DataListItem({ children, className, selected, ...props }: ComponentProps<'li'> & { selected?: boolean }) {
  return (
    <li data-state={selected ? 'selected' : undefined} className={cn('flex flex-col gap-1.5 px-4 py-3 text-xs data-[state=selected]:bg-muted/50', className)} {...props}>
      {children}
    </li>
  )
}

export function DataListItemHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-between gap-3 font-medium', className)}>{children}</div>
}

export function DataListItemFields({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('flex flex-wrap items-baseline gap-x-1 gap-y-1 text-muted-foreground', className)}>{children}</dl>
}

/**
 * Um campo é o valor que NÃO se identifica sozinho. O teste: tirando o rótulo, ainda dá para
 * dizer o que é? Se dá, não é campo — vai para o corpo do item, em muted.
 */
export function DataListField({ label, children, separator = true }: { label: ReactNode; children: ReactNode; separator?: boolean }) {
  return (
    <>
      {separator ? (
        <span aria-hidden className="px-1 text-border">
          ·
        </span>
      ) : null}
      <dt className="after:content-[',\\00a0'] after:sr-only">{label}</dt>
      <dd className="font-medium tabular-nums text-foreground">{children}</dd>
    </>
  )
}
