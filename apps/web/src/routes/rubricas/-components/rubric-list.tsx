import { ListBullets, Plus, Trash } from '@phosphor-icons/react'
import { CategoryBadge } from '@/components/category-badge'
import { DataList, DataListField, DataListItem, DataListItemFields, DataListItemHeader } from '@/components/data-list/data-list'
import { useState } from 'react'
import { NotInformed } from '@/components/not-informed'
import { BarProgress } from '@wlet/ui/components/bar-progress'
import { Button } from '@wlet/ui/components/button'
import { MoneyInput } from '@wlet/ui/components/money-input'
import { RubricItemRow } from './rubric-item-row'
import type { BudgetCategory, BudgetItem } from '@wlet/domain'
import { BUDGET, BUDGET_STATE, budgetState } from '@/lib/budget'
import { formatBRL, formatPercent } from '@wlet/lib/format'
import { cn } from '@wlet/lib/utils'

export interface Rubric {
  categoryId: string
  label: string
  /** JÁ resolvido: numa rubrica composta é a soma dos itens, não o `amount` gravado. */
  amount: number
  spent: number
  items?: BudgetItem[]
}

interface Props {
  rubrics: Rubric[]
  /**
   * A janela JÁ COM a preposição: "em setembro de 2026" ou "de 31 ago a 06 set".
   *
   * Ela vem pronta porque a regência muda com a base — um intervalo em português pede
   * "de … a …", não "em … a …" —, e quem sabe qual é a janela é a tela. A lista só interpola.
   */
  windowLabel: string
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
/**
 * O valor de uma rubrica sem composição.
 *
 * É componente próprio porque precisa de estado — o rascunho que só sobe no blur — e um hook
 * não pode viver dentro do `map` da lista. Mesmo motivo e mesmo remédio da linha de item: com
 * a gravação por tecla, `saving` desabilitava o campo e o foco ia para o `body`.
 */
function RubricAmountField({ rubric, onCommit }: { rubric: Rubric; onCommit: (amount: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null)
  return (
    <MoneyInput
      aria-label={`Planejado para ${rubric.label}`}
      value={draft ?? rubric.amount}
      onValueChange={setDraft}
      onBlur={() => {
        if (draft !== null && draft !== rubric.amount) onCommit(draft)
        setDraft(null)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

export function RubricList({ rubrics, windowLabel, disabled, onChange, onRemove }: Props) {
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
                {/* A cor sai da lista única de `BudgetState`, e não de um ternário local: era
                    assim que `--status-warning-text` — token que nunca existiu — sobrevivia
                    aqui deixando "perto do limite" sem cor nenhuma. */}
                <span className={cn('tabular-nums', BUDGET_STATE[state].text)}>{formatPercent(share, 0)}</span>
                {/* Com composição o total vira TEXTO: um campo desabilitado convida a editar o
                    que não se edita, e aqui o total é consequência da lista abaixo. */}
                {composed ? (
                  <span className="w-32 text-right font-mono tabular-nums">{formatBRL(rubric.amount)}</span>
                ) : (
                  <div className="w-32">
                    <RubricAmountField rubric={rubric} onCommit={(amount) => onChange(rubric.categoryId, { amount })} />
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
                        onChange(rubric.categoryId, { items: [{ label: '', quantity: 1, unitAmount: rubric.amount }] })
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
              color={BUDGET_STATE[state].bar}
              getAriaValueText={() => `${formatBRL(rubric.spent)} de ${formatBRL(rubric.amount)}`}
            >
              <span className="sr-only">{rubric.label}</span>
            </BarProgress>

            <DataListItemFields>
              <DataListField label={`Gasto ${windowLabel}`} separator={false}>
                {formatBRL(rubric.spent)}
              </DataListField>
              <DataListField label="Planejado">{formatBRL(rubric.amount)}</DataListField>
              <DataListField label={left >= 0 ? 'Ainda cabe' : 'Passou'}>{formatBRL(Math.abs(left))}</DataListField>
            </DataListItemFields>

            {/* O rail à esquerda diz "isto pertence à rubrica de cima" sem moldura nem título. */}
            {composed && (
              /*
                Rola na horizontal em vez de espremer: a linha tem seis colunas de largura
                declarada, e deixá-las encolher faria "R$ 1.000,00" caber em 60px. É a mesma
                saída da `TransactionTable`, e o `pb-1` reserva o trilho da barra de rolagem
                para ela não cobrir a última linha.
              */
              <ul className="border-border ml-1 space-y-2 overflow-x-auto border-l pb-1 pl-3">
                {items.map((item, index) => (
                  // Chave por índice porque o item não tem id e o rótulo é editável: com o
                  // rótulo na chave, digitar uma letra remontaria a linha e o foco saltaria do
                  // campo a cada tecla.
                  // biome-ignore lint/suspicious/noArrayIndexKey: ver acima
                  <li key={index}>
                    <RubricItemRow
                      item={item}
                      disabled={disabled}
                      onChange={(patch) => setItem(index, patch)}
                      onRemove={() => onChange(rubric.categoryId, { items: items.filter((_, i) => i !== index) })}
                      canRemove={items.length > 1}
                    />
                  </li>
                ))}
                <li>
                  {/* Nasce VAZIO: sem nome, sem quantidade, sem preço. Quem preenche é quem sabe. */}
                  <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(rubric.categoryId, { items: [...items, { label: '', quantity: 0, unitAmount: 0 }] })}>
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
