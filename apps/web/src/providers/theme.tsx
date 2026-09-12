import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { services } from '@/services'
import { preloaded } from './preloaded'
import { ThemeContext, type ThemeValue } from './use-theme'

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Parâmetro de URL permite abrir a app já num tema: ?tema=claro */
function readUrlTheme(): 'light' | 'dark' | null {
  const themeParam = new URLSearchParams(window.location.search).get('tema')
  return themeParam === 'claro' ? 'light' : themeParam === 'escuro' ? 'dark' : null
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Do que o boot carregou, e não do armazenamento direto: ler aqui é o que mantém o
  // inicializador síncrono. Se ninguém escolheu, o sistema decide — e essa escolha NÃO é
  // gravada, senão a preferência do sistema viraria uma escolha da pessoa e pararia de
  // acompanhar o sistema quando ele mudasse.
  const [theme, setTheme] = useState<'light' | 'dark'>(() => readUrlTheme() ?? preloaded().preferences.theme ?? systemTheme())

  /**
   * Trocar o tema GRAVA. O efeito abaixo não.
   *
   * A gravação morava no efeito, e três coisas quebravam por causa disso. A primeira contradizia
   * o comentário logo acima: quando ninguém escolheu, o estado nasce de `systemTheme()`, e o
   * efeito persistia esse palpite como se fosse uma escolha — daí em diante o app parava de
   * acompanhar o sistema. A segunda é que todo boot mandava uma escrita que ninguém pediu. A
   * terceira só apareceu com a tela de entrada: ali o `ThemeProvider` monta ANTES de haver
   * sessão, e as duas escritas voltavam 401 com o erro no console de quem só queria entrar.
   *
   * Gravar no HANDLER resolve as três de uma vez, e é o que a §2 da construção de componentes
   * pede: efeito sincroniza com sistema externo, não reage a evento.
   */
  const toggleTheme = useCallback(() => {
    const proximo = theme === 'dark' ? 'light' : 'dark'
    setTheme(proximo)
    void services()
      .preferences.setTheme(proximo)
      .catch((cause: unknown) => console.error('[wlet] não foi possível guardar o tema:', cause))
  }, [theme])

  const value = useMemo<ThemeValue>(() => ({ theme, toggleTheme }), [theme, toggleTheme])

  // O que sobra no efeito é sincronização com o DOM, que é exatamente o que um efeito serve para
  // fazer: a classe e o `color-scheme` vivem fora do React e precisam acompanhar o estado.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
  }, [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
