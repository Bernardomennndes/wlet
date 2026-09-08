import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { readStorage, writeStorage } from '@/lib/storage'
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
  const [theme, setTheme] = useState<'light' | 'dark'>(() => readUrlTheme() ?? readStorage('theme', systemTheme()))

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

  const value = useMemo<ThemeValue>(() => ({ theme, toggleTheme }), [theme, toggleTheme])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    writeStorage('theme', theme)
  }, [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
