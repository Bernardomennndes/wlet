import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useDeclarations } from '@/hooks/use-declarations'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { PlannedSheet } from './-components/planned-sheet'
import { CalendarDot, PencilSimple, Plus, Trash, Warning } from '@phosphor-icons/react'
import { CategoryBadge } from '@/components/category-badge'
import { DataList, DataListField, DataListItem, DataListItemFields, DataListItemHeader } from '@/components/data-list/data-list'
import { EntityBadge } from '@/components/entity-badge'
import { FlowBadge } from '@/components/flow-badge'
import { Button } from '@wlet/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wlet/ui/components/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@wlet/ui/components/empty'
import { categoryLabel } from '@wlet/domain'
import { plannedRecurrences, type PlannedEntry } from '@wlet/domain'
import type { ExpenseSegment } from '@/lib/expense-segments'
import { ACCOUNT_MAP, lastDateWithData, lastMonthWithData, monthsBetween, shiftMonth, toCents } from '@/lib/finance'
import { buildCategoryForecast, buildForecast, pendingFor } from '@/lib/forecast'
import { receivablesInScope } from '@/lib/receivables'
import { useFilters } from '@/providers/use-filters'
import { usePlans } from '@/providers/use-plans'
import { formatBRL, formatDayMonth, formatMonthShort, plural } from '@wlet/lib/format'
import { dueDateOf, lastOccurrence, occursIn, pendingIn } from '@/lib/planned'
import { SimulationCard } from './-components/simulation-card'
import { ForecastList, type ForecastRow } from './-components/forecast-list'

/** Fora do render: a busca na lista não depende de nenhuma prop. */
const RECURRENCE_OPTIONS = new Map(plannedRecurrences.map((option) => [option.value, option]))

/**
 * A frase de "quando" sai de um switch exaustivo: recorrência que o tipo não conhece cai no
 * rótulo da lista, e na falta dele no valor cru — em vez de se disfarçar de mensal.
 */
function describeWhen(entry: PlannedEntry): string {
  const end = lastOccurrence(entry)
  const until = end ? ` · até ${formatMonthShort(end)}` : ''
  switch (entry.recurrence) {
    case 'monthly':
      return `Todo mês a partir de ${formatMonthShort(entry.startMonth)}${until}`
    case 'once':
      return `Uma vez em ${formatMonthShort(entry.startMonth)}`
    case 'installments': {
      const count = Math.max(1, entry.count ?? 1)
      return `${count} ${plural(count, 'parcela', 'parcelas')} de ${formatMonthShort(entry.startMonth)}${until}`
    }
    default:
      return `${RECURRENCE_OPTIONS.get(entry.recurrence)?.label ?? entry.recurrence} a partir de ${formatMonthShort(entry.startMonth)}${until}`
  }
}

/**
 * O dia da ocorrência, dito como regra e não como data: "5º dia útil" é o que a pessoa
 * declarou, e a data de um mês específico muda com o calendário. A próxima data resolvida
 * vai ao lado, para a regra ser conferível sem contar no dedo.
 *
 * A próxima sai do primeiro mês em que a regra INCIDE, não do primeiro mês da janela: o
 * salário começa em outubro, e resolver o dia em setembro dava uma data que nunca existiu.
 */
function describeDueDay(entry: PlannedEntry, window: string[]): string | null {
  if (!entry.dueOn) return null
  const rule = entry.dueOn.kind === 'business-day' ? `${entry.dueOn.nth}º dia útil` : `Dia ${entry.dueOn.day}`
  const month = window.find((candidate) => occursIn(entry, candidate))
  const next = month ? dueDateOf(entry, month) : null
  return next ? `${rule} · próxima em ${formatDayMonth(next)}` : rule
}

export function PrevisaoPageContent() {
  useDocumentTitle('Previsão')
  const { history, scope, period, monthsWithData } = useFilters()
  /**
   * As regras vêm do estado EDITÁVEL, não de `PLANNED`.
   *
   * `PLANNED` é o retrato do boot, e enquanto esta tela só o lia isso bastava. Agora que ela
   * edita, ler o retrato faria a lista mostrar R$ 1.800 e o gráfico logo abaixo continuar em
   * R$ 1.500 — a mesma tela afirmando dois números para o mesmo lançamento até um refresh.
   * Com o estado, os três pontos que dependem das regras se movem juntos.
   */
  const { current, saving, error, save } = useDeclarations()
  const planned = current.planned
  const [editing, setEditing] = useState<PlannedEntry | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  // A janela da prévia sai das próprias regras, não do filtro do cabeçalho: começa no mês
  // seguinte ao último com lançamentos e vai até a última ocorrência conhecida. Mínimo de
  // 12 meses para dar contexto, máximo de 24 para não virar tabela infinita quando houver
  // regra sem prazo.
  // O mês em curso entra na janela quando ainda há regra vencendo nele — a manutenção do
  // dia 25 num extrato que vai até o dia 2 é previsão, não passado.
  const partialMonth = lastMonthWithData()
  const cutoff = lastDateWithData()
  const partialHasPending = useMemo(() => planned.some((entry) => pendingIn(entry, partialMonth, cutoff)), [planned, partialMonth, cutoff])

  /**
   * Os meses que esta tela projeta, RECORTADOS pelo período do cabeçalho.
   *
   * O `start` continua sendo o piso absoluto — não existe prever um mês já medido —, então o
   * período só encurta pela frente e pelo fim. Estender `ate` alcança mais longe, que é o que
   * a remoção do teto do período passou a permitir.
   */
  /**
   * Os meses que esta tela projeta: do primeiro mês projetável até o fim do PERÍODO.
   *
   * Havia aqui uma janela própria de 12 a 24 meses, conforme o alcance das regras declaradas.
   * Ela saiu junto com o teto do período: duas janelas para a mesma pergunta divergem, e a do
   * cabeçalho é a que a pessoa enxerga e controla. Estender `ate` alcança mais longe; estreitar
   * mostra menos.
   *
   * O `start` é piso absoluto — não existe prever um mês já medido —, então o começo do
   * período só empurra a janela para a frente.
   */
  const futureMonths = useMemo(() => {
    const start = partialHasPending ? partialMonth : shiftMonth(partialMonth, 1)
    const from = period.from > start ? period.from : start
    const to = period.to > from ? period.to : from
    return monthsBetween(from, to)
  }, [partialMonth, partialHasPending, period])

  // A MESMA previsão que o gráfico da Visão geral desenha. Antes esta tela somava só as
  // regras de `planned.config.ts`, e o resultado era um terceiro número para o mesmo mês:
  // moradia lia 1.500 aqui e 750 lá, porque o abatimento da cobrança — igualmente declarado —
  // ficava de fora. Previsão é uma só; o que muda é o quanto dela se explica.
  const { items: allPlans, groups, decided } = usePlans()
  const [params, setParams] = useSearchParams()

  // Quais planos EM ESTUDO estão ligados. Vive na URL, como recorte, período e mês — a
  // simulação passa a ser compartilhável, e recarregar a página não desfaz o que se montou.
  const simulated = useMemo(() => new Set((params.get('simular') ?? '').split(',').filter(Boolean)), [params])
  // Recebe um CONJUNTO, não um id, e escreve uma vez só.
  //
  // Ligar um grupo com cinco itens chamando um alternador de id cinco vezes não funcionaria:
  // cada chamada parte do mesmo `params` do render, então as quatro primeiras seriam
  // sobrescritas pela última e só um item entraria. Aplicar o conjunto inteiro de uma vez é o
  // que torna o botão de grupo correto, não só conveniente.
  const toggleSimulated = (ids: string[], on: boolean) => {
    const next = new Set(simulated)
    for (const id of ids) {
      if (on) next.add(id)
      else next.delete(id)
    }
    const q = new URLSearchParams(params)
    if (next.size) q.set('simular', [...next].join(','))
    else q.delete('simular')
    setParams(q, { replace: true })
  }

  const considering = useMemo(() => allPlans.filter((p) => p.status === 'considering'), [allPlans])
  // Decididos sempre; em estudo só o que a simulação ligou. É aqui que a fronteira entre o
  // número que se usa para decidir e o número que se está testando fica explícita.
  const plans = useMemo(() => [...decided, ...considering.filter((p) => simulated.has(p.id))], [decided, considering, simulated])

  const input = useMemo(
    () => ({ history, planned: scope === 'all' ? planned : planned.filter((e) => e.entity === scope), receivables: receivablesInScope(scope, (id) => ACCOUNT_MAP[id]?.entity), plans }),
    [history, scope, planned, plans],
  )

  /** Uma escrita só: a lista inteira volta pelo serviço, que valida o agregado. */
  const writePlanned = useCallback((next: PlannedEntry[]) => save({ planned: next }), [save])
  const removeEntry = useCallback((id: string) => writePlanned(planned.filter((e) => e.id !== id)), [planned, writePlanned])
  const submitEntry = useCallback(
    (values: Omit<PlannedEntry, 'id'>) => {
      // Editar preserva o id; criar inventa um que não colide com nenhum existente — a
      // validação do serviço recusa ids repetidos, e um contador sobre o TAMANHO da lista
      // repetiria assim que alguém apagasse uma regra do meio.
      //
      // As exceções por mês viajam pelo mesmo caminho do id, e pelo mesmo motivo: não há campo
      // para elas na gaveta, então elas não podem sair de lá — quem edita é que as carrega
      // intactas. Enquanto a gaveta as devolvia no payload, ela afirmava um dado que nenhuma
      // tecla dela produzia.
      if (editing) return writePlanned(planned.map((e) => (e.id === editing.id ? { ...values, id: editing.id, exceptions: editing.exceptions } : e)))
      const usados = new Set(planned.map((e) => e.id))
      let n = planned.length + 1
      while (usados.has(`regra-${n}`)) n += 1
      writePlanned([...planned, { ...values, id: `regra-${n}` }])
    },
    [editing, planned, writePlanned],
  )

  const preview = useMemo<ForecastRow[]>(() => {
    const toSegments = (byCategory: Map<string, number>): ExpenseSegment[] =>
      [...byCategory]
        .filter(([, value]) => value > 0)
        .map(([categoryId, value]) => ({ categoryId, label: categoryLabel(categoryId), value }))
        .sort((a, b) => b.value - a.value)

    const rows: ForecastRow[] = []
    // O mês em curso não é previsão inteira: metade dele já está no extrato, e aqui só entra
    // o que ainda vence — por isso ele não passa por `buildForecast`.
    if (futureMonths[0] === partialMonth) {
      const pending = pendingFor(input, partialMonth, cutoff)
      rows.push({
        month: partialMonth,
        income: toCents(pending.income),
        expense: toCents(pending.expense),
        net: toCents(pending.income - pending.expense),
        segments: toSegments(pending.byCategory),
        partial: true,
      })
    }

    const targets = futureMonths.filter((month) => month > partialMonth)
    const byCategory = buildCategoryForecast({ ...input, targets })
    for (const month of buildForecast({ ...input, targets })) {
      const perCategory = new Map(Object.entries(byCategory).map(([categoryId, months]) => [categoryId, months[month.month] ?? 0]))
      rows.push({ month: month.month, income: month.income, expense: month.expense, net: month.net, segments: toSegments(perCategory), sources: month.sources })
    }
    return rows
  }, [futureMonths, partialMonth, cutoff, input])

  return (
    <div className="flex flex-col gap-5">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Previsão</h1>
            <p className="text-xs text-muted-foreground">Nada é extrapolado do histórico: os meses à frente mostram só o que está declarado aqui, mais as parcelas de cartão já compradas.</p>
          </div>
          {/* O disparador de criação mora no cabeçalho da PÁGINA, e não no da seção: esta tela
              não tem faixa de controles onde pendurá-lo (§12.4 da `tables-and-listings.md`), e
              é exatamente onde Planos e Rubricas já põem o deles. Um botão de criar que muda de
              lugar conforme a tela anula a memória que a pessoa construiu na tela anterior — é
              esse o custo, não a estética. */}
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              disabled={saving}
              onClick={() => {
                setEditing(null)
                setSheetOpen(true)
              }}
            >
              {/* O rótulo NOMEIA O DESTINO (§12.1): é o mesmo texto do `SheetTitle` da gaveta
                  que ele abre. "Adicionar" sozinho não diz nem o que se adiciona. */}
              <Plus /> Novo lançamento previsto
            </Button>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Lançamentos previstos</CardTitle>
          <CardDescription>
            Declarado por você e guardado NESTE navegador — <code className="font-mono">scripts/planned.config.ts</code> só semeia um navegador que ainda não tem nada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {planned.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarDot />
                </EmptyMedia>
                <EmptyTitle>Nenhum lançamento previsto</EmptyTitle>
                <EmptyDescription>Enquanto não houver regras, os meses futuros mostram só as parcelas de cartão já contratadas.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <DataList aria-label="Lançamentos previstos">
              {planned.map((entry) => {
                const exceptions = Object.entries(entry.exceptions ?? {}).sort()
                const due = describeDueDay(entry, futureMonths)
                return (
                  <DataListItem key={entry.id}>
                    <DataListItemHeader className="justify-start gap-1.5">
                      <span className="min-w-0 truncate">{entry.label}</span>
                      <EntityBadge entity={entry.entity} />
                      <FlowBadge value={entry.kind} />
                      {/* As ações ficam à direita da linha, empurradas pelo `ml-auto`, e são
                          `ghost`: com uma lista de regras na tela, um par de botões emoldurados
                          por linha pesaria mais que o nome da própria regra — a decisão escrita
                          em `plan-row-controls.tsx`. Aqui elas estão fora de qualquer
                          `ButtonGroup`, então o argumento vale inteiro. */}
                      <div className="ml-auto flex shrink-0 items-center gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Editar ${entry.label}`}
                          disabled={saving}
                          onClick={() => {
                            setEditing(entry)
                            setSheetOpen(true)
                          }}
                        >
                          <PencilSimple />
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label={`Excluir ${entry.label}`} disabled={saving} onClick={() => removeEntry(entry.id)}>
                          <Trash />
                        </Button>
                      </div>
                    </DataListItemHeader>
                    <DataListItemFields>
                      <DataListField label="Valor" separator={false}>
                        {formatBRL(entry.amount)}
                      </DataListField>
                      <DataListField label="Categoria">
                        <CategoryBadge value={entry.categoryId} />
                      </DataListField>
                      <DataListField label="Quando">{describeWhen(entry)}</DataListField>
                      {due ? <DataListField label="Dia">{due}</DataListField> : null}
                      {exceptions.length === 0 ? null : (
                        <DataListField label="Exceções">{exceptions.map(([month, value]) => `${formatMonthShort(month)}: ${formatBRL(value)}`).join(' · ')}</DataListField>
                      )}
                    </DataListItemFields>
                  </DataListItem>
                )
              })}
            </DataList>
          )}
        </CardContent>
      </Card>

      {error && (
        <p className="text-destructive flex items-start gap-2 text-xs">
          <Warning className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
      {/* Não há aviso de "recarregue a página": esta tela LÊ o estado editável, então o
          gráfico e a tabela já se moveram junto com a lista. O aviso só faz sentido onde o
          efeito de fato espera um refresh. */}

      <PlannedSheet open={sheetOpen} onOpenChange={setSheetOpen} editing={editing} defaultMonth={shiftMonth(partialMonth, 1)} minMonth={monthsWithData[0] ?? partialMonth} onSubmit={submitEntry} />

      <SimulationCard groups={groups} considering={considering} simulated={simulated} onToggle={toggleSimulated} />

      <Card>
        <CardHeader>
          <CardTitle>Previsão mês a mês</CardTitle>
          <CardDescription>A mesma previsão da Visão geral, com a origem de cada real discriminada.</CardDescription>
        </CardHeader>
        <CardContent>
          <ForecastList rows={preview} />
        </CardContent>
      </Card>
    </div>
  )
}
