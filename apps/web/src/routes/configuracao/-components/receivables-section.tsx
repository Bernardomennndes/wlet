import { Plus, Trash } from '@phosphor-icons/react'
import { AppCombobox } from '@/components/ui/app-combobox'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { MonthPicker } from '@/components/ui/month-picker'
import { CATEGORIES } from '@/data/categories'
import { plannedRecurrences, type Receivable, type Recurrence } from '@/data/types'
import { DueOnField } from '@/components/due-on-field'

const EXPENSE_ITEMS = CATEGORIES.filter((c) => c.kind === 'expense').map((c) => ({ value: c.id, label: c.label, description: c.description }))
const RECURRENCE_ITEMS = plannedRecurrences.map((r) => ({ value: r.value, label: r.label }))

/**
 * O que alguém te deve, e a despesa que o recebimento abate.
 *
 * **O recebimento NÃO é receita.** Pagar o aluguel inteiro e receber metade de volta não
 * aumenta o que entrou: abate a moradia daquele mês, e é por isso que a categoria abatida é
 * obrigatória e tem de ser de DESPESA.
 *
 * **Quem paga é uma LISTA**, porque quem deve e quem paga nem sempre coincidem — mãe quitando
 * pelo filho, sócio pela empresa. Os dois nomes entram na MESMA cobrança; duas cobranças
 * partiriam o histórico de uma dívida só, e o mês pago pelo outro viraria atraso.
 *
 * O casamento é por contraparte e conta, NUNCA por valor: um rateio varia mês a mês, e exigir
 * valor deixaria a cobrança eternamente em aberto.
 */
export function ReceivablesSection({ receivables, onChange, disabled }: { receivables: Receivable[]; onChange: (next: Receivable[]) => void; disabled: boolean }) {
  const patch = (index: number, change: Partial<Receivable>) => onChange(receivables.map((r, i) => (i === index ? { ...r, ...change } : r)))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Cobranças</CardTitle>
        <CardDescription>O recebimento não é receita: ele abate a despesa que você adiantou. Casa por contraparte e conta, nunca por valor.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        {receivables.map((receivable, index) => (
          <div key={receivable.id} className="space-y-2 border-l-2 pl-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1">
                <span className="text-muted-foreground block">Quem deve</span>
                <Input value={receivable.debtor} disabled={disabled} className="w-44" onChange={(e) => patch(index, { debtor: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground block">Do quê</span>
                <Input value={receivable.label} disabled={disabled} className="w-48" onChange={(e) => patch(index, { label: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground block">Valor de referência</span>
                <div className="w-32">
                  <MoneyInput value={receivable.amount} onValueChange={(v) => patch(index, { amount: v ?? 0 })} disabled={disabled} />
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground block">Abate</span>
                <AppCombobox items={EXPENSE_ITEMS} value={receivable.offsetsCategoryId} onValueChange={(v) => patch(index, { offsetsCategoryId: v })} aria-label="Categoria abatida" className="w-52" />
              </label>
              <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`Remover a cobrança de ${receivable.debtor}`} onClick={() => onChange(receivables.filter((_, i) => i !== index))}>
                <Trash />
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1">
                <span className="text-muted-foreground block">Quando</span>
                <AppCombobox items={RECURRENCE_ITEMS} value={receivable.recurrence} onValueChange={(v) => patch(index, { recurrence: v as Recurrence })} aria-label="Recorrência" className="w-40" />
              </label>
              {receivable.recurrence === 'installments' && (
                <label className="space-y-1">
                  <span className="text-muted-foreground block">Parcelas</span>
                  <Input type="number" min={1} className="w-20" disabled={disabled} value={receivable.count ?? 1} onChange={(e) => patch(index, { count: Math.max(1, Number(e.target.value) || 1) })} />
                </label>
              )}
              <label className="space-y-1">
                <span className="text-muted-foreground block">A partir de</span>
                <MonthPicker value={receivable.startMonth} onValueChange={(v) => patch(index, { startMonth: v })} aria-label={`Mês inicial da cobrança de ${receivable.debtor}`} />
              </label>
              <DueOnField label="Vence em" disabled={disabled} value={receivable.dueOn} onChange={(dueOn) => patch(index, { dueOn })} />
              <label className="space-y-1">
                <span className="text-muted-foreground block">Quem paga</span>
                <Input
                  value={receivable.match.merchants.join(', ')}
                  disabled={disabled}
                  className="w-64 font-mono"
                  placeholder="NOME1, NOME2"
                  // MAIÚSCULAS e sem acento é como o ingest normaliza antes de comparar —
                  // guardar em minúsculas faria a cobrança nunca casar, em silêncio.
                  onChange={(e) =>
                    patch(index, {
                      match: {
                        ...receivable.match,
                        merchants: e.target.value
                          .split(',')
                          .map((m) => m.trim().toUpperCase())
                          .filter(Boolean),
                      },
                    })
                  }
                />
              </label>
            </div>
          </div>
        ))}
        {receivables.length === 0 && <p className="text-muted-foreground">Ninguém te deve nada declarado.</p>}
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onChange([
              ...receivables,
              {
                id: `cobranca-${receivables.length + 1}`,
                debtor: 'Alguém',
                label: 'Nova cobrança',
                amount: 100,
                dueOn: { kind: 'day', day: 10 },
                recurrence: 'monthly',
                startMonth: '2026-01',
                match: { merchants: [] },
                offsetsCategoryId: 'moradia',
              },
            ])
          }
        >
          <Plus /> Adicionar cobrança
        </Button>
      </CardContent>
    </Card>
  )
}
