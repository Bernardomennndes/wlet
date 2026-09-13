import { translateRemoteError } from '@wlet/services/shared/domain/errors'

export type StoredCountLabel = { kind: 'value' | 'loading' | 'error'; text: string }

/**
 * O que o campo "Arquivos guardados" mostra — e são TRÊS estados, não dois.
 *
 * `undefined` significava só uma coisa para a tela: carregando. Mas `retry` desiste depois de duas
 * tentativas (`providers/query.tsx`), e a partir daí `stored` fica `undefined` PARA SEMPRE — então
 * "Contando…" passava a mentir: a leitura voltou, com falha. Quem lê ficava esperando um número que
 * não vem, sem nada indicando que o botão "Atualizar" ao lado é o que resolve.
 *
 * A ordem dos ramos é o invariante, e é o que o teste tranca: **erro vence carregando**, porque os
 * dois têm `stored === undefined` e só um deles é verdade. Inverter a ordem devolve o defeito.
 *
 * A tradução é a MESMA das escritas (`translateRemoteError`, o handler global do provider e o
 * `persist` dos filtros usam esta função): "sua sessão expirou" e "o servidor não respondeu" pedem
 * coisas diferentes de quem lê, e um texto fixo apagaria a diferença.
 *
 * Existe como função, e não como ternário no JSX, porque é o que torna o invariante verificável sem
 * navegador — o critério da §1 de `component-construction.md` é comportamental, e três estados com
 * uma ordem que importa são comportamento.
 */
export function storedCountLabel(stored: number | undefined, error: unknown): StoredCountLabel {
  if (error) return { kind: 'error', text: translateRemoteError(error).message }
  if (stored === undefined) return { kind: 'loading', text: 'Contando…' }
  return { kind: 'value', text: stored === 0 ? 'nenhum' : String(stored) }
}
