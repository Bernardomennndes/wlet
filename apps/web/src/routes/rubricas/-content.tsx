import { Warning } from '@phosphor-icons/react'
import { useCallback, useMemo, useState } from 'react'
import { KpiCard, KpiCardGrid } from '@/components/kpi'
import { AppCombobox } from '@wlet/ui/components/app-combobox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wlet/ui/components/card'
import { CATEGORIES, categoryLabel } from '@wlet/domain'
import type { Budget, BudgetCategory } from '@wlet/domain'
import { useDeclarations } from '@/hooks/use-declarations'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { lastDateWithData, lastMonthWithData, sum } from '@/lib/finance'
import { formatBRL, formatDayMonth, formatMonthLongLabel } from '@wlet/lib/format'
import { ToggleGroup, ToggleGroupItem } from '@wlet/ui/components/toggle-group'
import { MONTHLY_OCCURRENCES, monthRange, rubricAmount, rubricSpent, weekRange } from '@/lib/rubric'
import { useFilters } from '@/providers/use-filters'
import { RubricList } from './-components/rubric-list'
import { RUBRICAS_METRICS } from './-metric-definitions'

/** O valor do sentinela do combobox de adicionar. Não é uma categoria: é "nenhuma escolha". */
const ADD = ''

/**
 * A base de leitura da tela.
 *
 * O padrão é MÊS porque é a base em que a rubrica foi declarada e em que o teto, a Previsão e
 * a Visão geral falam — mudar o padrão para semana faria esta tela discordar de todas as
 * outras sobre o mesmo número. A semana existe porque um consumo declarado "por semana" é
 * conferido por semana: quem come 2 kg de frango por semana quer saber se comeu.
 */
type Base = 'week' | 'month'

const EXPENSE_ITEMS = CATEGORIES.filter((c) => c.kind === 'expense').map((c) => ({ value: c.id, label: c.label, description: c.description }))

/**
 * As rubricas: o gasto esperado por categoria, medido e editado no mesmo lugar.
 *
 * A tela existe porque as duas metades viviam separadas — o acompanhamento em Pagamentos e a
 * edição em Configuração —, e nenhuma das duas respondia sozinha a pergunta que se faz aqui:
 * "estourei, e o que faço com esse número?". Pagamentos ficou com o que tem credor e
 * vencimento, que é a pergunta dela.
 *
 * O que a tela lê é o MÊS EM CURSO, não o período do cabeçalho: uma rubrica é teto de um mês,
 * e estreitar o filtro não pode encolher o gasto que ela mede. É a mesma razão pela qual o
 * cartão de orçamento da Visão geral lê `history`.
 */
export function RubricasPageContent() {
  useDocumentTitle('Rubricas')
  const { history } = useFilters()
  const { current, saving, error, dirty, save } = useDeclarations()

  const [base, setBase] = useState<Base>('month')
  const currentMonth = lastMonthWithData()
  const today = lastDateWithData()
  const budget: Budget = current.budget
  const declared = useMemo(() => budget.byCategory ?? [], [budget])

  /**
   * A janela medida e o divisor do planejado saem JUNTOS, do mesmo lugar.
   *
   * Se um dissesse semana e o outro mês, a barra compararia sete dias de gasto contra um mês
   * de planejamento e toda rubrica pareceria folgada.
   */
  // `range`, e não `window`: o segundo é o objeto global, e sombreá-lo quebra o
  // `window.location.reload()` do aviso de gravação logo abaixo.
  const range = useMemo(() => (base === 'week' ? weekRange(today) : monthRange(currentMonth)), [base, today, currentMonth])
  const divisor = base === 'week' ? MONTHLY_OCCURRENCES.week : 1

  const rubrics = useMemo(
    () =>
      declared.map((rubric) => ({
        ...rubric,
        // Resolvido AQUI, uma vez: a lista abaixo recebe o número que vale e não precisa
        // saber que uma rubrica pode ser composta nem em que base a tela está.
        amount: rubricAmount(rubric) / divisor,
        label: categoryLabel(rubric.categoryId),
        spent: rubricSpent(history, range, rubric.categoryId),
      })),
    [declared, history, range, divisor],
  )

  const planned = sum(rubrics.map((r) => r.amount))
  const spent = sum(rubrics.map((r) => r.spent))
  const left = planned - spent

  /**
   * A janela JÁ vem com a preposição e em CAIXA BAIXA, porque ela entra no meio de uma frase
   * ("Gasto em setembro de 2026"). Não é preciosismo: a regência de um intervalo em português
   * é "de … a …", e com um "em" fixo na lista a base semana imprimia "Gasto em 31 ago a 06
   * set". Quem sabe qual é a janela é esta tela; a lista só a interpola.
   */
  const windowLabel = base === 'week' ? `de ${formatDayMonth(range.from)} a ${formatDayMonth(range.to)}` : `em ${formatMonthLongLabel(currentMonth).toLowerCase()}`
  /** Sem preposição, para o `hint` do KPI e o rótulo do ⓘ, que não formam frase. */
  const windowShort = base === 'week' ? `${formatDayMonth(range.from)} a ${formatDayMonth(range.to)}` : formatMonthLongLabel(currentMonth)
  /**
   * O rótulo segue a BASE, e isso não é detalhe: com "Planejado no mês" sobre um número já
   * dividido por 4,345, o cartão afirmaria um mês inteiro e mostraria uma semana. Um rótulo
   * que não acompanha o número é pior que rótulo nenhum.
   */
  const baseLabel = base === 'week' ? 'na semana' : 'no mês'

  const setBudget = useCallback((byCategory: BudgetCategory[]) => save({ budget: { ...budget, byCategory } }), [budget, save])

  const onChange = useCallback((categoryId: string, patch: Partial<BudgetCategory>) => setBudget(declared.map((r) => (r.categoryId === categoryId ? { ...r, ...patch } : r))), [declared, setBudget])
  const onRemove = useCallback((categoryId: string) => setBudget(declared.filter((r) => r.categoryId !== categoryId)), [declared, setBudget])

  // Uma categoria só pode ter UMA rubrica: duas somariam duas vezes o mesmo teto, e a tela
  // mostraria duas barras medindo o mesmo gasto.
  const available = EXPENSE_ITEMS.filter((c) => !declared.some((r) => r.categoryId === c.value))

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Rubricas</h1>
            <p className="text-muted-foreground text-xs">Gasto esperado por categoria. Teto no mês em curso, previsão nos meses futuros — e na projeção é piso, não soma.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {/* O planejado é declarado por mês; em semana ele é DIVIDIDO, nunca remedido. */}
            <ToggleGroup variant="outline" value={[base]} onValueChange={(next) => next[0] && setBase(next[0] as Base)} aria-label="Base de leitura">
              <ToggleGroupItem value="week">Semana</ToggleGroupItem>
              <ToggleGroupItem value="month">Mês</ToggleGroupItem>
            </ToggleGroup>
            {/*
          Adicionar é ESCOLHER A CATEGORIA, e por isso o controle é um combobox e não um botão.
          A categoria é a identidade da rubrica — não se troca depois —, então ou ela é
          escolhida aqui, ou a pessoa ficaria com a primeira categoria livre da lista e sem
          como corrigir. O sentinela volta a aparecer depois de cada escolha, porque este
          controle não guarda seleção: ele é uma ação.
        */}
            {available.length > 0 && (
              <AppCombobox
                items={[{ value: ADD, label: 'Adicionar rubrica…' }, ...available]}
                value={ADD}
                emptyValue={ADD}
                aria-label="Adicionar rubrica de uma categoria"
                className="w-56"
                onValueChange={(v) => v !== ADD && setBudget([...declared, { categoryId: v, amount: 0 }])}
              />
            )}
          </div>
        </div>
      </header>

      {error && (
        <p className="text-destructive flex items-start gap-2 text-xs">
          <Warning className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
      {dirty && !error && (
        <p className="text-muted-foreground text-xs">
          Guardado.{' '}
          <button type="button" className="underline" onClick={() => window.location.reload()}>
            Recarregue a página
          </button>{' '}
          para a Previsão e a Visão geral passarem a usar.
        </p>
      )}

      <KpiCardGrid columns={3}>
        <KpiCard
          label={`Planejado ${baseLabel}`}
          definition={RUBRICAS_METRICS.planned}
          value={declared.length === 0 ? null : formatBRL(planned)}
          emptyLabel="Nenhuma rubrica"
          hint={`${rubrics.length} ${rubrics.length === 1 ? 'categoria' : 'categorias'}`}
        />
        <KpiCard label={`Gasto ${baseLabel}`} definition={RUBRICAS_METRICS.spent} value={declared.length === 0 ? null : formatBRL(spent)} hint={windowShort} />
        <KpiCard
          label={left >= 0 ? 'Ainda cabe' : 'Passou'}
          definition={RUBRICAS_METRICS.left}
          value={declared.length === 0 ? null : formatBRL(Math.abs(left))}
          hint={left >= 0 ? 'do planejado' : 'acima do planejado'}
        />
      </KpiCardGrid>

      <Card>
        <CardHeader>
          <CardTitle>Rubricas de gasto</CardTitle>
          <CardDescription>O gasto {baseLabel} contra o planejado. O valor é editado aqui mesmo — e pode ser detalhado item a item.</CardDescription>
        </CardHeader>
        <CardContent>
          <RubricList rubrics={rubrics} windowLabel={windowLabel} disabled={saving} onChange={onChange} onRemove={onRemove} />
        </CardContent>
      </Card>
    </div>
  )
}
