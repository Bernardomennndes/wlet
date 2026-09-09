import { Plus, Trash } from '@phosphor-icons/react'
import { AppCombobox } from '@/components/ui/app-combobox'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { CATEGORIES } from '@/data/categories'
import type { Budget, BudgetCategory } from '@/data/types'
import { formatBRL } from '@/lib/format'

const EXPENSE_ITEMS = CATEGORIES.filter((c) => c.kind === 'expense').map((c) => ({ value: c.id, label: c.label, description: c.description }))

/**
 * Teto do mês e rubricas por categoria.
 *
 * Edita na LINHA e grava na hora, sem botão de confirmar — mesma escolha da lista de Planos, e
 * pela mesma razão: são números que se mexem várias vezes seguidas enquanto se calibra, e uma
 * gaveta cobraria três cliques por ajuste. Não há o que compor aqui: a rubrica é um par
 * categoria-valor que já existe ou não existe.
 */
export function BudgetSection({ budget, onChange, disabled }: { budget: Budget; onChange: (next: Budget) => void; disabled: boolean }) {
  const rubrics = budget.byCategory ?? []
  const used = new Set(rubrics.map((r) => r.categoryId))
  const available = EXPENSE_ITEMS.filter((c) => !used.has(c.value))

  const setRubric = (index: number, patch: Partial<BudgetCategory>) => {
    onChange({ ...budget, byCategory: rubrics.map((r, i) => (i === index ? { ...r, ...patch } : r)) })
  }

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
          {rubrics.map((rubric, index) => (
            <div key={rubric.categoryId} className="flex flex-wrap items-center gap-2">
              <AppCombobox items={EXPENSE_ITEMS} value={rubric.categoryId} onValueChange={(v) => setRubric(index, { categoryId: v })} aria-label="Categoria da rubrica" className="w-56" />
              <div className="w-36">
                <MoneyInput value={rubric.amount} onValueChange={(v) => setRubric(index, { amount: v ?? 0 })} disabled={disabled} />
              </div>
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
          ))}
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
          Somam {formatBRL(rubrics.reduce((s, r) => s + r.amount, 0))} de {formatBRL(budget.monthlyLimit)}.
        </p>
      </CardContent>
    </Card>
  )
}
