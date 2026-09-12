import type { ReactNode } from 'react'
import { BrowserRouter } from 'react-router'
import { Toaster } from '@wlet/ui/components/sonner'
import { TooltipProvider } from '@wlet/ui/components/tooltip'
import { FiltersProvider } from './filters'
import { QueryProvider } from './query'
import { ThemeProvider } from './theme'

/**
 * Composition root: a ordem de aninhamento dos providers existe num lugar só.
 *
 * O SidebarProvider fica de fora de propósito — ele é o wrapper de layout que o par
 * Sidebar/SidebarInset do registry exige, e vive no app-shell. O `PlansProvider` SAIU: o que ele
 * guardava era uma segunda cópia de um dado que a chave de cache já mantém em acordo entre as
 * três telas que o leem.
 *
 * **O `QueryProvider` é o mais externo, e a ordem importa.** Ele é quem guarda o cache e o
 * tratamento global de erro de escrita; qualquer provider que venha ACIMA dele não pode ler nem
 * gravar pelo React Query, e os que vêm abaixo podem. Pôr o tema ou os filtros por fora fecharia
 * a porta justamente para os dois que mais precisam dela.
 *
 * O `Toaster` é irmão de `children`, não pai — ele não provê contexto nenhum. Quem fala com ele é
 * o `toast()` de qualquer lugar da árvore. Uma instância só — duas empilhariam dois avisos para a
 * mesma escrita.
 */
export function Provider({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <QueryProvider>
        <ThemeProvider>
          <FiltersProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </FiltersProvider>
        </ThemeProvider>
        <Toaster />
      </QueryProvider>
    </BrowserRouter>
  )
}
