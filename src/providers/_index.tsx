import type { ReactNode } from 'react'
import { BrowserRouter } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FiltersProvider } from './filters'
import { PlansProvider } from './plans'
import { ThemeProvider } from './theme'

/**
 * Composition root: a ordem de aninhamento dos providers existe num lugar só.
 * O SidebarProvider fica de fora de propósito — ele é o wrapper de layout que o
 * par Sidebar/SidebarInset do registry exige, e vive no app-shell.
 */
export function Provider({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <FiltersProvider>
          <PlansProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </PlansProvider>
        </FiltersProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
