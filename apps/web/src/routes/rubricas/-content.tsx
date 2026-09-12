import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Budget, BudgetCategory } from '@wlet/domain'
import { CATEGORIES, categoryLabel } from '@wlet/domain'
import { MONTHLY_OCCURRENCES, monthRange, rubricAmount, rubricSpent, weekRange } from '@wlet/domain/rubric'
import { formatBRL, formatDayMonth, formatMonthLongLabel } from '@wlet/lib/format'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@wlet/ui/components/alert-dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wlet/ui/components/card'
import { ToggleGroup, ToggleGroupItem } from '@wlet/ui/components/toggle-group'
import { toast } from '@wlet/ui/toast'
import { useCallback, useMemo, useState } from 'react'
import { api } from '@/api'
import { KpiCard, KpiCardGrid } from '@/components/kpi'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { declarations } from '@/lib/dataset'
import { lastDateWithData, lastMonthWithData, sum } from '@/lib/finance'
import { useFilters } from '@/providers/use-filters'
import { services } from '@/services'
import { AddRubricButton } from './-components/add-rubric-button'
import { RubricList } from './-components/rubric-list'
import { RUBRICAS_METRICS } from './-metric-definitions'

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
  const queryClient = useQueryClient()
  // A mesma leitura da Configuração, e a mesma chave: as duas telas editam o MESMO agregado, e é
  // a chave vinda do contrato que faz uma enxergar o que a outra gravou. A explicação de por que
  // o `queryFn` não é o de fábrica está em `routes/configuracao/-content.tsx`.
  const { data: declarado } = useQuery({ queryKey: api().config.get.key(), queryFn: () => services().config.load(), initialData: declarations })

  const [base, setBase] = useState<Base>('month')
  /**
   * A rubrica esperando confirmação — o id da categoria, não o objeto.
   *
   * A categoria É a identidade de uma rubrica (uma por categoria, pela regra logo abaixo), então o
   * id basta para reabrir o rótulo; guardar o objeto arriscaria mostrar na pergunta um valor que a
   * lista já atualizou.
   */
  const [rubricaParaRemover, setRubricaParaRemover] = useState<string | null>(null)
  const currentMonth = lastMonthWithData()
  const today = lastDateWithData()
  const budget: Budget = declarado.budget
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

  /**
   * TRÊS escritas, três avisos — e o texto de cada um nomeia a categoria.
   *
   * A tentação é uma só, "gravarRubricas", com a lista nova por parâmetro: ela seria menor e
   * diria "Rubricas guardadas" para adicionar, editar e remover igualmente. Quem acabou de
   * remover Mercado precisa ler que Mercado saiu — é a única confirmação de que clicou na linha
   * certa. A mensagem é do ponto de uso, e por isso as escritas são três.
   *
   * Nenhuma trata erro: ele é um só, no `MutationCache` do provider.
   */
  const gravarRubricas = useCallback((byCategory: BudgetCategory[]) => services().config.replace({ ...declarado, budget: { ...budget, byCategory } }), [declarado, budget])

  /**
   * O resultado entra no cache NA HORA, e a chave é invalidada em seguida — as duas coisas.
   *
   * Sem o `setQueryData`, duas edições seguidas partiriam do mesmo retrato e a segunda gravaria
   * por cima da primeira. Sem a invalidação, a tela passaria a confiar na resposta de uma escrita
   * como se fosse leitura.
   */
  const aplicar = useCallback(
    (proximo: Awaited<ReturnType<typeof gravarRubricas>>) => {
      queryClient.setQueryData(api().config.get.key(), proximo)
      void queryClient.invalidateQueries({ queryKey: api().config.key() })
    },
    [queryClient],
  )

  const { mutate: adicionar, isPending: adicionando } = useMutation({
    mutationFn: ({ categoryId }: { categoryId: string }) => gravarRubricas([...declared, { categoryId, amount: 0 }]),
    onSuccess: (proximo, { categoryId }) => {
      aplicar(proximo)
      toast.success(`Rubrica de ${categoryLabel(categoryId)} criada`)
    },
  })

  const { mutate: editar, isPending: editando } = useMutation({
    mutationFn: ({ categoryId, patch }: { categoryId: string; patch: Partial<BudgetCategory> }) => gravarRubricas(declared.map((r) => (r.categoryId === categoryId ? { ...r, ...patch } : r))),
    onSuccess: (proximo, { categoryId }) => {
      aplicar(proximo)
      toast.success(`Rubrica de ${categoryLabel(categoryId)} guardada`)
    },
  })

  const { mutate: remover, isPending: removendo } = useMutation({
    mutationFn: ({ categoryId }: { categoryId: string }) => gravarRubricas(declared.filter((r) => r.categoryId !== categoryId)),
    onSuccess: (proximo, { categoryId }) => {
      aplicar(proximo)
      toast.success(`Rubrica de ${categoryLabel(categoryId)} removida`)
    },
  })

  const onChange = useCallback((categoryId: string, patch: Partial<BudgetCategory>) => editar({ categoryId, patch }), [editar])
  // ABRE a pergunta em vez de remover: mutação instantânea e sem formulário pede confirmação
  // (`mutation-confirmation.md` §1), e uma rubrica removida por engano leva o teto e os itens dela.
  const onRemove = useCallback((categoryId: string) => setRubricaParaRemover(categoryId), [])

  // Uma categoria só pode ter UMA rubrica: duas somariam duas vezes o mesmo teto, e a tela
  // mostraria duas barras medindo o mesmo gasto.
  const available = EXPENSE_ITEMS.filter((c) => !declared.some((r) => r.categoryId === c.value))

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Rubricas</h1>
          <p className="text-muted-foreground text-xs">Gasto esperado por categoria. Teto no mês em curso, previsão nos meses futuros — e na projeção é piso, não soma.</p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {/* O planejado é declarado por mês; em semana ele é DIVIDIDO, nunca remedido. */}
          <ToggleGroup variant="outline" spacing={0} value={[base]} onValueChange={(next) => next[0] && setBase(next[0] as Base)} aria-label="Base de leitura">
            <ToggleGroupItem value="week">Semana</ToggleGroupItem>
            <ToggleGroupItem value="month">Mês</ToggleGroupItem>
          </ToggleGroup>
          {/* Adicionar é ESCOLHER A CATEGORIA, então a lista precisa existir — a categoria é a
                identidade da rubrica e não se troca depois. O que mudou foi o CONTROLE: um
                combobox afirma um valor, e isto é uma ação. Ver `add-rubric-button.tsx`. */}
          {available.length > 0 && <AddRubricButton options={available} disabled={adicionando} onPick={(categoryId) => adicionar({ categoryId })} />}
        </div>
      </header>

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
          {/* A lista inteira espera enquanto uma linha grava: editar e remover reordenam o
              mesmo agregado, e deixar a segunda linha editável durante a gravação da primeira
              faria a segunda partir de um retrato vencido. */}
          <RubricList rubrics={rubrics} windowLabel={windowLabel} disabled={editando || removendo} onChange={onChange} onRemove={onRemove} />
        </CardContent>
      </Card>

      {/* A pergunta nomeia a categoria e diz o que sai junto: uma rubrica pode ter itens detalhados,
          e quem só vê a barra não sabe que eles existem. */}
      <AlertDialog open={rubricaParaRemover !== null} onOpenChange={(aberto) => !aberto && setRubricaParaRemover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta rubrica?</AlertDialogTitle>
            <AlertDialogDescription>
              O teto de <strong>{rubricaParaRemover ? categoryLabel(rubricaParaRemover) : ''}</strong> sai do planejamento, com os itens detalhados dele. O gasto já lançado continua onde está.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (rubricaParaRemover) remover({ categoryId: rubricaParaRemover })
                setRubricaParaRemover(null)
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
