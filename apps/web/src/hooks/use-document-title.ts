import { useEffect } from 'react'

/**
 * Sufixo fixo: a aba diz de que aplicação a página é, e o histórico fica legível.
 *
 * A grafia é a do LOGOTIPO — o mesmo "WLET" em versalete mono da tela de entrada. A barra
 * lateral não escreve mais o nome (a marca ali é só o ícone), mas o rótulo acessível do link
 * dela usa esta mesma grafia. Uma aba escrita de um jeito e a marca de outro dariam à mesma
 * aplicação dois nomes.
 */
const SUFFIX = 'WLET'

/**
 * Título do documento da rota. Sem isto a aba mostrava o `<title>` estático do `index.html`
 * em todas as telas: navegar não mudava nem a aba nem o nome da entrada no histórico.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${SUFFIX}`
  }, [title])
}
