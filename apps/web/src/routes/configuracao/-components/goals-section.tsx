import { RemoveButton } from '@/components/remove-button'
import { newId } from '@wlet/domain'
import { Plus } from '@phosphor-icons/react'
import { Button } from '@wlet/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wlet/ui/components/card'
import { Input } from '@wlet/ui/components/input'
import { MoneyInput } from '@wlet/ui/components/money-input'
import { MonthPicker } from '@wlet/ui/components/month-picker'
import type { Goal, GoalSlot } from '@wlet/domain'

const SLOTS: GoalSlot[] = [1, 2, 3, 4, 5, 6, 7, 8]

/**
 * As metas de poupança.
 *
 * `saved` é DIGITADO e não sai do saldo da conta investimento, de propósito: parte do aplicado
 * pode ser reserva, e o mesmo saldo não pode contar para três metas ao mesmo tempo.
 *
 * O `slot` é a cor da barra, e é declarado por meta em vez de sair da posição na lista — assim
 * reordenar não troca as cores todas.
 */
export function GoalsSection({ goals, onChange, disabled }: { goals: Goal[]; onChange: (next: Goal[]) => void; disabled: boolean }) {
  const patch = (index: number, change: Partial<Goal>) => onChange(goals.map((g, i) => (i === index ? { ...g, ...change } : g)))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Metas</CardTitle>
        <CardDescription>O guardado é digitado: o mesmo saldo não pode contar para três metas ao mesmo tempo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {goals.map((goal, index) => (
          <div key={goal.id} className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="text-muted-foreground block">Meta</span>
              <Input value={goal.label} disabled={disabled} className="w-48" onChange={(e) => patch(index, { label: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground block">Alvo</span>
              <div className="w-32">
                <MoneyInput value={goal.target} onValueChange={(v) => patch(index, { target: v ?? 0 })} disabled={disabled} />
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground block">Guardado</span>
              <div className="w-32">
                <MoneyInput value={goal.saved} onValueChange={(v) => patch(index, { saved: v ?? 0 })} disabled={disabled} />
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground block">Até</span>
              <MonthPicker value={goal.targetMonth} onValueChange={(v) => patch(index, { targetMonth: v })} aria-label={`Mês alvo de ${goal.label}`} />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground block">Cor</span>
              <Input
                type="number"
                min={1}
                max={8}
                className="w-16"
                disabled={disabled}
                value={goal.slot}
                onChange={(e) => patch(index, { slot: Math.min(8, Math.max(1, Number(e.target.value) || 1)) as GoalSlot })}
              />
            </label>
            <RemoveButton
              label={`Remover a meta ${goal.label}`}
              title="Remover esta meta?"
              description={`${goal.label} sai do planejamento, com o alvo e o quanto já foi guardado. O dinheiro em si não se move: a meta é declaração, não conta.`}
              disabled={disabled}
              onConfirm={() => onChange(goals.filter((_, i) => i !== index))}
            />
          </div>
        ))}
        {goals.length === 0 && <p className="text-muted-foreground">Nenhuma meta.</p>}
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onChange([
              ...goals,
              // Nasce com alvo e mês preenchidos porque a validação os exige maiores que zero:
              // um item que nasce inválido bloquearia a gravação de tudo o mais na tela.
              { id: newId('meta'), label: 'Nova meta', target: 1000, saved: 0, targetMonth: '2027-12', slot: SLOTS[goals.length % 8] },
            ])
          }
        >
          <Plus /> Adicionar meta
        </Button>
      </CardContent>
    </Card>
  )
}
