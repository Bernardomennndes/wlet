import { Pencil, Trash2 } from 'lucide-react'
import { CategoryBadge } from '@/components/category-badge'
import { NotInformed } from '@/components/not-informed'
import { DataList, DataListItem, DataListItemHeader } from '@/components/data-list/data-list'
import { EnumBadge } from '@/components/enum-badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { paymentModes, planStatuses, type Plan, type PlanGroup } from '@/data/types'
import { formatBRL, formatMonthShort } from '@/lib/format'
import { installmentAmount, planInstallments, planTotal, savingOf } from '@/lib/plans'

/**
 * A lista de planos, agrupada.
 *
 * É LISTA e não tabela pela §0 da `data-table`: o conjunto é pequeno por construção, os campos
 * são heterogêneos (valor, situação, parcelamento, mês) e ninguém vai ordenar por coluna — lê-se
 * um item por vez. Um grupo é uma viagem, e o total dele é a pergunta que se faz primeiro.
 */
export function PlanList({
  groups,
  items,
  onEdit,
  onRemove,
  onRemoveGroup,
}: {
  groups: PlanGroup[]
  items: Plan[]
  onEdit: (plan: Plan) => void
  onRemove: (id: string) => void
  onRemoveGroup: (id: string) => void
}) {
  // Cada grupo com os seus, e no fim os avulsos. `null` é o balde dos sem grupo — ele existe
  // como seção para um item solto não parecer perdido entre viagens.
  const buckets: { group: PlanGroup | null; plans: Plan[] }[] = [
    ...groups.map((group) => ({ group, plans: items.filter((p) => p.groupId === group.id) })),
    { group: null, plans: items.filter((p) => !p.groupId) },
  ].filter((b) => b.plans.length > 0 || b.group !== null)

  return (
    <div className="flex flex-col gap-4">
      {buckets.map((bucket) => {
        const total = bucket.plans.reduce((s, p) => s + planTotal(p), 0)
        return (
          <section key={bucket.group?.id ?? 'avulsos'} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-medium text-muted-foreground">
                {bucket.group?.label ?? 'Avulsos'}
                {bucket.group?.from && <span className="ml-2 font-normal">{formatMonthShort(bucket.group.from)}</span>}
              </h2>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs tabular-nums">{formatBRL(total)}</span>
                {bucket.group && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button size="icon-sm" variant="outline" aria-label={`Remover o grupo ${bucket.group.label}`} onClick={() => bucket.group && onRemoveGroup(bucket.group.id)}>
                          <Trash2 />
                        </Button>
                      }
                    />
                    <TooltipContent>Remover o grupo (os itens ficam avulsos)</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>

            {bucket.plans.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Nenhum item neste grupo.</p>
            ) : (
              <DataList aria-label={`Planos de ${bucket.group?.label ?? 'avulsos'}`}>
                {bucket.plans.map((plan) => (
                  <DataListItem key={plan.id} className="gap-1.5">
                    <DataListItemHeader>
                      <span className="truncate font-medium">{plan.label}</span>
                      <span className="font-mono tabular-nums">{formatBRL(planTotal(plan))}</span>
                    </DataListItemHeader>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <EnumBadge option={planStatuses.find((s) => s.value === plan.status)} value={plan.status} />
                      {/* Forma de pagamento ainda não decidida não vira badge: `enum-badges.md`
                          diz que enum sem valor não renderiza a badge, e um "Não definido"
                          ali competiria com a situação, que é o estado que importa na lista. */}
                      {plan.payment && <EnumBadge option={paymentModes.find((m) => m.value === plan.payment)} value={plan.payment} />}
                      <CategoryBadge value={plan.categoryId} />
                      {/* O mês, ao contrário, PRECISA aparecer quando falta: é ele que decide
                          se o plano está na previsão, e um espaço em branco não diria isso. */}
                      {plan.month ? <span>{formatMonthShort(plan.month)}</span> : <NotInformed>Não definido</NotInformed>}
                      {planInstallments(plan) > 1 && (
                        <span className="tabular-nums">
                          {planInstallments(plan)}× de {formatBRL(installmentAmount(plan))}
                        </span>
                      )}
                      {/* A economia só aparece quando existem os DOIS preços: sem preço
                          parcelado não há comparação, e um "R$ 0,00 de economia" afirmaria que
                          os preços são iguais, que é outra coisa. */}
                      {savingOf(plan) !== null && savingOf(plan)! > 0 && (
                        <span className="tabular-nums text-[var(--status-good-text)]">
                          {plan.payment === 'cash' ? 'economiza' : 'economizaria'} {formatBRL(savingOf(plan)!)}
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button size="icon-sm" variant="outline" aria-label={`Editar ${plan.label}`} onClick={() => onEdit(plan)}>
                                <Pencil />
                              </Button>
                            }
                          />
                          <TooltipContent>Editar</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button size="icon-sm" variant="outline" aria-label={`Remover ${plan.label}`} onClick={() => onRemove(plan.id)}>
                                <Trash2 />
                              </Button>
                            }
                          />
                          <TooltipContent>Remover</TooltipContent>
                        </Tooltip>
                      </span>
                    </div>
                  </DataListItem>
                ))}
              </DataList>
            )}
          </section>
        )
      })}
    </div>
  )
}
