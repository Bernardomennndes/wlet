import { Warning } from '@phosphor-icons/react'
import { useCallback, useMemo } from 'react'
import { KpiCard, KpiCardGrid } from '@/components/kpi'
import { AppCombobox } from '@/components/ui/app-combobox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CATEGORIES, categoryLabel } from '@/data/categories'
import type { Budget, BudgetCategory } from '@/data/types'
import { useDeclarations } from '@/hooks/use-declarations'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { lastMonthWithData, sum } from '@/lib/finance'
import { formatBRL, formatMonthLongLabel } from '@/lib/format'
import { rubricAmount, rubricSpent } from '@/lib/rubric'
import { useFilters } from '@/providers/use-filters'
import { RubricList } from './-components/rubric-list'
import { RUBRICAS_METRICS } from './-metric-definitions'

/** O valor do sentinela do combobox de adicionar. Não é uma categoria: é "nenhuma escolha". */
const ADD = ''

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

  const currentMonth = lastMonthWithData()
  const budget: Budget = current.budget
  const declared = useMemo(() => budget.byCategory ?? [], [budget])

  const rubrics = useMemo(
    () =>
      declared.map((rubric) => ({
        ...rubric,
        // Resolvido AQUI, uma vez: a lista abaixo recebe o número que vale e não precisa
        // saber que uma rubrica pode ser composta.
        amount: rubricAmount(rubric),
        label: categoryLabel(rubric.categoryId),
        spent: rubricSpent(history, currentMonth, rubric.categoryId),
      })),
    [declared, history, currentMonth],
  )

  const planned = sum(rubrics.map((r) => r.amount))
  const spent = sum(rubrics.map((r) => r.spent))
  const left = planned - spent

  const setBudget = useCallback((byCategory: BudgetCategory[]) => save({ budget: { ...budget, byCategory } }), [budget, save])

  const onChange = useCallback((categoryId: string, patch: Partial<BudgetCategory>) => setBudget(declared.map((r) => (r.categoryId === categoryId ? { ...r, ...patch } : r))), [declared, setBudget])
  const onRemove = useCallback((categoryId: string) => setBudget(declared.filter((r) => r.categoryId !== categoryId)), [declared, setBudget])

  // Uma categoria só pode ter UMA rubrica: duas somariam duas vezes o mesmo teto, e a tela
  // mostraria duas barras medindo o mesmo gasto.
  const available = EXPENSE_ITEMS.filter((c) => !declared.some((r) => r.categoryId === c.value))

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Rubricas</h1>
          <p className="text-muted-foreground text-xs">Gasto esperado por categoria. Teto no mês em curso, previsão nos meses futuros — e na projeção é piso, não soma.</p>
        </div>
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
          label="Planejado no mês"
          definition={RUBRICAS_METRICS.planned}
          value={planned > 0 ? formatBRL(planned) : null}
          emptyLabel="Nenhuma rubrica"
          hint={`${rubrics.length} ${rubrics.length === 1 ? 'categoria' : 'categorias'}`}
        />
        <KpiCard label="Gasto no mês" definition={RUBRICAS_METRICS.spent} value={planned > 0 ? formatBRL(spent) : null} hint={formatMonthLongLabel(currentMonth)} />
        <KpiCard
          label={left >= 0 ? 'Ainda cabe' : 'Passou'}
          definition={RUBRICAS_METRICS.left}
          value={planned > 0 ? formatBRL(Math.abs(left)) : null}
          hint={left >= 0 ? 'do planejado' : 'acima do planejado'}
        />
      </KpiCardGrid>

      <Card>
        <CardHeader>
          <CardTitle>Rubricas de gasto</CardTitle>
          <CardDescription>O gasto do mês contra o planejado. O valor é editado aqui mesmo — e pode ser detalhado item a item.</CardDescription>
        </CardHeader>
        <CardContent>
          <RubricList rubrics={rubrics} month={currentMonth} disabled={saving} onChange={onChange} onRemove={onRemove} />
        </CardContent>
      </Card>
    </div>
  )
}
