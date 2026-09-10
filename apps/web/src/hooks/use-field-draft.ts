import { useCallback, useState } from 'react'

/**
 * O que se está digitando fica AQUI até o campo perder o foco.
 *
 * Sem isso, cada tecla vira uma gravação — e a gravação levanta a flag de `saving`, que a tela
 * repassa como `disabled`. Um elemento desabilitado PERDE O FOCO por decisão do navegador, e o
 * efeito medido era brutal: digitar uma letra no nome de um item mandava o foco para o `body`,
 * e a segunda letra ia para lugar nenhum. Os eventos capturados numa tecla só foram
 * `disabled -> true`, `disabled -> false`, `blur`.
 *
 * O rascunho é da LINHA inteira, não de um campo: quem edita mexe em quantidade e preço na
 * mesma passada, e um rascunho por campo faria cada troca de campo gravar. Enquanto ele existe,
 * é ele que a linha exibe — inclusive o subtotal, que assim acompanha a digitação em vez de
 * congelar até o blur.
 *
 * `null` significa "nada pendente", e é diferente de um rascunho vazio: sem essa distinção um
 * campo apagado até o fim não teria como ser gravado como vazio.
 */
export function useFieldDraft<T extends object>(committed: T, commit: (patch: Partial<T>) => void) {
  const [draft, setDraft] = useState<Partial<T> | null>(null)

  /** O que a linha deve DESENHAR: o rascunho por cima do gravado, quando há rascunho. */
  const shown = draft ? { ...committed, ...draft } : committed

  const edit = useCallback((patch: Partial<T>) => setDraft((current) => ({ ...current, ...patch })), [])

  /**
   * Sobe o rascunho. Chamado no `blur` e no Enter — o segundo porque quem digita um número e
   * aperta Enter espera que ele valha, e sem isso o valor só subiria quando o foco saísse.
   */
  const flush = useCallback(() => {
    setDraft((current) => {
      if (current) commit(current)
      return null
    })
  }, [commit])

  return { shown, edit, flush }
}
