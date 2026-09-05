import { createContext, useContext } from 'react'

export interface ThemeValue {
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeValue | null>(null)

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme precisa estar dentro de ThemeProvider')
  return ctx
}
