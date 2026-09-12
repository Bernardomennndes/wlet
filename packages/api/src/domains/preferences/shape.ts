import { z } from 'zod'
import { month, scope } from '../../shared/shape'

/**
 * A origem NÃO publica schema nomeado: quem serve estas rotas é o `apps/api` desta mesma
 * árvore, e o objeto abaixo é montado no handler a partir de uma coluna `jsonb`. O nome é
 * nosso, e a junção é a do compilador — `os.router(...)` em `apps/api/src/main.ts` quebra em
 * compilação se a forma mudar aqui.
 */

/**
 * O que a pessoa escolheu na barra: recorte, período e tema.
 *
 * Os três aceitam NULO, e isso não é o mesmo que um padrão: nulo quer dizer "nunca escolheu", e
 * é o que permite ao app aplicar o padrão calculado (o período vai até o horizonte de projeção)
 * sem afirmar uma escolha que ninguém fez.
 */
export const preferencesShape = z.object({
  scope: scope.nullable(),
  period: z.object({ from: month, to: month }).nullable(),
  /** `light`/`dark` como o domínio guarda — o `?tema=claro|escuro` é da URL, não daqui. */
  theme: z.enum(['light', 'dark']).nullable(),
})

export type PreferencesShape = z.infer<typeof preferencesShape>
