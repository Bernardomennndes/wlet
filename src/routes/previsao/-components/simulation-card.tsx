import { CategoryBadge } from '@/components/category-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Plan } from '@/data/types'
import { formatBRL, formatMonthShort, plural } from '@/lib/format'
import { installmentAmount, planMonths } from '@/lib/plans'
import { cn } from '@/lib/utils'

/**
 * A simulação: quais planos EM ESTUDO entram na previsão desta tela.
 *
 * Os decididos não aparecem aqui porque não são hipótese — eles já estão na previsão, e
 * oferecê-los como opção sugeriria que dá para desligá-los, o que tornaria o número desta
 * tela diferente do da Visão geral. A fronteira é essa: em estudo se liga, decidido não.
 *
 * O impacto é mostrado por MÊS e não como total, porque a pergunta não é "quanto custa" — o
 * valor já está na lista — e sim "em que mês isso pesa". Uma compra em 10× de R$ 5.000 e uma
 * à vista de R$ 500 têm o mesmo peso no primeiro mês.
 */
export function SimulationCard({ considering, simulated, onToggle }: { considering: Plan[]; simulated: Set<string>; onToggle: (id: string) => void }) {
  if (considering.length === 0) return null

  const active = considering.filter((p) => simulated.has(p.id))
  const byMonth = new Map<string, number>()
  for (const plan of active) {
    for (const month of planMonths(plan)) byMonth.set(month, (byMonth.get(month) ?? 0) + installmentAmount(plan))
  }
  const months = [...byMonth].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Simular</CardTitle>
        <CardDescription>
          {considering.length} {plural(considering.length, 'plano', 'planos')} em estudo. Ligue os que quiser testar — eles entram nos meses abaixo e a previsão se recompõe. A escolha fica na URL,
          então dá para compartilhar o cenário.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-wrap gap-2" aria-label="Planos em estudo">
          {considering.map((plan) => {
            const on = simulated.has(plan.id)
            return (
              <li key={plan.id}>
                <Button
                  size="sm"
                  variant={on ? 'default' : 'outline'}
                  aria-pressed={on}
                  onClick={() => onToggle(plan.id)}
                  className={cn(!on && 'border-dashed')}
                  title={`${plan.label} — ${formatBRL(plan.amount)}${plan.installments ? ` em ${plan.installments}×` : ' à vista'}`}
                >
                  {plan.label}
                  <span className="ml-1.5 tabular-nums opacity-70">{formatBRL(plan.amount)}</span>
                </Button>
              </li>
            )
          })}
        </ul>

        {active.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nada ligado: os meses abaixo mostram a previsão sem simulação.</p>
        ) : (
          <div className="rounded-lg border">
            <p className="border-b px-3 py-2 text-xs text-muted-foreground">
              O que a simulação acrescenta, mês a mês — {formatBRL(active.reduce((s, p) => s + p.amount, 0))} em {active.length} {plural(active.length, 'plano', 'planos')}
            </p>
            <ul className="divide-y">
              {months.map(([month, value]) => (
                <li key={month} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                  <span className="text-muted-foreground">{formatMonthShort(month)}</span>
                  <span className="flex items-center gap-2">
                    {active
                      .filter((p) => planMonths(p).includes(month))
                      .map((p) => (
                        <CategoryBadge key={p.id} value={p.categoryId} />
                      ))}
                    <span className="font-mono tabular-nums">+{formatBRL(value)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
