import { Toaster as Sonner, type ToasterProps } from 'sonner'

/**
 * O aviso de que algo foi gravado — ou de que não foi.
 *
 * **Uma instância, montada no topo da árvore.** Duas empilhariam dois avisos para a mesma escrita,
 * e a pessoa leria o mesmo texto duas vezes sem saber se aconteceu duas coisas.
 *
 * O tema NÃO vem de um provider próprio: o app já pinta `document.documentElement` com a classe
 * `dark`, e as cores saem dos tokens do tema por variável CSS. Um segundo lugar que decidisse
 * claro ou escuro divergiria do primeiro no exato momento em que a pessoa trocasse o tema.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}
