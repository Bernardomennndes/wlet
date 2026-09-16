import { Moon, SignOut, Sun } from '@phosphor-icons/react'
import { type CSSProperties, Suspense, useCallback, useMemo } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { EmptyDatasetBanner } from '@/components/empty-dataset-banner'
import { IsometricCubeIcon } from '@/components/isometric-cube-icon'
import { NAV } from '@/components/layout/nav'
import { Button } from '@wlet/ui/components/button'
import { ButtonGroup, ButtonGroupText } from '@wlet/ui/components/button-group'
import { firstMonthWithData } from '@/lib/finance'
import { MonthPicker } from '@wlet/ui/components/month-picker'
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
} from '@wlet/ui/components/sidebar'
import { Skeleton } from '@wlet/ui/components/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@wlet/ui/components/toggle-group'
import { entityKinds } from '@wlet/domain'
import type { Scope } from '@/lib/finance'
import { useFilters } from '@/providers/use-filters'
import { useTheme } from '@/providers/use-theme'

// 'Consolidado' é sentinela de recorte, não valor de domínio; PF e PJ saem da lista de
// enum, a mesma que o EntityBadge lê — as duas grafias passam a ter uma fonte só.
const SCOPES: { value: Scope; label: string }[] = [{ value: 'all', label: 'Consolidado' }, ...entityKinds.map((option) => ({ value: option.value, label: option.label }))]

/**
 * As três medidas da casca, passadas pelo `style` do provider para o arquivo do registry ficar
 * intacto. Constante de módulo porque o `style` é prop: um objeto novo a cada render seria
 * recriado sem motivo.
 *
 * **`--sidebar-width`**, abaixo dos 10rem do registry, é MEDIDA contra o rótulo mais largo:
 * "Transferências" tem 84,1px em Inter 12px, e com o recuo de `pl-3` e a cadeia de espaçamentos
 * do item sobram 91px de texto. Abaixo de 9.5rem ele trunca. A gaveta de 14rem do celular deixou
 * de existir: sem recolher, a barra é a mesma coluna em toda largura de tela.
 *
 * **`--app-width`** (90rem = 1440px) é o teto da APLICAÇÃO INTEIRA, barra e cabeçalho incluídos —
 * não só do conteúdo das telas. Ela entra como `max-w` no invólucro do provider, que é quem
 * contém tudo o que está no fluxo.
 *
 * **Não há `--app-inset`.** Ela existiu enquanto o painel da barra era `fixed` e precisava ser
 * reposicionado pela metade da sobra da janela; com a barra sem recolher (`collapsible="none"`), o
 * registry a desenha no FLUXO, dentro do invólucro, e ela herda o teto como qualquer outro filho.
 */
const SIDEBAR_STYLE = { '--sidebar-width': '9.5rem', '--app-width': '90rem' } as CSSProperties

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
    <SidebarProvider style={SIDEBAR_STYLE} className="mx-auto max-w-(--app-width)">
      {/* `collapsible="none"`: a barra NÃO recolhe, e o modo muda o que o registry renderiza — some o
          painel `fixed` e o vão que o acompanhava, e a barra passa a ser a primeira COLUNA do
          invólucro, no fluxo. Com ela some a razão do rail e do botão de alternar, e some a conta da
          sobra da janela (`--app-inset`): no fluxo, a barra herda o teto de largura da aplicação como
          qualquer filho. O modo `none` também não desenha borda, então o `border-r-0` saiu.
          O `sticky top-0 h-svh self-start` é o que faz "sempre visível" valer também ao ROLAR: sem
          ele a coluna sobe com a página. O `self-start` não é enfeite — item de flex esticado (o
          padrão) não gruda, e sem ele o `sticky` não faz nada.
          O `pl-3` descola o conteúdo da borda da janela. Ele custa 12px do texto, e é por isso que o
          recuo do submenu abaixo não tem lado direito. A marca NÃO acompanha esse recuo: ela fica
          centrada na barra (ver o cabeçalho). O `pt-3` soma aos 8px do cabeçalho e descola a marca do
          topo da janela. */}
      <Sidebar collapsible="none" className="sticky top-0 h-svh shrink-0 self-start pt-3 pl-3">
        {/* A marca fica no CENTRO da barra, e o `md:-ml-3` é o que torna isso verdade. Centrar só
            dentro do cabeçalho a deixaria 6px à direita, porque o `pl-3` do container empurra o
            cabeçalho inteiro; a margem negativa desfaz aquele recuo, e como o cabeçalho é item de
            uma coluna flex esticado, ele passa a ocupar a largura inteira da barra. Só no desktop:
            a gaveta do celular não tem o `pl-3`, e o `md` é o mesmo ponto de troca do componente. */}
        <SidebarHeader className="md:-ml-3">
          <SidebarMenu>
            <SidebarMenuItem>
              {/* A marca é SÓ o ícone animado — o nome escrito saiu. O `aria-label` é o que o
                  substitui: o ícone é `aria-hidden`, e sem ele o link para a raiz seria anunciado
                  vazio. */}
              {/* O botão é um quadrado de 48px centrado na barra (`w-12`, `justify-center`,
                  `mx-auto`), e não a faixa da largura dela: com o nome escrito fora, a faixa
                  deixava o ícone num canto e um vão vazio ao lado. A altura e o padding continuam
                  sendo os da variante `lg`.
                  **O fundo não muda de cor em estado nenhum**, a pedido: os quatro estados que o
                  registry pinta com `bg-sidebar-accent` — hover, clique, rota ativa e menu aberto —
                  vão a transparente, e o `rounded-full` troca o raio da variante por um círculo. Isso
                  é exceção declarada à §6 da `component-construction` (cor e raio por classe num
                  componente com variantes): a alternativa seria uma variante nova dentro do arquivo
                  do registry, que o `CLAUDE.md` pede para não editar. Sem troca de cor, o círculo só
                  aparece no anel de foco pelo teclado.
                  O que continua do registry é a cor do TEXTO no hover, e o ícone a segue: no tema
                  escuro dá no mesmo, no claro ele clareia um tom. */}
              <SidebarMenuButton
                size="lg"
                aria-label="WLET — Visão geral"
                className="mx-auto w-12 justify-center rounded-full hover:bg-transparent active:bg-transparent data-active:bg-transparent data-open:hover:bg-transparent"
                render={<NavLink to="/" />}
              >
                {/* O ícone tem 44px e o botão, 48px com 8px de padding, então o conteúdo teria só
                    32px. Não é defeito: o ícone não encolhe (`shrink-0`) e está centrado nos dois
                    eixos, então os 12px a mais transbordam 6px para cada lado DENTRO do padding, e o
                    `overflow-hidden` do botão só corta na borda de 48px. É o que deixa o ícone
                    crescer sem sobrescrever altura nem padding de uma variante — e 48px é o teto
                    deste caminho: daí para cima o corte começa, e a saída seria uma variante nova no
                    registry.
                    A classe de tamanho vale sem `!`: o `[&_svg]:size-4` do `SidebarMenuButton` não
                    alcança um `<canvas>`. Se a marca voltar a ser SVG, o `!` volta junto. */}
                <IsometricCubeIcon className="size-11 shrink-0" />
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
                    rótulo caber. O lado ESQUERDO fica (`mx-2 px-2`) porque alinha a linha sob o
                    título do grupo e posiciona o marcador; o DIREITO sai (`mr-0 pr-0`) porque não
                    alinha nada, e é dele que vêm os 16px que a barra mais estreita e o `pl-3`
                    tomaram. Escrito como `mx-2 mr-0`, e não `ml-2`, porque só assim o `cn` descarta
                    o `mx-3.5` do registry em vez de deixar os dois disputando pela ordem do CSS. */}
                <SidebarMenuSub className="mx-2 mr-0 px-2 pr-0">
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
      </Sidebar>

      {/* `min-w-0`: item flex nasce com min-width auto e não encolhe abaixo do próprio
          conteúdo — sem isso a página rola na horizontal entre 768 e 912px. */}
      <SidebarInset className="min-w-0">
        {/* `<div>`, não `<header>`: o landmark de cabeçalho pertence à página, e só pode haver um.
            **Ele NÃO é sticky**, a pedido: é parte da página, rola junto com ela e não reaparece na
            rolagem. Com isso saíram também o `z-10`, o fundo semitransparente e o `backdrop-blur` —
            os três existiam só para o conteúdo passar POR BAIXO dele, o que não acontece mais. Sem
            borda inferior, pela mesma razão da barra integrada: sem a borda vertical da barra, a
            linha nasceria solta no meio da tela. */}
        <div className="flex min-h-14 flex-wrap items-center gap-2 px-4 md:px-6">
          {/* A trilha mora AQUI, e não mais acima do `<h1>` de cada página.
              Ela é chrome de navegação, não conteúdo da tela: repetida em dez `-content.tsx`,
              ela empurrava o título para baixo em todas e cobrava uma linha inteira do primeiro
              scroll para dizer onde você já sabia que estava. Na barra da aplicação ela ocupa
              espaço que já existia, e responde "onde estou" ao lado dos filtros globais. */}
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
            {/* Sair RECARREGA em vez de desmontar a árvore: as telas leem constantes de módulo
                fixadas no portão de boot (`lib/dataset.ts`), e elas não têm como ser esvaziadas
                sem recarregar. Enquanto a leitura não for por query, é isto ou deixar o extrato
                da pessoa anterior na memória depois da saída — e a segunda opção não existe. */}
            <Button
              variant="outline"
              size="icon"
              aria-label="Sair da conta"
              onClick={async () => {
                const { auth } = await import('@/lib/auth')
                await auth().signOut()
                window.location.reload()
              }}
            >
              <SignOut />
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
