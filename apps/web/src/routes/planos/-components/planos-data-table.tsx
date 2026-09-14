import { Pencil, Trash } from '@phosphor-icons/react'
import { CategoryBadge } from '@/components/category-badge'
import { EnumBadge } from '@/components/enum-badge'
import { Button } from '@wlet/ui/components/button'
import { Checkbox } from '@wlet/ui/components/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@wlet/ui/components/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@wlet/ui/components/tooltip'
import { planStatuses, type Plan, type PlanGroup, type PlanStatus } from '@wlet/domain'
import { formatBRL, formatMonthShort } from '@wlet/lib/format'
import { planTotal } from '@wlet/domain/plans'
import { cn } from '@wlet/lib/utils'
import { InstallmentsCell, MonthCell, PaymentCell } from './plan-row-controls'

/**
 * A tabela de planos, agrupada.
 *
 * O arquivo chamava-se `plan-list.tsx` e exportava `PlanList`, e o nome era o problema: aqui
 * `-list` é o que a `data-list.md` define — `ul/li` + `dt/dd`, um item por vez —, e isto é uma
 * grade de colunas. Nome de uma forma com o markup da outra faz quem procura a listagem passar
 * direto, e faz a `route-organization.md` §3.2 (que casa por `*-data-table*`) nunca alcançar o
 * arquivo que ela governa.
 *
 * Era uma `DataList`, e a §0 da `data-table` diz por que deixou de ser: a unidade de leitura
 * mudou. Enquanto um plano era nome e preço, lia-se um item por vez; desde que cada linha
 * ganhou forma de pagamento, número de parcelas e mês, a pergunta passou a ser "qual custa
 * mais", "qual cai antes", "quantos já decidi" — e essas são perguntas de COLUNA. O teste que
 * aquela regra propõe resolve o caso: existe coluna que alguém vai querer ordenar? Valor e
 * mês, sim.
 *
 * O que a forma antiga cobrava, e a grade devolve: os controles de um item não se alinhavam
 * com os do vizinho, então comparar exigia ler item por item; e cada plano empilhava três
 * faixas de altura própria, de modo que seis planos não cabiam na tela junto com o gráfico
 * que eles alimentam.
 *
 * **Um grupo é um `<tbody>`**, com o nome e o total numa linha que atravessa a tabela. Isso
 * mantém a grade de colunas contínua entre os grupos — que é o ponto — sem transformar cada
 * viagem numa tabela própria com o próprio alinhamento.
 */

/** A tabela tem sete colunas, e a linha de grupo atravessa todas. */
const COLUMNS = 7

/**
 * A divisória vertical que abre cada coluna de DADO.
 *
 * Ela existe a partir de "Valor" e não antes: caixinha e nome são a identidade da linha, um
 * bloco só, e uma régua entre eles partiria o que se lê junto. Da identidade para a direita
 * cada coluna é um campo distinto — quanto, como, em quantas, quando —, e é aí que a régua
 * paga: ela dá ao olho o trilho que a comparação entre linhas precisa.
 *
 * **"Ações" NÃO ganha divisória.** Não é coluna de dado: é o que se faz com a linha, e fica
 * vazia até a linha ser apontada. Uma régua ali isolaria uma faixa vazia na borda do cartão.
 */
const DIVIDER = 'border-l'

/**
 * A tabela sangra até a borda do cartão, então o respiro das pontas é das CÉLULAS.
 *
 * Com `CardContent` recuado, as linhas paravam antes da borda do cartão e as duas molduras
 * ficavam encaixadas uma dentro da outra sem se tocar. Sangrando, a borda do cartão passa a
 * ser a aresta externa da tabela — e aí a primeira e a última célula precisam do recuo que o
 * `CardContent` dava, senão o texto encosta na borda.
 */
const BLEED = '[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4'

/**
 * A aresta de cima, que FECHA a grade.
 *
 * Com a tabela sangrando, a borda do cartão dá três lados — esquerda, direita e base — e o
 * quarto ficava aberto: a linha de cabeçalho tinha régua embaixo e nada em cima, então a
 * grade parecia começar no meio de si mesma. Fechada, ela é um retângulo, e a faixa dos
 * títulos de coluna passa a ter as duas arestas que a delimitam.
 *
 * É `border-t` na TABELA e não `border-b` no `CardHeader`: aquele desenharia a régua colada à
 * descrição, e sobrariam os dezesseis pixels do vão do cartão entre ela e os títulos — uma
 * linha, um espaço vazio, e outra linha logo abaixo. Aqui a régua nasce onde a grade nasce.
 */
const TOP_EDGE = 'border-t'

export function PlanosDataTable({
  groups,
  items,
  onEdit,
  onRemove,
  onRemoveGroup,
  onUpdate,
  onGroupStatus,
  onHighlight,
  monthsWithData,
  defaultMonth,
  disabled = false,
}: {
  groups: PlanGroup[]
  items: Plan[]
  onEdit: (plan: Plan) => void
  onRemove: (id: string) => void
  onRemoveGroup: (id: string) => void
  onUpdate: (id: string, patch: Partial<Omit<Plan, 'id'>>) => void
  /** O checkbox do grupo: decide ou devolve a estudo todos os planos dele, numa escrita só. */
  onGroupStatus: (group: PlanGroup, status: Exclude<PlanStatus, 'discarded'>) => void
  /**
   * Trava a linha INTEIRA enquanto uma escrita está em voo — e é defeito medido, não zelo.
   *
   * Toda escrita de plano é lê-aplica-grava do catálogo inteiro (`plans.service.ts`, `mutate`).
   * Dois controles acionados antes de a primeira gravação voltar leem o MESMO retrato, e o segundo
   * `save` apaga o primeiro: reproduzido com duas chamadas concorrentes, dois planos entram e um
   * some. A tela de Rubricas já se protege assim.
   */
  disabled?: boolean
  /**
   * Qual plano a pessoa está apontando. A tela usa isso para ACENDER a contribuição dele nas
   * colunas do gráfico acima — é o que liga a decisão ao efeito sem exigir um clique.
   */
  onHighlight: (plan: Plan | null) => void
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
    <Table className={cn(TOP_EDGE, BLEED)}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">
            <span className="sr-only">Entra na previsão</span>
          </TableHead>
          <TableHead>Plano</TableHead>
          <TableHead className={cn(DIVIDER, 'w-28 text-right')}>Valor</TableHead>
          <TableHead className={cn(DIVIDER, 'w-32')}>Forma</TableHead>
          <TableHead className={cn(DIVIDER, 'w-36')}>Parcelas</TableHead>
          <TableHead className={cn(DIVIDER, 'w-32')}>Mês</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">Ações</span>
          </TableHead>
        </TableRow>
      </TableHeader>

      {buckets.map((bucket) => {
        const total = bucket.plans.reduce((sum, plan) => sum + planTotal(plan), 0)
        // O que o checkbox do grupo alterna: descartado fica de fora, porque a caixinha da linha
        // também não o representa. Parcial é o traço — nem todos, nem nenhum.
        const toggleable = bucket.plans.filter((plan) => plan.status !== 'discarded')
        const decidedCount = toggleable.filter((plan) => plan.status === 'decided').length
        return (
          <TableBody key={bucket.group?.id ?? 'avulsos'} className="border-b last:border-0">
            {/* O total do grupo cai na COLUNA "Valor", não à direita da tabela: ele é da mesma
                grandeza dos valores abaixo dele, e é justamente a comparação entre o total e
                as parcelas que a grade veio permitir. Encostado na borda direita ele ficava a
                quatrocentos pixels do número que resume. */}
            <TableRow className="group/bucket bg-muted/40 hover:bg-muted/40">
              <TableCell className="py-1.5">
                {/* Só nos grupos reais: "Avulsos" não é uma coisa que se decide junta. */}
                {bucket.group ? (
                  <Checkbox
                    disabled={disabled || toggleable.length === 0}
                    aria-label={`Aplicar todos os planos de ${bucket.group.label} na previsão`}
                    checked={toggleable.length > 0 && decidedCount === toggleable.length}
                    indeterminate={decidedCount > 0 && decidedCount < toggleable.length}
                    onCheckedChange={(checked) => bucket.group && onGroupStatus(bucket.group, checked ? 'decided' : 'considering')}
                  />
                ) : null}
              </TableCell>
              <TableCell className="py-1.5 font-medium text-muted-foreground">
                {bucket.group?.label ?? 'Avulsos'}
                {bucket.group?.from ? <span className="ml-2 font-normal">{formatMonthShort(bucket.group.from)}</span> : null}
              </TableCell>
              <TableCell className={cn(DIVIDER, 'py-1.5 text-right font-mono tabular-nums')}>{formatBRL(total)}</TableCell>
              <TableCell colSpan={3} className={cn(DIVIDER, 'py-1.5')} />
              <TableCell className="py-1.5">
                {bucket.group ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={disabled}
                          aria-label={`Remover o grupo ${bucket.group.label}`}
                          className="ml-auto flex opacity-0 group-hover/bucket:opacity-100 group-focus-within/bucket:opacity-100"
                          onClick={() => bucket.group && onRemoveGroup(bucket.group.id)}
                        >
                          <Trash />
                        </Button>
                      }
                    />
                    <TooltipContent>Remover o grupo (os itens ficam avulsos)</TooltipContent>
                  </Tooltip>
                ) : null}
              </TableCell>
            </TableRow>

            {bucket.plans.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={COLUMNS} className="text-muted-foreground">
                  Nenhum item neste grupo.
                </TableCell>
              </TableRow>
            ) : (
              bucket.plans.map((plan) => {
                const discarded = plan.status === 'discarded'
                return (
                  <TableRow
                    key={plan.id}
                    className="group/row"
                    // O realce é de APONTAR, não de clicar: passar o cursor (ou chegar pelo
                    // teclado a um controle da linha) acende no gráfico o que este plano põe
                    // em cada mês, e apagá-lo é só sair. Um clique gastaria a única ação que a
                    // linha ainda não tem para uma leitura que é passageira.
                    onPointerEnter={() => onHighlight(plan)}
                    onPointerLeave={() => onHighlight(null)}
                    onFocus={() => onHighlight(plan)}
                    onBlur={() => onHighlight(null)}
                  >
                    <TableCell>
                      {/* A caixinha É a situação. Marcada, o plano é "Decidido" e entra na
                          previsão de verdade; desmarcada, volta a "Em estudo". O badge que
                          repetia essa mesma afirmação ao lado saiu — duas marcas para um
                          estado só obrigam o olho a conferir se concordam. */}
                      <Checkbox
                        disabled={disabled}
                        aria-label={`Aplicar ${plan.label} na previsão`}
                        checked={plan.status === 'decided'}
                        onCheckedChange={(checked) => onUpdate(plan.id, { status: checked ? 'decided' : 'considering' })}
                      />
                    </TableCell>

                    <TableCell>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cn('truncate font-medium', discarded && 'text-muted-foreground line-through')}>{plan.label}</span>
                        <CategoryBadge value={plan.categoryId} className="shrink-0" />
                        {/* O badge de situação sobrou para UM caso: "Descartado", que a
                            caixinha não sabe dizer — desmarcada, ela significa "em estudo".
                            Onde a caixinha já responde, ele não aparece. */}
                        {discarded ? <EnumBadge option={planStatuses.find((s) => s.value === 'discarded')} value="discarded" className="shrink-0" /> : null}
                      </span>
                    </TableCell>

                    <TableCell className={cn(DIVIDER, 'text-right font-mono tabular-nums')}>{formatBRL(planTotal(plan))}</TableCell>

                    <TableCell className={DIVIDER}>
                      <PaymentCell plan={plan} disabled={disabled} onUpdate={(patch) => onUpdate(plan.id, patch)} />
                    </TableCell>

                    <TableCell className={DIVIDER}>
                      <span className="flex items-center gap-1">
                        <InstallmentsCell plan={plan} disabled={disabled} onUpdate={(patch) => onUpdate(plan.id, patch)} />
                      </span>
                    </TableCell>

                    <TableCell className={DIVIDER}>
                      <MonthCell plan={plan} monthsWithData={monthsWithData} defaultMonth={defaultMonth} disabled={disabled} onUpdate={(patch) => onUpdate(plan.id, patch)} />
                    </TableCell>

                    <TableCell>
                      {/* As ações ficam invisíveis até a linha ser apontada, e continuam
                          FOCÁVEIS o tempo todo: `opacity-0` esconde sem tirar do DOM, e o
                          `focus-within` do grupo as traz de volta para quem chega pelo
                          teclado. É o que impede a linha de virar uma fileira de botões
                          repetidos seis vezes. */}
                      <span className="flex justify-end gap-0.5 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100">
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
        )
      })}

      {/* O vazio GLOBAL é uma linha da tabela, como o vazio de um grupo logo acima — a moldura
          (cabeçalho e colunas) fica montada com zero planos. Trocar a tabela inteira por um
          bloco centrado apagaria justamente o cabeçalho, que é a única explicação do que a
          listagem contém quando não há nenhuma linha de onde inferir (`data-table.md` §7.1). */}
      {buckets.length === 0 ? (
        <TableBody>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={COLUMNS} className="text-muted-foreground">
              Nenhum plano na lista.
            </TableCell>
          </TableRow>
        </TableBody>
      ) : null}
    </Table>
  )
}
