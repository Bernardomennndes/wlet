import { Moon, Sun } from 'lucide-react'
import { Suspense, useCallback, useMemo } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { HidingSquaresIcon } from '@/components/hiding-squares-icon'
import { NAV } from '@/components/layout/nav'
import { Button } from '@/components/ui/button'
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group'
import { META } from '@/lib/finance'
import { MonthPicker } from '@/components/ui/month-picker'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { entityKinds } from '@/data/types'
import type { Scope } from '@/lib/finance'
import { useFilters } from '@/providers/use-filters'
import { useTheme } from '@/providers/use-theme'

// 'Consolidado' é sentinela de recorte, não valor de domínio; PF e PJ saem da lista de
// enum, a mesma que o EntityBadge lê — as duas grafias passam a ter uma fonte só.
const SCOPES: { value: Scope; label: string }[] = [{ value: 'all', label: 'Consolidado' }, ...entityKinds.map((option) => ({ value: option.value, label: option.label }))]

/**
 * O SidebarProvider grava `sidebar_state` a cada alternância, mas quem lê esse cookie
 * no padrão oficial é o servidor do Next.js, que devolve o valor em `defaultOpen`.
 * Numa SPA não existe esse servidor: sem ler aqui, a barra sempre reabre expandida.
 */
function sidebarDefaultOpen(): boolean {
  try {
    const match = document.cookie.match(/(?:^|;\s*)sidebar_state=(true|false)/)
    return match ? match[1] === 'true' : true
  } catch {
    return true
  }
}

export function AppShell() {
  const { scope, setScope, period, setPeriod, monthsWithData } = useFilters()
  // O piso do seletor é o MESMO do `clampPeriod`: escolher antes do primeiro lançamento
  // seria corrigido em silêncio, e um limite que existe tem de ser visível onde se escolhe.
  const firstMonth = META.months[0]
  const { theme, toggleTheme } = useTheme()
  const { pathname } = useLocation()

  // O ToggleGroup do Base UI recebe o valor em array: sem memo, a prop nasce nova a cada render.
  const scopeValue = useMemo(() => [scope], [scope])

  const handleScopeChange = useCallback(
    (next: string[]) => {
      const picked = next[0]
      if (picked === 'all' || picked === 'PF' || picked === 'PJ') setScope(picked)
    },
    [setScope],
  )

  return (
    <SidebarProvider defaultOpen={sidebarDefaultOpen()}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<NavLink to="/" />}>
                {/* Sem o `Button` de fundo: a marca é o próprio padrão, não um glifo dentro de
                    um quadrado cheio. O `!` é obrigatório e não é preguiça — o
                    `SidebarMenuButton` traz `[&_svg]:size-4` como DESCENDENTE e sem escape de
                    `:not([class*='size-'])`, então uma classe de tamanho aqui perde por
                    especificidade e o ícone voltaria a 16px em silêncio. */}
                <HidingSquaresIcon className="size-8! shrink-0" />
                {/* `grid flex-1` + `truncate`: no modo ícone o bloco encolhe até zero
                    em vez de vazar para fora da faixa de 48px. */}
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold font-mono text-lg">WLET</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Painéis</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton isActive={item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)} tooltip={item.label} render={<NavLink to={item.to} />}>
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarRail aria-label="Alternar barra lateral" title="Alternar barra lateral" />
      </Sidebar>

      {/* `min-w-0`: item flex nasce com min-width auto e não encolhe abaixo do próprio
          conteúdo — sem isso a página rola na horizontal entre 768 e 912px. */}
      <SidebarInset className="min-w-0">
        {/* `<div>`, não `<header>`: o landmark de cabeçalho pertence à página, e só pode haver um. */}
        <div className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center gap-2 border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="-ml-1" aria-label="Alternar barra lateral" />
          {/* A altura aqui é layout, não restyle: a barra não tem altura fixa, então o
              divisor precisa declarar a sua para não esticar com o flex-wrap. */}
          <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-auto" />
          {/* `min-w-0 flex-1` deixa o bloco encolher abaixo da largura do conteúdo; sem
              isso o flex-wrap nunca dispara e a página rola na horizontal entre 768 e 912px. */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 py-2">
            <ToggleGroup aria-label="Recorte" variant="outline" spacing={0} value={scopeValue} onValueChange={handleScopeChange}>
              {SCOPES.map((s) => (
                <ToggleGroupItem key={s.value} value={s.value} aria-label={s.label}>
                  {s.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {/* Par de meses colado num único controle: o "até" fica entre os dois gatilhos. */}
            <ButtonGroup aria-label="Período">
              <MonthPicker aria-label="Mês inicial" value={period.from} onValueChange={(from) => setPeriod({ ...period, from })} withData={monthsWithData} min={firstMonth} />
              <ButtonGroupText className="text-muted-foreground">até</ButtonGroupText>
              {/* O fim não tem teto: parcela e plano podem cair em qualquer mês à frente. */}
              <MonthPicker aria-label="Mês final" value={period.to} onValueChange={(to) => setPeriod({ ...period, to })} withData={monthsWithData} min={firstMonth} />
            </ButtonGroup>
            <Button variant="outline" size="icon" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </div>
        </div>
        <div className="min-w-0 flex-1 px-4 py-5 md:px-6">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

/**
 * Fallback único para rotas de formas diferentes: só cabeçalho e bloco. A fileira de KPI
 * saiu daqui de propósito — ela existe em uma rota só, e desenhá-la em todas fazia a tela
 * saltar exatamente onde o esqueleto deveria segurá-la. Quem tiver fileira monta o
 * esqueleto dela com `KpiCardSkeleton`, a mesma peça da célula real.
 */
function PageSkeleton() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando painel…</span>
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-72" />
    </div>
  )
}
