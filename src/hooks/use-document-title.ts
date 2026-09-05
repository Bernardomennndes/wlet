import { useEffect } from 'react'

/** Sufixo fixo: a aba diz de que aplicação a página é, e o histórico fica legível. */
const SUFFIX = 'Wallet'

/**
 * Título do documento da rota. Sem isto a aba mostrava "wallet" nas seis telas: navegar
 * não mudava nem a aba nem o nome da entrada no histórico do navegador.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${SUFFIX}`
  }, [title])
}
