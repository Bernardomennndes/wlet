import { Pencil, Trash } from '@phosphor-icons/react'
import { CategoryBadge } from '@/components/category-badge'
import { Checkbox } from '@/components/ui/checkbox'
import { PlanRowControls } from './plan-row-controls'
import { DataList, DataListItem, DataListItemHeader } from '@/components/data-list/data-list'
import { EnumBadge } from '@/components/enum-badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { planStatuses, type Plan, type PlanGroup } from '@/data/types'
import { formatBRL, formatMonthShort } from '@/lib/format'
import { planTotal, savingOf } from '@/lib/plans'

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
  onUpdate,
  monthsWithData,
  defaultMonth,
}: {
  groups: PlanGroup[]
  items: Plan[]
  onEdit: (plan: Plan) => void
  onRemove: (id: string) => void
  onRemoveGroup: (id: string) => void
  onUpdate: (id: string, patch: Partial<Omit<Plan, 'id'>>) => void
  monthsWithData: string[]
  defaultMonth: string
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
                          <Trash />
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
                      <span className="flex min-w-0 items-center gap-2">
                        {/* A caixinha CONFIRMA o plano: marcada, ele é "Decidido" e entra na
                            previsão de verdade; desmarcada, volta a "Em estudo" e o gráfico o
                            desenha como hipótese. É o mesmo par de situações que a gaveta
                            oferece — aqui ele vira um clique, porque é o que mais se mexe. */}
                        <Checkbox
                          aria-label={`Aplicar ${plan.label} na previsão`}
                          checked={plan.status === 'decided'}
                          onCheckedChange={(checked) => onUpdate(plan.id, { status: checked ? 'decided' : 'considering' })}
                        />
                        <span className="truncate font-medium">{plan.label}</span>
                      </span>
                      <span className="font-mono tabular-nums">{formatBRL(planTotal(plan))}</span>
                    </DataListItemHeader>

                    <PlanRowControls plan={plan} monthsWithData={monthsWithData} defaultMonth={defaultMonth} onUpdate={(patch) => onUpdate(plan.id, patch)} />

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <EnumBadge option={planStatuses.find((s) => s.value === plan.status)} value={plan.status} />
                      <CategoryBadge value={plan.categoryId} />
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
                          <TooltipContent>Editar nome, preços, categoria e grupo</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button size="icon-sm" variant="outline" aria-label={`Remover ${plan.label}`} onClick={() => onRemove(plan.id)}>
                                <Trash />
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
