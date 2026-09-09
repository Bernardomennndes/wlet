import { Plus, Trash } from '@phosphor-icons/react'
import { AppCombobox } from '@/components/ui/app-combobox'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { MonthPicker } from '@/components/ui/month-picker'
import { CATEGORIES } from '@/data/categories'
import { entityKinds, plannedRecurrences, type Entity, type PlannedEntry, type Recurrence } from '@/data/types'
import { DueOnField } from './due-on-field'

const INCOME_ITEMS = CATEGORIES.filter((c) => c.kind === 'income').map((c) => ({ value: c.id, label: c.label, description: c.description }))
const EXPENSE_ITEMS = CATEGORIES.filter((c) => c.kind === 'expense').map((c) => ({ value: c.id, label: c.label, description: c.description }))
const KIND_ITEMS = [
  { value: 'income', label: 'Entrada' },
  { value: 'expense', label: 'Saída' },
]
const RECURRENCE_ITEMS = plannedRecurrences.map((r) => ({ value: r.value, label: r.label }))
const ENTITY_ITEMS = entityKinds.map((e) => ({ value: e.value, label: e.label }))

/**
 * O que você espera pagar e receber nos meses que ainda não têm extrato.
 *
 * **Uma declaração tem duas naturezas, e quem as separa é o campo "credor".** COM credor, a
 * regra é uma CONTA: a tela de Pagamentos pergunta "paguei? atrasou?". SEM credor, é só
 * projeção — que é o certo para gasto sem cobrador único, como alimentação. Forçar alimentação
 * no molde de conta produziria "em atraso" todo mês em que você simplesmente não comprou.
 *
 * Por isso o credor exige o dia: conciliar sem dia deixaria "atrasado" indistinguível de
 * "ainda vai vencer", e a validação recusa a combinação.
 */
export function PlannedSection({ entries, onChange, disabled }: { entries: PlannedEntry[]; onChange: (next: PlannedEntry[]) => void; disabled: boolean }) {
  const patch = (index: number, change: Partial<PlannedEntry>) => onChange(entries.map((e, i) => (i === index ? { ...e, ...change } : e)))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Lançamentos previstos</CardTitle>
        <CardDescription>Com credor, vira conta a pagar e ganha situação. Sem credor, só projeta — que é o certo para gasto sem cobrador único.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        {entries.map((entry, index) => (
          <div key={entry.id} className="space-y-2 border-l-2 pl-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1">
                <span className="text-muted-foreground block">Descrição</span>
                <Input value={entry.label} disabled={disabled} className="w-48" onChange={(e) => patch(index, { label: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground block">Valor</span>
                <div className="w-32">
                  <MoneyInput value={entry.amount} onValueChange={(v) => patch(index, { amount: v ?? 0 })} disabled={disabled} />
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground block">Fluxo</span>
                <AppCombobox
                  items={KIND_ITEMS}
                  value={entry.kind}
                  // Trocar o fluxo zera a CATEGORIA: uma categoria de entrada numa regra de
                  // saída é recusada pela validação, e manter a antiga travaria a gravação
                  // sem a pessoa entender o que fez.
                  onValueChange={(v) => patch(index, { kind: v as 'income' | 'expense', categoryId: '' })}
                  aria-label="Fluxo da regra"
                  className="w-32"
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground block">Categoria</span>
                <AppCombobox
                  items={entry.kind === 'income' ? INCOME_ITEMS : EXPENSE_ITEMS}
                  value={entry.categoryId}
                  onValueChange={(v) => patch(index, { categoryId: v })}
                  aria-label="Categoria da regra"
                  className="w-52"
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground block">Recorte</span>
                <AppCombobox items={ENTITY_ITEMS} value={entry.entity} onValueChange={(v) => patch(index, { entity: v as Entity })} aria-label="Recorte da regra" className="w-36" />
              </label>
              <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`Remover ${entry.label}`} onClick={() => onChange(entries.filter((_, i) => i !== index))}>
                <Trash />
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1">
                <span className="text-muted-foreground block">Quando</span>
                <AppCombobox items={RECURRENCE_ITEMS} value={entry.recurrence} onValueChange={(v) => patch(index, { recurrence: v as Recurrence })} aria-label="Recorrência" className="w-40" />
              </label>
              {entry.recurrence === 'installments' && (
                <label className="space-y-1">
                  <span className="text-muted-foreground block">Parcelas</span>
                  <Input type="number" min={1} className="w-20" disabled={disabled} value={entry.count ?? 1} onChange={(e) => patch(index, { count: Math.max(1, Number(e.target.value) || 1) })} />
                </label>
              )}
              <label className="space-y-1">
                <span className="text-muted-foreground block">A partir de</span>
                <MonthPicker value={entry.startMonth} onValueChange={(v) => patch(index, { startMonth: v })} aria-label={`Mês inicial de ${entry.label}`} />
              </label>
              <DueOnField label="Vence em" disabled={disabled} value={entry.dueOn} onChange={(dueOn) => patch(index, { dueOn })} />
              <label className="space-y-1">
                <span className="text-muted-foreground block">Credor (opcional)</span>
                <Input
                  value={entry.match?.merchants.join(', ') ?? ''}
                  disabled={disabled}
                  className="w-56 font-mono"
                  placeholder="NOME COMO APARECE NO BANCO"
                  // Vazio REMOVE o casamento: uma regra com lista de credores vazia não casaria
                  // nada e ficaria eternamente "em aberto" — pior que não ser conta nenhuma.
                  onChange={(e) => {
                    const merchants = e.target.value
                      .split(',')
                      .map((m) => m.trim().toUpperCase())
                      .filter(Boolean)
                    patch(index, { match: merchants.length ? { ...entry.match, merchants } : undefined })
                  }}
                />
              </label>
            </div>
          </div>
        ))}
        {entries.length === 0 && <p className="text-muted-foreground">Nada declarado. Os meses à frente mostram só as parcelas de cartão já compradas.</p>}
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onChange([
              ...entries,
              { id: `regra-${entries.length + 1}`, kind: 'expense', label: 'Nova regra', amount: 100, categoryId: 'outros', entity: 'PF', recurrence: 'monthly', startMonth: '2026-01' },
            ])
          }
        >
          <Plus /> Adicionar regra
        </Button>
      </CardContent>
    </Card>
  )
}
