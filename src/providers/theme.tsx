import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ThemeContext, type ThemeValue } from './use-theme'

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // armazenamento indisponível: segue sem persistir
  }
}

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Parâmetro de URL permite abrir a app já num tema: ?tema=claro */
function readUrlTheme(): 'light' | 'dark' | null {
  const themeParam = new URLSearchParams(window.location.search).get('tema')
  return themeParam === 'claro' ? 'light' : themeParam === 'escuro' ? 'dark' : null
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => readUrlTheme() ?? readStorage('wallet.theme', systemTheme()))

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

  const value = useMemo<ThemeValue>(() => ({ theme, toggleTheme }), [theme, toggleTheme])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    writeStorage('wallet.theme', theme)
  }, [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
