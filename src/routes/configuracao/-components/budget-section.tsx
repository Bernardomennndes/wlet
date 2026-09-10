import { ListBullets, Plus, Trash } from '@phosphor-icons/react'
import { AppCombobox } from '@/components/ui/app-combobox'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { CATEGORIES } from '@/data/categories'
import type { Budget, BudgetCategory, BudgetItem } from '@/data/types'
import { formatBRL } from '@/lib/format'
import { hasComposition, itemAmount, rubricAmount } from '@/lib/rubric'

const EXPENSE_ITEMS = CATEGORIES.filter((c) => c.kind === 'expense').map((c) => ({ value: c.id, label: c.label, description: c.description }))

/**
 * Teto do mês e rubricas por categoria.
 *
 * Edita na LINHA e grava na hora, sem botão de confirmar — mesma escolha da lista de Planos, e
 * pela mesma razão: são números que se mexem várias vezes seguidas enquanto se calibra, e uma
 * gaveta cobraria três cliques por ajuste.
 *
 * A rubrica tem DUAS formas, e a tela mostra uma de cada vez: um valor digitado, ou uma
 * composição de itens cuja soma é o valor. Quem tem composição não tem campo de total — ele
 * vira texto —, porque um campo desabilitado convida a editar o que não se edita, e porque o
 * total passa a ser consequência da lista e não uma segunda opinião sobre ela.
 */
export function BudgetSection({ budget, onChange, disabled }: { budget: Budget; onChange: (next: Budget) => void; disabled: boolean }) {
  const rubrics = budget.byCategory ?? []
  const used = new Set(rubrics.map((r) => r.categoryId))
  const available = EXPENSE_ITEMS.filter((c) => !used.has(c.value))

  const setRubric = (index: number, patch: Partial<BudgetCategory>) => {
    onChange({ ...budget, byCategory: rubrics.map((r, i) => (i === index ? { ...r, ...patch } : r)) })
  }

  const setItem = (rubricIndex: number, itemIndex: number, patch: Partial<BudgetItem>) => {
    const items = (rubrics[rubricIndex].items ?? []).map((item, i) => (i === itemIndex ? { ...item, ...patch } : item))
    setRubric(rubricIndex, { items })
  }

  /**
   * O primeiro item herda o valor que a rubrica já tinha, em UMA unidade.
   *
   * Detalhar não pode zerar o planejamento: quem tinha R$ 1.200 declarados e clica aqui
   * perderia o número e teria de lembrá-lo. Herdando, o total não se mexe e só falta dizer de
   * que ele é feito — a mesma escolha da migração do envelope de planos, onde o preço à vista
   * recebe o valor conhecido em vez de nascer vazio.
   */
  const detail = (index: number) => setRubric(index, { items: [{ label: 'Novo item', quantity: 1, unitAmount: rubrics[index].amount }] })

  /** Voltar ao valor único PRESERVA o total, pelo mesmo motivo: desfazer não é apagar. */
  const undetail = (index: number) => setRubric(index, { items: undefined, amount: rubricAmount(rubrics[index]) })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Teto de gastos e rubricas</CardTitle>
        <CardDescription>O mesmo número é teto no mês em curso e previsão nos futuros — e na projeção é piso, não soma.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1">
            <span className="text-muted-foreground block">Teto mensal</span>
            {/* A largura vai no INVÓLUCRO: `MoneyInput` espalha as props no input interno, e
                não no `InputGroup` que o envolve — uma classe de largura passada a ele não
                alcança quem de fato ocupa o espaço. */}
            <div className="w-40">
              <MoneyInput value={budget.monthlyLimit} onValueChange={(v) => onChange({ ...budget, monthlyLimit: v ?? 0 })} disabled={disabled} />
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground block">Avisa a partir de</span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={100}
                step={1}
                className="w-20"
                disabled={disabled}
                value={Math.round(budget.warnAt * 100)}
                // O config guarda FRAÇÃO e a tela mostra PORCENTAGEM: digitar "0,75" para
                // dizer 75% é o tipo de coisa que a pessoa erra uma vez e não entende por quê.
                onChange={(e) => onChange({ ...budget, warnAt: Math.min(100, Math.max(1, Number(e.target.value) || 1)) / 100 })}
              />
              <span className="text-muted-foreground">% do teto</span>
            </div>
          </label>
        </div>

        <div className="space-y-2">
          {rubrics.map((rubric, index) => {
            const composed = hasComposition(rubric)
            const items = rubric.items ?? []
            return (
              <div key={rubric.categoryId} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <AppCombobox items={EXPENSE_ITEMS} value={rubric.categoryId} onValueChange={(v) => setRubric(index, { categoryId: v })} aria-label="Categoria da rubrica" className="w-56" />
                  {composed ? (
                    <span className="w-36 font-mono tabular-nums" aria-label={`Total da rubrica de ${rubric.categoryId}`}>
                      {formatBRL(rubricAmount(rubric))}
                    </span>
                  ) : (
                    <div className="w-36">
                      <MoneyInput value={rubric.amount} onValueChange={(v) => setRubric(index, { amount: v ?? 0 })} disabled={disabled} />
                    </div>
                  )}
                  <Button size="sm" variant="ghost" disabled={disabled} onClick={() => (composed ? undetail(index) : detail(index))}>
                    <ListBullets /> {composed ? 'Usar valor único' : 'Detalhar'}
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={`Remover a rubrica de ${rubric.categoryId}`}
                    onClick={() => onChange({ ...budget, byCategory: rubrics.filter((_, i) => i !== index) })}
                  >
                    <Trash />
                  </Button>
                </div>

                {/* O rail à esquerda é o mesmo recurso da barra lateral: ele diz "isto pertence
                    à linha de cima" sem precisar de moldura nem de título. */}
                {composed && (
                  <ul className="border-border ml-2 space-y-2 border-l pl-3">
                    {items.map((item, itemIndex) => (
                      // O índice é a chave porque o item não tem id e o rótulo é editável: com
                      // o rótulo na chave, digitar uma letra remontaria a linha e o foco saltaria
                      // do campo a cada tecla.
                      // biome-ignore lint/suspicious/noArrayIndexKey: ver acima
                      <li key={itemIndex} className="flex flex-wrap items-center gap-2">
                        <Input className="w-44" disabled={disabled} value={item.label} aria-label="Nome do item" onChange={(e) => setItem(index, itemIndex, { label: e.target.value })} />
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          className="w-20"
                          disabled={disabled}
                          value={item.quantity}
                          aria-label={`Quantidade de ${item.label}`}
                          onChange={(e) => setItem(index, itemIndex, { quantity: Number(e.target.value) || 0 })}
                        />
                        <span className="text-muted-foreground">×</span>
                        <div className="w-32">
                          <MoneyInput value={item.unitAmount} onValueChange={(v) => setItem(index, itemIndex, { unitAmount: v ?? 0 })} disabled={disabled} />
                        </div>
                        <span className="text-muted-foreground">=</span>
                        <span className="font-mono tabular-nums">{formatBRL(itemAmount(item))}</span>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={disabled || items.length === 1}
                          aria-label={`Remover ${item.label}`}
                          // O ÚLTIMO item não sai: uma composição vazia somaria zero e a rubrica
                          // desapareceria da previsão sem nada dizer. Para largar a composição
                          // existe "Usar valor único", que preserva o total.
                          onClick={() => setRubric(index, { items: items.filter((_, i) => i !== itemIndex) })}
                        >
                          <Trash />
                        </Button>
                      </li>
                    ))}
                    <li>
                      <Button size="sm" variant="outline" disabled={disabled} onClick={() => setRubric(index, { items: [...items, { label: 'Novo item', quantity: 1, unitAmount: 0 }] })}>
                        <Plus /> Adicionar item
                      </Button>
                    </li>
                  </ul>
                )}
              </div>
            )
          })}
          {rubrics.length === 0 && <p className="text-muted-foreground">Nenhuma rubrica. Sem elas, um gasto sem credor único não entra na previsão.</p>}
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || available.length === 0}
            onClick={() => onChange({ ...budget, byCategory: [...rubrics, { categoryId: available[0].value, amount: 0 }] })}
          >
            <Plus /> Adicionar rubrica
          </Button>
        </div>

        <p className="text-muted-foreground">
          Somam {formatBRL(rubrics.reduce((s, r) => s + rubricAmount(r), 0))} de {formatBRL(budget.monthlyLimit)}.
        </p>
      </CardContent>
    </Card>
  )
}
