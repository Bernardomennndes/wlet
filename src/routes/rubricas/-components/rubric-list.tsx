import { ListBullets, Plus, Trash } from '@phosphor-icons/react'
import { CategoryBadge } from '@/components/category-badge'
import { DataList, DataListField, DataListItem, DataListItemFields, DataListItemHeader } from '@/components/data-list/data-list'
import { NotInformed } from '@/components/not-informed'
import { BarProgress } from '@/components/ui/bar-progress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import type { BudgetCategory, BudgetItem } from '@/data/types'
import { BUDGET, budgetState, type BudgetState } from '@/lib/budget'
import { formatBRL, formatMonthLongLabel, formatPercent } from '@/lib/format'
import { itemAmount } from '@/lib/rubric'
import { cn } from '@/lib/utils'

export interface Rubric {
  categoryId: string
  label: string
  /** JÁ resolvido: numa rubrica composta é a soma dos itens, não o `amount` gravado. */
  amount: number
  spent: number
  items?: BudgetItem[]
}

/** A mesma tradução de situação em cor do cartão de orçamento — uma régua só nas duas telas. */
const BAR_COLOR: Record<BudgetState, string> = {
  ok: 'var(--series-expense)',
  warning: 'var(--status-warning)',
  over: 'var(--status-critical)',
}

interface Props {
  rubrics: Rubric[]
  month: string
  disabled: boolean
  onChange: (categoryId: string, patch: Partial<BudgetCategory>) => void
  onRemove: (categoryId: string) => void
}

/**
 * As rubricas do mês em curso — medidas e editadas no MESMO lugar.
 *
 * Elas viviam em duas telas: o acompanhamento em Pagamentos e a edição em Configuração. Quem
 * via a barra estourada tinha de ir a outra tela para mexer no número, e quem mexia no número
 * não via o gasto que o motivou. Aqui a barra e o campo que a governa ficam na mesma linha.
 *
 * Edita na LINHA e grava na hora, sem botão de confirmar — mesma escolha da lista de Planos, e
 * pela mesma razão: são números que se calibram várias vezes seguidas, e uma gaveta cobraria
 * três cliques por ajuste.
 *
 * **A categoria não se troca**: ela é a IDENTIDADE da rubrica, não um campo dela — "o
 * planejado de Mercado" que vira "o planejado de Lazer" é outra rubrica, e o gasto medido ao
 * lado passaria a descrever outra coisa sem nada na tela mudando de lugar. Para corrigir uma
 * escolha errada, remova e crie; a rubrica recém-criada não tem itens que valha preservar.
 *
 * A barra para em 100%: o excedente é dito pela cor e pelo número, porque uma barra que
 * estoura o trilho não tem como ser comparada com a da rubrica vizinha — mesma decisão do
 * cartão de orçamento da Visão geral.
 */
export function RubricList({ rubrics, month, disabled, onChange, onRemove }: Props) {
  if (rubrics.length === 0) {
    return <NotInformed>Nenhuma rubrica declarada</NotInformed>
  }
  return (
    <DataList aria-label="Rubricas de gasto">
      {rubrics.map((rubric) => {
        const share = rubric.amount > 0 ? rubric.spent / rubric.amount : 0
        // O mesmo limiar do teto global, para "perto do limite" significar a mesma coisa nas
        // duas telas — um `warnAt` por rubrica seria outra régua sem motivo.
        const state = budgetState(rubric.spent, { monthlyLimit: rubric.amount, warnAt: BUDGET.warnAt })
        const left = rubric.amount - rubric.spent
        const items = rubric.items ?? []
        const composed = items.length > 0

        const setItem = (index: number, patch: Partial<BudgetItem>) => onChange(rubric.categoryId, { items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) })

        return (
          <DataListItem key={rubric.categoryId} className="gap-2">
            <DataListItemHeader>
              <CategoryBadge value={rubric.categoryId} />
              <div className="flex items-center gap-2">
                <span className={cn('tabular-nums', state === 'over' && 'text-[var(--status-critical)]', state === 'warning' && 'text-[var(--status-warning-text)]')}>{formatPercent(share, 0)}</span>
                {/* Com composição o total vira TEXTO: um campo desabilitado convida a editar o
                    que não se edita, e aqui o total é consequência da lista abaixo. */}
                {composed ? (
                  <span className="w-32 text-right font-mono tabular-nums">{formatBRL(rubric.amount)}</span>
                ) : (
                  <div className="w-32">
                    <MoneyInput value={rubric.amount} disabled={disabled} onValueChange={(v) => onChange(rubric.categoryId, { amount: v ?? 0 })} />
                  </div>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() =>
                    composed
                      ? // Largar a composição PRESERVA o total: desfazer não é apagar.
                        onChange(rubric.categoryId, { items: undefined, amount: rubric.amount })
                      : // E detalhar herda o valor que já existia, pelo mesmo motivo.
                        onChange(rubric.categoryId, { items: [{ label: 'Novo item', quantity: 1, unitAmount: rubric.amount }] })
                  }
                >
                  <ListBullets /> {composed ? 'Usar valor único' : 'Detalhar'}
                </Button>
                <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`Remover a rubrica de ${rubric.label}`} onClick={() => onRemove(rubric.categoryId)}>
                  <Trash />
                </Button>
              </div>
            </DataListItemHeader>

            <BarProgress
              value={Math.min(rubric.spent, rubric.amount)}
              max={rubric.amount}
              color={BAR_COLOR[state]}
              getAriaValueText={() => `${formatBRL(rubric.spent)} de ${formatBRL(rubric.amount)}`}
            >
              <span className="sr-only">{rubric.label}</span>
            </BarProgress>

            <DataListItemFields>
              <DataListField label={`Gasto em ${formatMonthLongLabel(month).toLowerCase()}`} separator={false}>
                {formatBRL(rubric.spent)}
              </DataListField>
              <DataListField label="Planejado">{formatBRL(rubric.amount)}</DataListField>
              <DataListField label={left >= 0 ? 'Ainda cabe' : 'Passou'}>{formatBRL(Math.abs(left))}</DataListField>
            </DataListItemFields>

            {/* O rail à esquerda diz "isto pertence à rubrica de cima" sem moldura nem título. */}
            {composed && (
              <ul className="border-border ml-1 space-y-2 border-l pl-3">
                {items.map((item, index) => (
                  // Chave por índice porque o item não tem id e o rótulo é editável: com o
                  // rótulo na chave, digitar uma letra remontaria a linha e o foco saltaria do
                  // campo a cada tecla.
                  // biome-ignore lint/suspicious/noArrayIndexKey: ver acima
                  <li key={index} className="flex flex-wrap items-center gap-2">
                    <Input className="w-44" disabled={disabled} value={item.label} aria-label="Nome do item" onChange={(e) => setItem(index, { label: e.target.value })} />
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      className="w-20"
                      disabled={disabled}
                      value={item.quantity}
                      aria-label={`Quantidade de ${item.label}`}
                      onChange={(e) => setItem(index, { quantity: Number(e.target.value) || 0 })}
                    />
                    <span className="text-muted-foreground">×</span>
                    <div className="w-32">
                      <MoneyInput value={item.unitAmount} disabled={disabled} onValueChange={(v) => setItem(index, { unitAmount: v ?? 0 })} />
                    </div>
                    <span className="text-muted-foreground">=</span>
                    <span className="font-mono tabular-nums">{formatBRL(itemAmount(item))}</span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      // O ÚLTIMO item não sai: composição vazia somaria zero e a rubrica
                      // sumiria da previsão sem nada dizer. Para largar a composição existe
                      // "Usar valor único", que preserva o total.
                      disabled={disabled || items.length === 1}
                      aria-label={`Remover ${item.label}`}
                      onClick={() => onChange(rubric.categoryId, { items: items.filter((_, i) => i !== index) })}
                    >
                      <Trash />
                    </Button>
                  </li>
                ))}
                <li>
                  <Button size="sm" variant="outline" disabled={disabled} onClick={() => onChange(rubric.categoryId, { items: [...items, { label: 'Novo item', quantity: 1, unitAmount: 0 }] })}>
                    <Plus /> Adicionar item
                  </Button>
                </li>
              </ul>
            )}
          </DataListItem>
        )
      })}
    </DataList>
  )
}
