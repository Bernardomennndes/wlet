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

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

  const value = useMemo<ThemeValue>(() => ({ theme, toggleTheme }), [theme, toggleTheme])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    void services()
      .preferences.setTheme(theme)
      .catch((cause: unknown) => console.error('[wlet] não foi possível guardar o tema:', cause))
  }, [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
