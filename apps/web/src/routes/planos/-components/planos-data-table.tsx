import { LinkBreak, LinkSimple, Pencil, Trash } from '@phosphor-icons/react'
import { type Plan, type PlanGroup, type PlanStatus, planStatuses } from '@wlet/domain'
import { planTotal } from '@wlet/domain/plans'
import { type InstallmentPurchase, planPurchase, planValue, planValueOf } from '@wlet/domain/purchases'
import { formatBRL, formatMonthShort } from '@wlet/lib/format'
import { cn } from '@wlet/lib/utils'
import { Button } from '@wlet/ui/components/button'
import { Checkbox } from '@wlet/ui/components/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@wlet/ui/components/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@wlet/ui/components/tooltip'
import { useState } from 'react'
import { CategoryBadge } from '@/components/category-badge'
import { EnumBadge } from '@/components/enum-badge'
import { GroupNameForm } from './group-name-form'
import { InstallmentsCell, MonthCell, PaymentCell } from './plan-row-controls'
import { PurchaseMeter } from './purchase-meter'

/**
 * A tabela de planos, em BLOCOS por grupo.
 *
 * O arquivo chamava-se `plan-list.tsx` e exportava `PlanList`, e o nome era o problema: aqui
 * `-list` é o que a `data-list.md` define — `ul/li` + `dt/dd`, um item por vez —, e isto é uma
 * grade de colunas. A §0 da `data-table` diz por que ela é grade: desde que cada plano ganhou
 * forma, parcelas e mês, as perguntas passaram a ser de COLUNA — qual custa mais, qual cai antes.
 *
 * **Cada grupo é um bloco com a própria tabela, e as colunas continuam alinhadas entre blocos.**
 * Ela era UMA tabela com um `<tbody>` por grupo, e a linha do grupo lia como só mais uma linha:
 * tudo empilhado, sem dizer onde uma viagem acabava e a outra começava. Separados em blocos, o
 * agrupamento é desenhado pela moldura. O que impede a separação de custar a comparação é o
 * `table-fixed` com o MESMO `<colgroup>` em todas as tabelas: larguras iguais, colunas no mesmo
 * x, e o valor de um grupo segue alinhado com o do grupo de baixo.
 *
 * **Sem divisória vertical.** Numa tabela contínua ela dava o trilho da comparação; com as
 * colunas alinhadas e os blocos emoldurados, seria uma terceira camada de linhas sobre as duas
 * que já organizam a leitura.
 */

/** A grade tem sete colunas, e a linha do grupo atravessa as três de edição. */
const COLUMNS = 7

/**
 * As larguras, uma vez só, lidas por TODAS as tabelas.
 *
 * É esta constante que alinha as colunas entre blocos: com `table-fixed`, quem manda na largura é
 * o `<colgroup>`, e a coluna do nome (sem largura) fica com o que sobra — igual em todos, porque
 * todos têm a mesma largura total. A coluna de ações tem três botões — vincular, editar e remover.
 */
const COL_WIDTHS = ['w-8', undefined, 'w-28', 'w-32', 'w-36', 'w-32', 'w-24'] as const

/** O recuo das pontas é das CÉLULAS, e casa com o `px-3` que o bloco não tem por fora. */
const EDGE = '[&_td:first-child]:pl-3 [&_td:last-child]:pr-3 [&_th:first-child]:pl-3 [&_th:last-child]:pr-3'

const LABELS = ['Entra na previsão', 'Plano', 'Valor', 'Forma', 'Parcelas', 'Mês', 'Ações'] as const

function Columns() {
  return (
    <colgroup>
      {COL_WIDTHS.map((width, index) => (
        // A ordem é a identidade da coluna, e a lista é constante: o índice é a chave certa aqui.
        <col key={index} className={width} />
      ))}
    </colgroup>
  )
}

interface Handlers {
  onEdit: (plan: Plan) => void
  onRemove: (id: string) => void
  onRemoveGroup: (id: string) => void
  onUpdate: (id: string, patch: Partial<Omit<Plan, 'id'>>) => void
  /** O checkbox do grupo: decide ou devolve a estudo todos os planos dele, numa escrita só. */
  onGroupStatus: (group: PlanGroup, status: Exclude<PlanStatus, 'discarded'>) => void
  /** O nome editado na linha do grupo. Só chega aqui quando mudou e não está vazio. */
  onRenameGroup: (group: PlanGroup, label: string) => void
  /**
   * Qual plano a pessoa está apontando. A tela usa isso para ACENDER a contribuição dele nas
   * colunas do gráfico acima — é o que liga a decisão ao efeito sem exigir um clique.
   */
  onHighlight: (plan: Plan | null) => void
  /** Abre a escolha da compra parcelada que este plano virou. */
  onLinkPurchase: (plan: Plan) => void
  /** Pede confirmação para desfazer o vínculo com a compra. */
  onUnlinkPurchase: (plan: Plan) => void
}

interface Shared extends Handlers {
  monthsWithData: string[]
  defaultMonth: string
  /** As compras parceladas do conjunto inteiro, para resolver o vínculo de cada plano. */
  purchases: InstallmentPurchase[]
  /**
   * Trava os controles enquanto uma escrita está em voo — e é defeito medido, não zelo.
   *
   * Toda escrita de plano é lê-aplica-grava do catálogo inteiro (`plans.service.ts`, `mutate`).
   * Dois controles acionados antes de a primeira gravação voltar leem o MESMO retrato, e o segundo
   * `save` apaga o primeiro: reproduzido com duas chamadas concorrentes, dois planos entram e um
   * some. A tela de Rubricas já se protege assim.
   */
  disabled: boolean
}

export function PlanosDataTable({ groups, items, disabled = false, ...shared }: Omit<Shared, 'disabled'> & { groups: PlanGroup[]; items: Plan[]; disabled?: boolean }) {
  // Cada grupo com os seus, e no fim os sem grupo. Grupo vazio fica (ele existe e pode receber
  // planos); o bloco "Sem grupo" só aparece quando tem o que mostrar.
  const buckets: { group: PlanGroup | null; plans: Plan[] }[] = [
    ...groups.map((group) => ({ group, plans: items.filter((p) => p.groupId === group.id) })),
    { group: null, plans: items.filter((p) => !p.groupId) },
  ].filter((b) => b.plans.length > 0 || b.group !== null)

  return (
    // UM contêiner de rolagem para todos os blocos: com um por tabela, cada grupo rolaria sozinho
    // no celular e as colunas deixariam de se alinhar justamente onde a tela é estreita.
    <div className="overflow-x-auto">
      <div className="flex min-w-[760px] flex-col gap-3">
        {/* Os rótulos das colunas, UMA vez, acima de todos os blocos. É só desenho: cada tabela
            abaixo carrega o próprio cabeçalho para leitor de tela. A borda transparente reproduz
            o 1px da moldura dos blocos, senão a faixa ficaria um pixel fora de alinhamento. */}
        <div aria-hidden className="border-x border-transparent">
          <Table className={cn('table-fixed', EDGE)}>
            <Columns />
            <TableHeader className="[&_tr]:border-0">
              <TableRow className="hover:bg-transparent">
                {LABELS.map((label, index) => (
                  <TableHead key={label} className={cn('h-6 font-normal text-muted-foreground', index === 2 && 'text-right')}>
                    {index === 0 || index === 6 ? null : label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
          </Table>
        </div>

        {buckets.map((bucket) => (
          <GroupBlock key={bucket.group?.id ?? 'sem-grupo'} group={bucket.group} plans={bucket.plans} disabled={disabled} {...shared} />
        ))}

        {/* O vazio GLOBAL fica abaixo da faixa de rótulos, que continua montada: ela é a única
            explicação do que a listagem guarda quando não há linha de onde inferir
            (`data-table.md` §7.1). */}
        {buckets.length === 0 ? <p className="rounded-lg border px-3 py-6 text-center text-muted-foreground">Nenhum plano na lista.</p> : null}
      </div>
    </div>
  )
}

function GroupBlock({ group, plans, disabled, monthsWithData, defaultMonth, purchases, ...handlers }: Shared & { group: PlanGroup | null; plans: Plan[] }) {
  const { onEdit, onRemove, onRemoveGroup, onUpdate, onGroupStatus, onRenameGroup, onHighlight, onLinkPurchase, onUnlinkPurchase } = handlers
  // O nome está sendo editado? O estado mora no BLOCO, e não no campo, porque o gatilho (o lápis,
  // na coluna de ações) e o que ele abre (o campo, na coluna do nome) são células diferentes.
  const [renaming, setRenaming] = useState(false)
  const label = group?.label ?? 'Sem grupo'
  const total = plans.reduce((sum, plan) => sum + planValue(plan, purchases), 0)
  // O que o checkbox do grupo alterna: descartado fica de fora, e ligado também — a compra já foi feita,
  // e "voltar a estudo" não desfaz compra nenhuma. Parcial é o traço.
  const toggleable = plans.filter((plan) => plan.status !== 'discarded' && !plan.purchaseId)
  const decidedCount = toggleable.filter((plan) => plan.status === 'decided').length

  return (
    <section aria-label={label} className="overflow-hidden rounded-lg border">
      <Table className={cn('table-fixed', EDGE)}>
        <Columns />
        {/* Cabeçalho de ALTURA ZERO: os rótulos visíveis estão na faixa do topo, e este existe para
            quem ouve a tela saber o que cada célula é, bloco a bloco. */}
        <TableHeader className="[&_tr]:border-0">
          <TableRow className="hover:bg-transparent">
            {LABELS.map((column) => (
              <TableHead key={column} className="h-0 p-0">
                <span className="sr-only">{column}</span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {/* O cabeçalho do BLOCO é a primeira linha da tabela, e é isso que põe o checkbox e o nome
              nas colunas dos planos e o total na coluna "Valor" — a mesma grandeza dos valores
              logo abaixo, no mesmo x. */}
          <TableRow className="group/bucket bg-muted/40 hover:bg-muted/40">
            <TableCell className="py-2">
              {/* Só nos grupos reais: "Sem grupo" não é uma coisa que se decide junta. */}
              {group ? (
                <Checkbox
                  disabled={disabled || toggleable.length === 0}
                  aria-label={`Aplicar todos os planos de ${group.label} na previsão`}
                  checked={toggleable.length > 0 && decidedCount === toggleable.length}
                  indeterminate={decidedCount > 0 && decidedCount < toggleable.length}
                  onCheckedChange={(checked) => onGroupStatus(group, checked ? 'decided' : 'considering')}
                />
              ) : null}
            </TableCell>
            <TableCell className="py-2 font-medium">
              <span className="flex min-w-0 items-center">
                {group && renaming ? (
                  <GroupNameForm
                    group={group}
                    onDone={(next) => {
                      setRenaming(false)
                      // Sair sem mudar nada não é gravação: abrir e fechar o campo levantaria
                      // `saving` na tela inteira sem número novo nenhum.
                      if (next !== undefined && next !== group.label) onRenameGroup(group, next)
                    }}
                  />
                ) : (
                  <span className={cn('truncate', !group && 'text-muted-foreground')}>{label}</span>
                )}
                {group?.from ? <span className="ml-2 font-normal text-muted-foreground">{formatMonthShort(group.from)}</span> : null}
              </span>
            </TableCell>
            <TableCell className="py-2 text-right font-mono font-medium tabular-nums">{formatBRL(total)}</TableCell>
            {/* O resumo ocupa o vão das três colunas de edição, que na linha do grupo não têm o que
                dizer — em vez de disputar espaço com o nome. */}
            <TableCell colSpan={3} className="py-2 text-muted-foreground"></TableCell>
            <TableCell className="py-2">
              {/* Renomear e remover lado a lado, no mesmo lugar e com o mesmo par de ícones das
                  linhas de plano logo abaixo: a ação sobre a linha mora na coluna de ações, e o
                  nome fica só com o nome. Os dois aparecem ao apontar a linha e continuam
                  focáveis pelo teclado. */}
              {group ? (
                <span className="flex justify-end gap-0.5 opacity-0 group-hover/bucket:opacity-100 group-focus-within/bucket:opacity-100">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        // Desabilitado enquanto o campo está aberto: o clique tiraria o foco do campo
                        // (gravando e fechando) e logo em seguida o abriria de novo.
                        <Button size="icon-sm" variant="ghost" disabled={disabled || renaming} aria-label={`Renomear o grupo ${group.label}`} onClick={() => setRenaming(true)}>
                          <Pencil />
                        </Button>
                      }
                    />
                    <TooltipContent>Renomear o grupo</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`Remover o grupo ${group.label}`} onClick={() => onRemoveGroup(group.id)}>
                          <Trash />
                        </Button>
                      }
                    />
                    <TooltipContent>Remover o grupo (os planos ficam sem grupo)</TooltipContent>
                  </Tooltip>
                </span>
              ) : null}
            </TableCell>
          </TableRow>

          {plans.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={COLUMNS} className="text-muted-foreground">
                Nenhum plano neste grupo.
              </TableCell>
            </TableRow>
          ) : (
            plans.map((plan) => {
              const discarded = plan.status === 'discarded'
              const link = planPurchase(plan, purchases)
              const purchase = link.status === 'linked' ? link.purchase : undefined
              const value = planValueOf(plan, link)
              return (
                <TableRow
                  key={plan.id}
                  className="group/row"
                  // O realce é de APONTAR, não de clicar: passar o cursor (ou chegar pelo teclado a
                  // um controle da linha) acende no gráfico o que este plano põe em cada mês.
                  onPointerEnter={() => onHighlight(plan)}
                  onPointerLeave={() => onHighlight(null)}
                  onFocus={() => onHighlight(plan)}
                  onBlur={() => onHighlight(null)}
                >
                  {/* A caixinha e o nome alinham pelo TOPO, e a primeira linha dos dois tem a altura dos
                      controles da linha (h-7): numa linha comum tudo fica na mesma altura, e numa linha
                      com o medidor de parcelas embaixo a caixinha continua ao lado do nome, em vez de
                      descer para o meio do bloco. */}
                  <TableCell className="align-top">
                    {/* A caixinha É a situação: marcada é "Decidido" e entra na previsão;
                        desmarcada volta a "Em estudo". */}
                    {/* Com o pagamento iniciado (vinculado a uma compra), o plano está decidido por fato: a
                        caixinha fica marcada e SÓ LEITURA — não desabilitada. Ela não está indisponível, ela
                        afirma um fato; `readOnly` recusa a troca sem o esmaecido de controle desligado. O
                        guarda no handler é a segunda trava, e o rótulo diz a um leitor de tela POR QUE ela
                        não muda. `disabled` fica só para a escrita em voo. */}
                    <span className="flex h-7 items-center">
                      <Checkbox
                        disabled={disabled}
                        readOnly={link.status !== 'none'}
                        aria-label={link.status !== 'none' ? `${plan.label}: pagamento iniciado, o plano segue decidido enquanto estiver vinculado` : `Aplicar ${plan.label} na previsão`}
                        checked={plan.status === 'decided'}
                        onCheckedChange={(checked) => {
                          if (link.status !== 'none') return
                          onUpdate(plan.id, { status: checked ? 'decided' : 'considering' })
                        }}
                      />
                    </span>
                  </TableCell>

                  <TableCell className="align-top">
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex h-7 min-w-0 items-center gap-2">
                        <span className={cn('truncate font-medium', discarded && 'text-muted-foreground line-through')}>{plan.label}</span>
                        <CategoryBadge value={plan.categoryId} className="shrink-0" />
                        {/* O badge de situação sobrou para UM caso: "Descartado", que a caixinha não
                            sabe dizer — desmarcada, ela significa "em estudo". */}
                        {discarded ? <EnumBadge option={planStatuses.find((s) => s.value === 'discarded')} value="discarded" className="shrink-0" /> : null}
                      </span>
                      {purchase ? <PurchaseMeter purchase={purchase} /> : null}
                      {link.status === 'broken' ? <span className="text-muted-foreground">Compra não encontrada</span> : null}
                    </span>
                  </TableCell>

                  <TableCell className="text-right font-mono tabular-nums">
                    {/* Ligado, o valor é o da compra; o planejado fica embaixo, riscado, só quando diverge
                        mais de um real — senão seria ruído de centavo. */}
                    <span className="flex flex-col items-end">
                      <span>{formatBRL(value)}</span>
                      {purchase && Math.abs(value - planTotal(plan)) > 1 ? <span className="text-muted-foreground line-through">{formatBRL(planTotal(plan))}</span> : null}
                    </span>
                  </TableCell>

                  <TableCell>
                    <PaymentCell plan={plan} purchase={purchase} disabled={disabled} onUpdate={(patch) => onUpdate(plan.id, patch)} />
                  </TableCell>

                  <TableCell>
                    <span className="flex items-center gap-1">
                      <InstallmentsCell plan={plan} purchase={purchase} disabled={disabled} onUpdate={(patch) => onUpdate(plan.id, patch)} />
                    </span>
                  </TableCell>

                  <TableCell>
                    <MonthCell plan={plan} purchase={purchase} monthsWithData={monthsWithData} defaultMonth={defaultMonth} disabled={disabled} onUpdate={(patch) => onUpdate(plan.id, patch)} />
                  </TableCell>

                  <TableCell>
                    {/* As ações ficam invisíveis até a linha ser apontada e continuam FOCÁVEIS: o
                        `focus-within` as traz de volta para quem chega pelo teclado. */}
                    <span className="flex justify-end gap-0.5 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            link.status === 'none' ? (
                              <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`Vincular ${plan.label} a uma compra`} onClick={() => onLinkPurchase(plan)}>
                                <LinkSimple />
                              </Button>
                            ) : (
                              <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`Desvincular ${plan.label} da compra`} onClick={() => onUnlinkPurchase(plan)}>
                                <LinkBreak />
                              </Button>
                            )
                          }
                        />
                        <TooltipContent>{link.status === 'none' ? 'Vincular a uma compra parcelada' : 'Desvincular da compra'}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`Editar ${plan.label}`} onClick={() => onEdit(plan)}>
                              <Pencil />
                            </Button>
                          }
                        />
                        <TooltipContent>Editar nome, preços, categoria e grupo</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`Remover ${plan.label}`} onClick={() => onRemove(plan.id)}>
                              <Trash />
                            </Button>
                          }
                        />
                        <TooltipContent>Remover</TooltipContent>
                      </Tooltip>
                    </span>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </section>
  )
}
