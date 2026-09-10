import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wlet/ui/components/card'
import { Input } from '@wlet/ui/components/input'
import { MoneyInput } from '@wlet/ui/components/money-input'
import { Link } from 'react-router'
import type { Budget } from '@wlet/domain'

/**
 * O teto do mês e o limiar do aviso — e SÓ eles.
 *
 * As rubricas por categoria saíram daqui para a tela de Rubricas. Elas tinham a edição neste
 * cartão e o acompanhamento em Pagamentos, e nenhum dos dois lugares respondia sozinho a
 * pergunta que se faz sobre uma rubrica: "estourei, e o que faço com esse número?". Manter uma
 * segunda edição aqui só criaria dois formulários para o mesmo dado.
 */
export function BudgetSection({ budget, onChange, disabled }: { budget: Budget; onChange: (next: Budget) => void; disabled: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Teto de gastos</CardTitle>
        <CardDescription>
          O limite do mês e quando avisar. As rubricas por categoria moram em{' '}
          <Link className="underline" to="/rubricas">
            Rubricas
          </Link>
          , ao lado do gasto que elas medem.
        </CardDescription>
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
      </CardContent>
    </Card>
  )
}
