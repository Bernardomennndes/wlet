import { useMemo, useRef, useState } from 'react'
import { Download, FolderPlus, Plus, Upload, Target } from 'lucide-react'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { KpiCard, KpiCardGrid, KpiHeadline } from '@/components/kpi'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useDocumentTitle } from '@/hooks/use-document-title'
import type { Plan } from '@/data/types'
import { ACCOUNT_MAP, lastMonthWithData, monthsBetween, projectionHorizon, shiftMonth } from '@/lib/finance'
import { formatBRL, formatMonthShort, plural } from '@/lib/format'
import { installmentAmount, parsePlans, planOccursIn, planScheduleByMonth, planTotal, scheduledPlans } from '@/lib/plans'
import { useFilters } from '@/providers/use-filters'
import { buildForecast } from '@/lib/forecast'
import { plannedInScope } from '@/lib/planned'
import { receivablesInScope } from '@/lib/receivables'
import { usePlans } from '@/providers/use-plans'
import { PLANOS_METRICS } from './-metric-definitions'
import { PlanList } from './-components/plan-list'
import { GroupDialog } from './-components/group-dialog'
import { PlanScheduleChart } from './-components/plan-schedule-chart'
import { PlanSheet } from './-components/plan-sheet'

export function PlanosPageContent() {
  useDocumentTitle('Planos')

  const { monthsWithData, history, scope, period } = useFilters()
  const { groups, items, decided, addPlan, updatePlan, removePlan, addGroup, removeGroup, data, replaceAll } = usePlans()

  const [open, setOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)
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

  const exportPlans = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
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
        replaceAll(parsePlans(JSON.parse(String(reader.result))))
      } catch {
        // Arquivo ilegível: a lista atual fica como está, sem estourar a tela.
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="space-y-2">
        <Breadcrumbs />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Planos</h1>
            <p className="text-xs text-muted-foreground">
              O que você pretende comprar. Um plano <strong className="font-medium">decidido</strong> entra na previsão como origem própria; um <strong className="font-medium">em estudo</strong> só
              aparece quando você liga a simulação na tela de Previsão. Esta lista vive no navegador — exporte para levá-la a outro lugar.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" onClick={() => setGroupOpen(true)}>
              <FolderPlus data-icon="inline-start" /> Novo grupo
            </Button>
            <Button
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
            <CardDescription>
              O que cada mês já tem preso, da base para o topo em ordem de certeza. A parcela de cartão já comprada é FATO e vem cheia, com a hachura de saída da Visão geral; o que a Previsão projeta
              — conta declarada, líquida do que a cobrança abate, e rubrica de gasto — vem vazado de traço tracejado. Em cima, o que esta lista acrescenta: cheio no que você já decidiu, tracejado
              enquanto for hipótese. Além de {formatMonthShort(projectionHorizon())} sobram só as parcelas e os planos: rubrica e conta declarada o app não projeta tão longe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlanScheduleChart
              data={chartMonths}
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

      {items.length === 0 && groups.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Target />
            </EmptyMedia>
            <EmptyTitle>Nenhum plano ainda</EmptyTitle>
            <EmptyDescription>Anote o que você pretende comprar — com valor, mês e parcelamento — e a tela de Previsão mostra se cabe.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>A lista</CardTitle>
            <CardDescription>
              {items.length} {plural(items.length, 'plano', 'planos')} em {groups.length + 1} {plural(groups.length + 1, 'grupo', 'grupos')}. Remover um grupo não remove os itens: eles voltam a ser
              avulsos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlanList
              groups={groups}
              items={items}
              onRemove={removePlan}
              onRemoveGroup={removeGroup}
              onEdit={(plan) => {
                setEditing(plan)
                setOpen(true)
              }}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Levar a lista com você</CardTitle>
          <CardDescription>
            Os planos ficam no <code className="font-mono">localStorage</code> deste navegador — some ao limpar os dados do site e não vai para outro dispositivo. Diferente do resto do app, ele não
            nasce de um arquivo em <code className="font-mono">docs/</code>, então a previsão com planos não é reproduzível num clone novo. Exportar é o que fecha essa ponta.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportPlans} disabled={items.length === 0 && groups.length === 0}>
            <Download data-icon="inline-start" /> Exportar ({items.length})
          </Button>
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
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

      <GroupDialog open={groupOpen} onOpenChange={setGroupOpen} defaultMonth={nextMonth} monthsWithData={monthsWithData} onSubmit={addGroup} />

      <PlanSheet
        open={open}
        onOpenChange={setOpen}
        groups={groups}
        defaultMonth={nextMonth}
        monthsWithData={monthsWithData}
        editing={editing}
        onSubmit={(plan) => {
          if (editing) updatePlan(editing.id, plan)
          else addPlan(plan)
        }}
      />
    </div>
  )
}
