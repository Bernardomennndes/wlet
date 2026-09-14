import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { Download, FolderPlus, Plus, Target, Upload } from '@phosphor-icons/react'
import { KpiCard, KpiCardGrid, KpiHeadline } from '@/components/kpi'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@wlet/ui/components/alert-dialog'
import { Button } from '@wlet/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wlet/ui/components/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@wlet/ui/components/empty'
import { useDocumentTitle } from '@/hooks/use-document-title'
import type { Plan, PlanGroup, PlanStatus } from '@wlet/domain'
import { ACCOUNT_MAP, lastMonthWithData, monthsBetween, projectionHorizon, shiftMonth } from '@/lib/finance'
import { formatBRL, formatMonthShort, plural } from '@wlet/lib/format'
import { installmentAmount, parsePlans, planMonths, planOccursIn, planScheduleByMonth, planTotal, scheduledPlans } from '@wlet/domain/plans'
import { useFilters } from '@/providers/use-filters'
import { buildForecast } from '@/lib/forecast'
import { plannedInScope } from '@/lib/planned'
import { receivablesInScope } from '@/lib/receivables'
import { toast } from '@wlet/ui/toast'
import { api } from '@/lib/api'
import { usePlans } from '@/providers/use-plans'
import { services } from '@/lib/services'
import { PLANOS_METRICS } from './-metric-definitions'
import { PlanosDataTable } from './-components/planos-data-table'
import { GroupDialog } from './-components/group-dialog'
import { type PlanHighlight, PlanScheduleChart } from './-components/plan-schedule-chart'
import { PlanSheet } from './-components/plan-sheet'

export function PlanosPageContent() {
  useDocumentTitle('Planos')

  const { monthsWithData, history, scope, period } = useFilters()
  const { groups, items, decided } = usePlans()
  const queryClient = useQueryClient()

  /**
   * Uma escrita de plano mexe em DOIS lugares, e os dois são invalidados.
   *
   * A lista é o óbvio. O outro é a previsão: um plano decidido entra nos meses futuros, então
   * criar, editar ou descartar um muda o número que a Visão geral e a Previsão mostram. As duas
   * leem o MESMO cache de planos, pela mesma chave — invalidá-la move as três telas juntas.
   */
  const apply = () => {
    void queryClient.invalidateQueries({ queryKey: api().plans.list.key() })
  }

  /**
   * SEIS escritas, seis avisos, e cada texto nomeia o plano ou o grupo.
   *
   * O `PlansProvider` que morava aqui embrulhava as seis num `run(operation, after)` só: a mesma
   * frase para adicionar um plano e apagar um grupo, e a falha engolida num `console.error` que
   * ninguém vê. Era o wrapper que a §5 proíbe, e o custo estava exatamente no que ele economizava.
   *
   * Nenhuma trata erro — ele é um só, no `MutationCache` do provider.
   */
  const { mutate: createPlan, isPending: creatingPlan } = useMutation({
    mutationFn: (plan: Omit<Plan, 'id'>) => services().plans.addPlan(plan),
    onSuccess: (created) => {
      apply()
      toast.success(`Plano "${created.label}" criado`)
    },
  })

  const { mutate: updatePlan, isPending: updatingPlan } = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Plan, 'id'>> }) => services().plans.updatePlan(id, patch),
    onSuccess: (created) => {
      apply()
      toast.success(`Plano "${created.label}" atualizado`)
    },
  })

  const { mutate: deletePlan, isPending: deletingPlan } = useMutation({
    // O rótulo viaja nas variáveis porque `removePlan` devolve `void`: depois de apagado não há
    // de onde tirá-lo, e "Plano removido" não confirma que era AQUELE que a pessoa mirou.
    mutationFn: ({ id }: { id: string; label: string }) => services().plans.removePlan(id),
    onSuccess: (_, { label }) => {
      apply()
      toast.success(`Plano "${label}" removido`)
    },
  })

  const { mutate: createGroup, isPending: creatingGroup } = useMutation({
    mutationFn: (group: Omit<PlanGroup, 'id'>) => services().plans.addGroup(group),
    onSuccess: (createdGroup) => {
      apply()
      toast.success(`Grupo "${createdGroup.label}" criado`)
    },
  })

  const { mutate: deleteGroup, isPending: deletingGroup } = useMutation({
    mutationFn: ({ id }: { id: string; label: string }) => services().plans.removeGroup(id),
    onSuccess: (_, { label }) => {
      apply()
      // A frase diz o que NÃO aconteceu, porque a regra não é óbvia e o serviço a aplica: apagar
      // um grupo não apaga os planos dele — eles ficam soltos.
      toast.success(`Grupo "${label}" removido — os planos dele continuam na lista`)
    },
  })

  const { mutate: setGroupStatus, isPending: settingGroupStatus } = useMutation({
    // Uma escrita para o grupo inteiro, e não uma por plano: o serviço grava o catálogo todo a
    // cada chamada, e N chamadas em voo perderiam todas menos a última.
    mutationFn: ({ id, status }: { id: string; label: string; status: Exclude<PlanStatus, 'discarded'> }) => services().plans.setGroupStatus(id, status),
    onSuccess: (reached, { label, status }) => {
      apply()
      const what = status === 'decided' ? plural(reached.length, 'plano decidido', 'planos decididos') : plural(reached.length, 'plano em estudo', 'planos em estudo')
      toast.success(`Grupo "${label}": ${reached.length} ${what}`)
    },
  })

  const { mutate: renameGroup, isPending: renamingGroup } = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) => services().plans.renameGroup(id, label),
    onSuccess: (renamed) => {
      apply()
      toast.success(`Grupo renomeado para "${renamed.label}"`)
    },
  })

  const { mutate: replaceAllPlans, isPending: importing } = useMutation({
    mutationFn: (saved: ReturnType<typeof parsePlans>) => services().plans.replaceAll(saved),
    onSuccess: (saved) => {
      apply()
      toast.success(`${saved.items.length} ${plural(saved.items.length, 'plano importado', 'planos importados')}`)
    },
  })

  /** Qualquer escrita em voo trava a lista: as oito reescrevem o mesmo catálogo. */
  const saving = creatingPlan || updatingPlan || deletingPlan || creatingGroup || deletingGroup || settingGroupStatus || renamingGroup || importing

  const [open, setOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)
  // O plano que a lista está apontando. É estado de EVENTO — nasce do cursor entrar numa
  // linha e morre quando ele sai —, então não há efeito nenhum por trás dele.
  const [pointed, setPointed] = useState<Plan | null>(null)
  /**
   * O que está esperando confirmação — um por tipo, e não um diálogo por linha.
   *
   * A lista tem N planos, e montar um `AlertDialog` por linha colocaria N portais na árvore para
   * que no máximo um abra. O estado guarda QUEM, e o diálogo é um só.
   */
  const [planPendingDeletion, setPlanPendingDeletion] = useState<Plan | null>(null)
  const [groupPendingDeletion, setGroupPendingDeletion] = useState<PlanGroup | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const lastMonth = monthsWithData.at(-1) ?? new Date().toISOString().slice(0, 7)
  const nextMonth = shiftMonth(lastMonth, 1)

  const totalDecided = decided.reduce((s, p) => s + planTotal(p), 0)
  const totalConsidering = items.filter((p) => p.status === 'considering').reduce((s, p) => s + planTotal(p), 0)
  const dueNext = decided.filter((p) => planOccursIn(p, nextMonth)).reduce((s, p) => s + installmentAmount(p), 0)
  // Decidido SEM mês é dinheiro que o KPI soma e a previsão não mostra em lugar nenhum. A
  // contagem existe para essa lacuna não ser silenciosa: sem ela, o total do cartão e o do
  // gráfico divergiriam e nada na tela explicaria por quê.
  const undated = decided.length - scheduledPlans(decided).length
  // A agenda sai da lista INTEIRA e por isso se refaz a cada edição: acrescentar um plano,
  // trocar a forma de pagamento ou mudar a situação recompõe as colunas na hora.
  const schedule = useMemo(() => planScheduleByMonth(items), [items])

  /**
   * As colunas do gráfico: a base do que JÁ está previsto, mais a fatia dos planos.
   *
   * As três séries saem de DUAS chamadas ao `buildForecast` — nunca de uma soma montada aqui.
   * A regra do app é que a previsão é um número só, e uma segunda aritmética divergiria da
   * tela de Previsão no primeiro ajuste.
   *
   * Duas chamadas, e não uma, porque `sources.plan` é um número só: com todos os planos ele dá
   * a fatia inteira, e com só os decididos dá a parte já assumida — a diferença entre as duas
   * é o que está em estudo.
   *
   * **A base tem de sair da chamada COM planos**, e é aqui que estava a armadilha: plano entra
   * ANTES do piso da rubrica, então uma previsão feita sem eles e somada a eles contaria o
   * mesmo dinheiro duas vezes numa categoria com rubrica — os R$ 800 do plano mais os R$ 500
   * da rubrica que ele já preencheu. Tirando a base de `expense - sources.plan` da MESMA
   * chamada, as três parcelas somam exatamente o total previsto.
   */
  const chartMonths = useMemo(() => {
    const live = items.filter((p) => p.status !== 'discarded')
    const last = lastMonthWithData()
    const horizon = projectionHorizon()

    // A JANELA SEGUE O PERÍODO do cabeçalho, e é ele quem manda nas duas pontas.
    //
    // Ela já nasceu limitada ao horizonte de projeção uma vez, e o filtro só sabia encurtar:
    // esticar o período para Dez 27 não alcançava nada, porque não havia mês de Dez 27 na
    // janela para sobreviver ao recorte. Um filtro que só corta não é o filtro.
    //
    // O PISO absoluto é o primeiro mês projetável — não se planeja compra num mês já medido —,
    // então o começo do período só empurra a janela para a frente, nunca para trás. Os meses
    // que os planos alcançam entram mesmo fora do período? Não: eles também são recortados,
    // senão o gráfico mostraria coluna fora da janela que o cabeçalho declara.
    const start = shiftMonth(last, 1)
    const from = period.from > start ? period.from : start
    const to = period.to > from ? period.to : from
    const natural = [...new Set([...monthsBetween(from, to), ...schedule.map((m) => m.month)])].sort()
    const months = natural.filter((month) => month >= from && month <= to)
    const targets = months.filter((m) => m > last)
    const input = { history, planned: plannedInScope(scope), receivables: receivablesInScope(scope, (id) => ACCOUNT_MAP[id]?.entity) }
    const all = new Map(buildForecast({ ...input, plans: live, targets }).map((m) => [m.month, m]))
    const onlyDecided = new Map(buildForecast({ ...input, plans: decided, targets }).map((m) => [m.month, m]))
    const planned = new Map(schedule.map((m) => [m.month, m]))

    return months.map((month) => {
      const a = all.get(month)
      const d = onlyDecided.get(month)
      const p = planned.get(month)
      return {
        month,
        // As três origens vêm SEPARADAS de `sources`, não fundidas numa base só: parcela
        // comprada é fato, conta declarada é compromisso e rubrica é estimativa, e a pergunta
        // desta tela é quanto de um mês já está preso. Fundidas, as três pareceriam
        // igualmente inegociáveis.
        //
        // O ABATIDO entra no declarado, líquido: ele é negativo e nasce da cobrança que abate
        // justamente a conta declarada — o aluguel de R$ 1.500 com R$ 750 de rateio de volta
        // pesa 750, e é esse o número que o mês sente. Segmento negativo não se empilha.
        //
        // Além do horizonte sobra só o `committed`, que é fato: rubrica e conta declarada ali
        // seriam um orçamento que ninguém escreveu.
        committed: a ? Math.max(0, a.sources.committed) : 0,
        declared: a && month <= horizon ? Math.max(0, a.sources.declared + a.sources.offset) : 0,
        rubric: a && month <= horizon ? Math.max(0, a.sources.rubric) : 0,
        decided: d ? d.sources.plan : (p?.decided ?? 0),
        considering: a ? Math.max(0, a.sources.plan - (d?.sources.plan ?? 0)) : (p?.considering ?? 0),
      }
    })
  }, [schedule, items, decided, history, scope, period])
  // O cartão da agenda olha o que é AGENDÁVEL, não a lista inteira: com tudo descartado a
  // mensagem de vazio diria "nenhum plano tem mês", que seria falso — eles têm, você é que
  // desistiu deles.
  const schedulable = items.filter((p) => p.status !== 'discarded')

  const scheduleTotal = schedule.reduce((sum, m) => sum + m.decided + m.considering, 0)

  /**
   * O que o plano apontado põe em cada mês — a entrada do realce do gráfico.
   *
   * Só existe para plano que de fato CONTRIBUI: descartado não entra em série nenhuma, e sem
   * mês `planMonths` devolve lista vazia. Nos dois casos o realce fica desligado em vez de
   * esmaecer o gráfico inteiro sem acender nada — a própria linha já diz por quê, na célula
   * de mês e no badge "Descartado".
   */
  const highlight = useMemo<PlanHighlight | undefined>(() => {
    if (!pointed || pointed.status === 'discarded') return undefined
    const months = planMonths(pointed)
    if (months.length === 0) return undefined
    const value = installmentAmount(pointed)
    const byMonth: Record<string, number> = {}
    for (const month of months) byMonth[month] = (byMonth[month] ?? 0) + value
    return { key: pointed.status === 'decided' ? 'decided' : 'considering', byMonth }
  }, [pointed])

  const exportPlans = () => {
    const blob = new Blob([JSON.stringify({ groups, items }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'planos.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const importPlans = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        // `parsePlans` é a fronteira: o arquivo veio de fora e nada nele é confiável.
        replaceAllPlans(parsePlans(JSON.parse(String(reader.result))))
      } catch {
        // Arquivo ILEGÍVEL — JSON quebrado, não um plano inválido. Esse caso não passa pela
        // escrita, então não há erro do servidor para o aviso global mostrar; a lista fica como
        // está e a tela diz o que houve.
        toast.error('Este arquivo não é uma lista de planos do WLET.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Planos</h1>
            <p className="text-xs text-muted-foreground">O que você pretende comprar. Só os planos decididos entram na previsão.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" disabled={saving} onClick={() => setGroupOpen(true)}>
              <FolderPlus data-icon="inline-start" /> Novo grupo
            </Button>
            <Button
              disabled={saving}
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              <Plus data-icon="inline-start" /> Novo plano
            </Button>
          </div>
        </div>
      </header>

      <KpiCardGrid columns={3}>
        <KpiCard
          label="Decidido"
          definition={PLANOS_METRICS.decided}
          value={formatBRL(totalDecided)}
          hint={undated > 0 ? `${decided.length - undated} na previsão · ${undated} sem mês` : `${decided.length} ${plural(decided.length, 'plano', 'planos')} na previsão`}
        />
        <KpiCard label="Em estudo" definition={PLANOS_METRICS.considering} value={formatBRL(totalConsidering)} hint="Fora da previsão até você decidir" />
        <KpiCard label="Cai em" definition={PLANOS_METRICS.nextMonth} value={formatBRL(dueNext)} hint={formatMonthShort(nextMonth)} />
      </KpiCardGrid>

      {schedulable.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Quanto sai por mês</CardTitle>
            {/* UMA linha. A codificação visual está na LEGENDA, que fica logo abaixo e
                mostra cada marca do lado do nome dela — repeti-la aqui em prosa produzia um
                parágrafo de quatro linhas que ninguém lia, e que empurrava o gráfico para
                fora da primeira dobra. O detalhe do número vive no ⓘ do headline. */}
            <CardDescription>Da base ao topo, em ordem de certeza: primeiro o que o mês já tem preso, depois o que esta lista acrescenta. Aponte um plano para ver onde ele cai.</CardDescription>
          </CardHeader>
          <CardContent>
            <PlanScheduleChart
              data={chartMonths}
              highlight={highlight}
              /* O número que ancora um gráfico é `KpiHeadline`, como o "Resultado no período"
                 da Visão geral: não é markup à mão (§1 da regra de KPI), não é `HeroKpiCard`
                 (que é um Card e aninharia dois) nem `KpiCard` solto fora do grid. */
              headline={
                <KpiHeadline
                  label="Total na agenda"
                  definition={PLANOS_METRICS.schedule}
                  value={formatBRL(scheduleTotal)}
                  hint={schedule.length === 0 ? 'Nenhum plano tem mês — marque uma data e a coluna nasce aqui' : `Diluído em ${schedule.length} ${plural(schedule.length, 'mês', 'meses')}`}
                />
              }
            />
          </CardContent>
        </Card>
      ) : null}

      {/* O convite da primeira vez ACOMPANHA a tabela, não a substitui.
          Ele era o outro lado de um ternário, e o que sumia junto com a tabela era o
          cabeçalho das colunas — a única coisa que explica o que a listagem guarda
          justamente quando não há nenhuma linha de onde inferir. A moldura fica montada
          sempre; o vazio é uma linha dela (`data-table.md` §7.1 e `route-organization.md`
          §3.2). */}
      {items.length === 0 && groups.length === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Target />
            </EmptyMedia>
            <EmptyTitle>Nenhum plano ainda</EmptyTitle>
            <EmptyDescription>Anote o que você pretende comprar — com valor, mês e parcelamento — e a tela de Previsão mostra se cabe.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* A lista é o cartão, e cada grupo é um bloco DENTRO dele. A tabela sangrava até a borda
          do cartão enquanto era uma grade só; agora quem emoldura é cada bloco, e o cartão volta
          ao respiro normal — sangrando, as molduras dos blocos encostariam na borda dele. */}
      <Card>
        <CardHeader>
          <CardTitle>A lista</CardTitle>
          <CardDescription>A caixinha decide o que entra na previsão. Forma, parcelas e mês se editam na própria linha.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Os dois `onRemove` ABREM a pergunta; quem grava é o `AlertDialogAction` lá embaixo.
              Excluir é mutação instantânea e sem formulário, e a `mutation-confirmation.md` §1 não
              admite disparo direto no `onClick` — um clique errado numa lista densa não tem
              desfazer. */}
          <PlanosDataTable
            groups={groups}
            items={items}
            disabled={saving}
            onRemove={(id) => setPlanPendingDeletion(items.find((p) => p.id === id) ?? null)}
            onRemoveGroup={(id) => setGroupPendingDeletion(groups.find((g) => g.id === id) ?? null)}
            onUpdate={(id, patch) => updatePlan({ id, patch })}
            onGroupStatus={(group, status) => setGroupStatus({ id: group.id, label: group.label, status })}
            onRenameGroup={(group, label) => renameGroup({ id: group.id, label })}
            onHighlight={setPointed}
            monthsWithData={monthsWithData}
            defaultMonth={nextMonth}
            onEdit={(plan) => {
              setEditing(plan)
              setOpen(true)
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Levar a lista com você</CardTitle>
          <CardDescription>Ficam no servidor, junto com o resto da conta. O arquivo serve para levar a lista para outra instalação ou guardar uma cópia.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportPlans} disabled={items.length === 0 && groups.length === 0}>
            <Download data-icon="inline-start" /> Exportar ({items.length})
          </Button>
          <Button variant="outline" disabled={importing} onClick={() => fileInput.current?.click()}>
            <Upload data-icon="inline-start" /> Importar
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="sr-only"
            aria-label="Importar planos de um arquivo JSON"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) importPlans(file)
              e.target.value = ''
            }}
          />
        </CardContent>
      </Card>

      <GroupDialog open={groupOpen} onOpenChange={setGroupOpen} defaultMonth={nextMonth} monthsWithData={monthsWithData} onSubmit={(group) => createGroup(group)} />

      {/* A pergunta nomeia O QUE sai e o que acontece com o resto: num grupo, a regra de que os
          planos dele continuam na lista não é óbvia, e é ela que decide se a pessoa confirma. */}
      <AlertDialog open={planPendingDeletion !== null} onOpenChange={(open) => !open && setPlanPendingDeletion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este plano?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{planPendingDeletion?.label}</strong> sai da lista e da previsão. Não há como desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (planPendingDeletion) deletePlan({ id: planPendingDeletion.id, label: planPendingDeletion.label })
                setPlanPendingDeletion(null)
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={groupPendingDeletion !== null} onOpenChange={(open) => !open && setGroupPendingDeletion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{groupPendingDeletion?.label}</strong> sai da lista. Os planos dele NÃO são apagados — ficam soltos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (groupPendingDeletion) deleteGroup({ id: groupPendingDeletion.id, label: groupPendingDeletion.label })
                setGroupPendingDeletion(null)
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PlanSheet
        open={open}
        onOpenChange={setOpen}
        groups={groups}
        defaultMonth={nextMonth}
        monthsWithData={monthsWithData}
        editing={editing}
        onSubmit={(plan) => {
          if (editing) updatePlan({ id: editing.id, patch: plan })
          else createPlan(plan)
        }}
      />
    </div>
  )
}
