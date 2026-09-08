import { useEffect } from 'react'

/**
 * Sufixo fixo: a aba diz de que aplicação a página é, e o histórico fica legível.
 *
 * A grafia é a do LOGOTIPO — o mesmo "WLET" em versalete mono que a barra lateral desenha.
 * Uma aba escrita de um jeito e a marca na tela de outro dariam à mesma aplicação dois nomes.
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
