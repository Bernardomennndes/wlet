import { CategoryBadge } from '@/components/category-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Plan, PlanGroup } from '@wlet/domain'
import { formatBRL, formatMonthShort, plural } from '@/lib/format'
import { installmentAmount, planMonths, planTotal, scheduledPlans } from '@/lib/plans'
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
export function SimulationCard({
  groups,
  considering: all,
  simulated,
  onToggle,
}: {
  groups: PlanGroup[]
  considering: Plan[]
  simulated: Set<string>
  onToggle: (ids: string[], on: boolean) => void
}) {
  if (all.length === 0) return null

  // Só o que tem mês pode ser simulado: ligar um plano sem data acenderia o botão e não
  // moveria número nenhum, porque não há mês em que ele pese. Eles não somem da vista — a
  // contagem abaixo os declara, senão a lista pareceria ter perdido itens.
  const considering = scheduledPlans(all)
  const undated = all.length - considering.length

  // Um bloco por grupo, e os avulsos no fim. Grupo sem item em estudo não aparece: o card é
  // sobre o que dá para ligar, e um grupo já todo decidido não tem o que oferecer aqui.
  const blocks: { group: PlanGroup | null; plans: Plan[] }[] = [
    ...groups.map((group) => ({ group, plans: considering.filter((p) => p.groupId === group.id) })),
    { group: null, plans: considering.filter((p) => !p.groupId) },
  ].filter((block) => block.plans.length > 0)

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
          {considering.length} {plural(considering.length, 'plano', 'planos')} em estudo com data. Ligue os que quiser testar — a escolha fica na URL.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {blocks.map((block) => {
          const ids = block.plans.map((p) => p.id)
          const on = ids.filter((id) => simulated.has(id)).length
          const allOn = on === ids.length
          return (
            <div key={block.group?.id ?? 'avulsos'} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {block.group ? (
                  // O botão do grupo liga TODOS de uma vez, e desliga só quando já estão
                  // todos ligados — parcialmente ligado, o clique completa em vez de zerar,
                  // que é o que a pessoa quer dizer ao clicar num grupo meio marcado.
                  <Button size="sm" variant={allOn ? 'default' : 'outline'} aria-pressed={allOn} onClick={() => onToggle(ids, !allOn)} className={cn(!allOn && 'border-dashed')}>
                    {block.group.label}
                    <span className="ml-1.5 tabular-nums opacity-70">
                      {on}/{ids.length}
                    </span>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Avulsos</span>
                )}
                <span className="text-xs text-muted-foreground tabular-nums">{formatBRL(block.plans.reduce((s, p) => s + planTotal(p), 0))}</span>
              </div>

              <ul className="flex flex-wrap gap-2 pl-1" aria-label={`Planos em estudo de ${block.group?.label ?? 'avulsos'}`}>
                {block.plans.map((plan) => {
                  const isOn = simulated.has(plan.id)
                  return (
                    <li key={plan.id}>
                      <Button
                        size="sm"
                        variant={isOn ? 'default' : 'outline'}
                        aria-pressed={isOn}
                        onClick={() => onToggle([plan.id], !isOn)}
                        className={cn(!isOn && 'border-dashed')}
                        title={`${plan.label} — ${formatBRL(planTotal(plan))}${plan.payment === 'financed' && plan.financed ? ` em ${plan.financed.installments}×` : ' à vista'}`}
                      >
                        {plan.label}
                        <span className="ml-1.5 tabular-nums opacity-70">{formatBRL(planTotal(plan))}</span>
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}

        {undated > 0 && (
          <p className="text-xs text-muted-foreground">
            {undated} {plural(undated, 'plano', 'planos')} em estudo {plural(undated, 'está', 'estão')} sem mês e {plural(undated, 'fica', 'ficam')} de fora: marque uma data no plano para poder
            simular.
          </p>
        )}

        {active.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nada ligado: os meses abaixo mostram a previsão sem simulação.</p>
        ) : (
          <div className="rounded-lg border">
            <p className="border-b px-3 py-2 text-xs text-muted-foreground">
              O que a simulação acrescenta, mês a mês — {formatBRL(active.reduce((s, p) => s + planTotal(p), 0))} em {active.length} {plural(active.length, 'plano', 'planos')}
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
