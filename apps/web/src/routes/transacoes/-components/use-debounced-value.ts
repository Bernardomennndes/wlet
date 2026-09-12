import { useEffect, useState } from 'react'

/**
 * Atrasa o valor por TEMPO: ele só se propaga quando a rajada de mudanças para.
 *
 * Não é `useDeferredValue`, que é outra coisa — aquele não atrasa, marca a atualização como não
 * urgente e o React a interrompe se algo urgente chegar. Sobre as poucas centenas de lançamentos
 * filtrados no cliente a janela dele não dura um frame, e a lista acaba refiltrando a cada tecla.
 * Com atraso por tempo o recorte roda UMA vez por rajada de digitação, que é o que serve quando a
 * busca virar server-side: lá cada tecla é uma requisição.
 *
 * O atraso vale para QUALQUER mudança do valor, inclusive o "Limpar filtros" que o zera. Abrir
 * exceção para o vazio aqui dentro é o que faria a próxima pessoa não confiar no nome do hook — se
 * incomodar, o remédio é o chamador expor um `flush`.
 *
 * Mora junto da tela porque hoje ela é a única com campo de busca; sobe para `src/hooks/` quando um
 * segundo domínio precisar dele.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    // Cada mudança cancela o disparo pendente: só o último valor da rajada sobrevive.
    return () => clearTimeout(id)
  }, [value, delayMs])

  return debounced
}
