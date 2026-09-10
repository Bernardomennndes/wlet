import { Moon, Sun } from '@phosphor-icons/react'
import { Suspense, useCallback, useMemo } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { EmptyDatasetBanner } from '@/components/empty-dataset-banner'
import { HidingSquaresIcon } from '@/components/hiding-squares-icon'
import { NAV } from '@/components/layout/nav'
import { Button } from '@/components/ui/button'
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group'
import { firstMonthWithData } from '@/lib/finance'
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
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
  const firstMonth = firstMonthWithData()
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
      {/* `offcanvas` e não `icon`: sem ícone no menu, a faixa estreita do modo `icon` ficaria
          em branco — colapsar passou a significar esconder, que é o que sobra de honesto. */}
      <Sidebar collapsible="offcanvas">
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
          {/* Os itens vão dentro de um `SidebarMenuSub`, que é o `<ul>` com `border-l`: essa
              linha É o rail que declara o agrupamento. O `tooltip` saiu junto com o ícone —
              ele existia para nomear o botão quando só o ícone aparecia. */}
          {NAV.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                {/* O recuo padrão do `SidebarMenuSub` (`mx-3.5 px-2.5`) soma 24px antes do texto, e
                    numa barra de 10rem isso truncava "Transferências". Aqui ele é layout, não
                    variante: o componente do registry não expõe tamanho, e o vão é o que faz o
                    rótulo caber. */}
                <SidebarMenuSub className="mx-2 px-2">
                  {group.items.map((item) => {
                    const active = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)
                    return (
                      <SidebarMenuSubItem key={item.to}>
                        {/* O marcador da seleção vive SOBRE o rail, e é por isso que ele é
                            filho do `<li>` — o item é `relative`, e o deslocamento negativo
                            alcança a borda do `<ul>`: os 8px do `px-2` mais o 1px da própria
                            borda. Posicionado assim ele acompanha a altura do item sem que
                            nada precise medir nada. */}
                        {active ? <span aria-hidden className="absolute -left-[9px] top-1 bottom-1 w-0.5 rounded-full bg-sidebar-primary" /> : null}
                        <SidebarMenuSubButton isActive={active} render={<NavLink to={item.to} />}>
                          <span>{item.label}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    )
                  })}
                </SidebarMenuSub>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        {/* Com o gatilho fora do desktop, o rail passou a ser a ÚNICA porta — e ele estava
            perdendo metade de si mesmo.
            Ele é `absolute` dentro do painel, e no modo `offcanvas` o painel inteiro desliza
            para `left: -160px`; a aresta do rail ia junto e sobravam 7 dos 16px na tela.
            Clicar funcionava, mas num alvo da metade do tamanho e sem nada que o anunciasse.
            `fixed left-0` tira o rail do painel que se move e o prende na borda da janela,
            onde ele recupera a largura inteira. Continua sendo layout, não restyle: a
            largura, a cor e o realce de hover seguem sendo os do componente. */}
        <SidebarRail
          aria-label="Alternar barra lateral"
          title="Alternar barra lateral"
          className="group-data-[collapsible=offcanvas]:fixed group-data-[collapsible=offcanvas]:right-auto group-data-[collapsible=offcanvas]:left-0"
        />
      </Sidebar>

      {/* `min-w-0`: item flex nasce com min-width auto e não encolhe abaixo do próprio
          conteúdo — sem isso a página rola na horizontal entre 768 e 912px. */}
      <SidebarInset className="min-w-0">
        {/* `<div>`, não `<header>`: o landmark de cabeçalho pertence à página, e só pode haver um. */}
        <div className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center gap-2 border-b bg-background/95 px-4 backdrop-blur md:px-6">
          {/* O gatilho SÓ existe no celular, e o `md:hidden` não é gosto — é o que impede a
              navegação de ficar inalcançável.
              No desktop quem abre e fecha é o `SidebarRail`, a faixa na aresta da barra: com
              o painel escondido ela fica colada na borda esquerda da janela, de altura
              inteira, e acende ao passar o cursor. Abaixo de 768px o rail NÃO EXISTE — o
              invólucro do desktop é `hidden md:block` e o rail é `hidden sm:flex` —, e ali a
              barra lateral é um `Sheet` que só este botão abre. Sem a exceção, um celular
              ficaria sem nenhuma porta para o menu. 768px é o mesmo número dos dois lados:
              o `MOBILE_BREAKPOINT` do `use-mobile` e o `md` do Tailwind.
              O atalho Cmd/Ctrl+B continua valendo nos dois. */}
          <SidebarTrigger className="-ml-1 md:hidden" aria-label="Alternar barra lateral" />
          {/* A altura aqui é layout, não restyle: a barra não tem altura fixa, então o
              divisor precisa declarar a sua para não esticar com o flex-wrap. Ele acompanha o
              gatilho: sem botão à esquerda não há o que separar da trilha. */}
          <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-auto md:hidden" />
          {/* A trilha mora AQUI, e não mais acima do `<h1>` de cada página.
              Ela é chrome de navegação, não conteúdo da tela: repetida em dez `-content.tsx`,
              ela empurrava o título para baixo em todas e cobrava uma linha inteira do primeiro
              scroll para dizer onde você já sabia que estava. Ao lado do botão que esconde a
              barra lateral, ela passa a ocupar espaço que já existia — e vira o que responde
              "onde estou" quando a barra está escondida, que é justamente quando a resposta
              some da tela. */}
          <Breadcrumbs />
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
          <EmptyDatasetBanner />
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
