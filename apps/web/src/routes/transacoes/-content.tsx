import { useMemo } from 'react'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { useSearchParams } from 'react-router'
import { Download } from '@phosphor-icons/react'
import { TransactionTable } from '@/components/transaction-table'
import { AppCombobox } from '@/components/ui/app-combobox'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CATEGORIES } from '@/data/categories'
import { entityKinds } from '@/data/types'
import { type Flow, ACCOUNTS, accountInScope, flowKinds, sum } from '@/lib/finance'
import { formatBRL, formatMonthShort, plural } from '@/lib/format'
import { useFilters } from '@/providers/use-filters'

const ALL = 'all'
/** Chaves de URL que pertencem a esta tela — as únicas que "Limpar filtros" apaga. */
const FILTER_KEYS = ['q', 'conta', 'categoria', 'fluxo', 'mes']
const CATEGORY_ITEMS = [{ value: ALL, label: 'Todas as categorias' }, ...CATEGORIES.map((c) => ({ value: c.id, label: c.label, description: c.description }))]
const FLOW_ITEMS = [{ value: ALL, label: 'Todos os lançamentos' }, ...flowKinds.map((o) => ({ value: o.value, label: `Só ${o.labelPlural!.toLowerCase()}`, icon: o.icon }))]

export function TransacoesPageContent() {
  useDocumentTitle('Transações')
  const { transactions, months, scope, overrides } = useFilters()
  const [params, setParams] = useSearchParams()

  const q = params.get('q') ?? ''
  const account = params.get('conta') ?? ALL
  const category = params.get('categoria') ?? ALL
  const flowParam = params.get('fluxo')
  const flow: 'all' | Flow = flowKinds.some((o) => o.value === flowParam) ? (flowParam as Flow) : ALL
  const month = params.get('mes') ?? ALL

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value && value !== ALL) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  // "Limpar filtros" apaga só o que esta tela controla. Zerar a query inteira levava
  // junto `recorte`, `de`, `ate` e `tema`, que são do cabeçalho e valem para o app todo.
  const clearFilters = () => {
    const next = new URLSearchParams(params)
    for (const key of FILTER_KEYS) next.delete(key)
    setParams(next, { replace: true })
  }

  const accountItems = useMemo(
    () => [
      { value: ALL, label: 'Todas as contas' },
      // A entidade vem da lista de enum, não do valor cru: é ela que decide a grafia curta,
      // e um rótulo montado aqui divergiria do badge que a mesma linha desenha.
      ...ACCOUNTS.filter((a) => a.type !== 'investment' && accountInScope(a.id, scope)).map((a) => ({
        value: a.id,
        label: a.name,
        description: entityKinds.find((e) => e.value === a.entity)?.shortLabel,
      })),
    ],
    [scope],
  )
  const monthItems = useMemo(() => [{ value: ALL, label: 'Todos os meses' }, ...months.map((m) => ({ value: m, label: formatMonthShort(m) }))], [months])

  // Um parâmetro de URL pode apontar para uma opção que saiu da lista (recorte PF/PJ,
  // período mais estreito, conta de investimento). Nesse caso o filtro cai para "todos":
  // o controle e o que a tabela mostra nunca divergem.
  const accountValue = accountItems.some((i) => i.value === account) ? account : ALL
  const monthValue = monthItems.some((i) => i.value === month) ? month : ALL
  const hasFilters = Boolean(q) || accountValue !== ALL || category !== ALL || flow !== ALL || monthValue !== ALL

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return transactions.filter((tx) => {
      if (accountValue !== ALL && tx.accountId !== accountValue) return false
      if (category !== ALL && tx.displayCategoryId !== category && tx.categoryId !== category) return false
      if (flow !== ALL && tx.flow !== flow) return false
      if (monthValue !== ALL && tx.month !== monthValue) return false
      if (needle && !`${tx.merchant} ${tx.description} ${tx.rawDescription}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [transactions, q, accountValue, category, flow, monthValue])

  const totalIn = sum(rows.filter((t) => t.flow === 'income').map((t) => t.amount))
  // Saída BRUTA e abatimento separados, não a diferença entre eles. O líquido é o que vale no
  // resto do app, mas aqui o cabeçalho resume as linhas FILTRADAS: com o filtro em "Só
  // reembolsos" a subtração dava "saídas −R$ 6.439,69", um rótulo que mente sobre o sinal.
  const totalOut = sum(rows.filter((t) => t.flow === 'expense').map((t) => Math.abs(t.amount)))
  const totalOffset = sum(rows.filter((t) => t.flow === 'reimbursement').map((t) => Math.abs(t.amount)))

  const exportOverrides = () => {
    const blob = new Blob([JSON.stringify(overrides, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'category-overrides.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Transações</h1>
            <p className="text-xs text-muted-foreground">
              {rows.length} {plural(rows.length, 'lançamento', 'lançamentos')} · entradas {formatBRL(totalIn)} · saídas {formatBRL(totalOut)}
              {totalOffset > 0 ? ` · abatido ${formatBRL(totalOffset)}` : ''}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <FieldSet>
          <FieldLegend variant="label" className="sr-only">
            Filtros de transações
          </FieldLegend>
          <FieldGroup className="flex-row flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Field orientation="horizontal" className="w-auto">
                <FieldLabel htmlFor="filtro-busca" className="sr-only">
                  Buscar
                </FieldLabel>
                <Input id="filtro-busca" placeholder="Buscar por estabelecimento ou descrição" value={q} onChange={(e) => set('q', e.target.value)} className="w-72" />
              </Field>
              <Field orientation="horizontal" className="w-auto">
                <FieldLabel htmlFor="filtro-conta" className="sr-only">
                  Conta
                </FieldLabel>
                <AppCombobox id="filtro-conta" aria-label="Conta" value={accountValue} onValueChange={(v) => set('conta', v)} items={accountItems} emptyValue={ALL} className="w-52" />
              </Field>
              <Field orientation="horizontal" className="w-auto">
                <FieldLabel htmlFor="filtro-categoria" className="sr-only">
                  Categoria
                </FieldLabel>
                <AppCombobox id="filtro-categoria" aria-label="Categoria" value={category} onValueChange={(v) => set('categoria', v)} items={CATEGORY_ITEMS} emptyValue={ALL} className="w-56" />
              </Field>
              <Field orientation="horizontal" className="w-auto">
                <FieldLabel htmlFor="filtro-tipo" className="sr-only">
                  Tipo
                </FieldLabel>
                <AppCombobox id="filtro-tipo" aria-label="Tipo" value={flow} onValueChange={(v) => set('fluxo', v)} items={FLOW_ITEMS} emptyValue={ALL} className="w-52" />
              </Field>
              <Field orientation="horizontal" className="w-auto">
                <FieldLabel htmlFor="filtro-mes" className="sr-only">
                  Mês
                </FieldLabel>
                <AppCombobox id="filtro-mes" aria-label="Mês" value={monthValue} onValueChange={(v) => set('mes', v)} items={monthItems} emptyValue={ALL} className="w-40" />
              </Field>
              {hasFilters ? (
                <Button variant="link" size="sm" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline" onClick={exportOverrides} />}>
                  <Download data-icon="inline-start" /> Exportar ajustes ({Object.keys(overrides).length})
                </TooltipTrigger>
                <TooltipContent>Baixa as categorias alteradas manualmente</TooltipContent>
              </Tooltip>
            </div>
          </FieldGroup>
        </FieldSet>

        <Card>
          <CardContent>
            <TransactionTable key={`${q}|${accountValue}|${category}|${flow}|${monthValue}`} rows={rows} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
