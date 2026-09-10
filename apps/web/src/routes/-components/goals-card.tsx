import { DotsThree } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { Button } from '@wlet/ui/components/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@wlet/ui/components/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@wlet/ui/components/tooltip'
import { GOALS, goalProgress, type Goal } from '@/lib/goals'
import { formatBRL, formatMonthShort, formatPercent } from '@wlet/lib/format'

/**
 * Quantos tiquinhos a barra tem. Fixo, e não proporcional ao valor: é o mesmo denominador
 * em todas as metas, então o olho compara o preenchimento de uma com o da outra sem ler
 * número nenhum. Vinte e oito dá um passo de ~3,6%.
 *
 * O traço tem largura FIXA de 2px e quem se ajusta é o vão, por `justify-between`. O
 * inverso — traço em `flex-1` com vão fixo — engrossava o traço conforme o cartão crescia,
 * e a fileira voltava a ler como barra contínua justamente onde havia mais espaço.
 */
const TICKS = 28

export function GoalsCard() {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Metas</CardTitle>
        <CardAction>
          <Tooltip>
            <TooltipTrigger render={<Button variant="outline" size="icon-sm" render={<Link to="/previsao" aria-label="Ver metas e regras de previsão" />} />}>
              <DotsThree />
            </TooltipTrigger>
            <TooltipContent>Metas e regras de previsão</TooltipContent>
          </Tooltip>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {GOALS.map((goal) => (
          <GoalItem key={goal.id} goal={goal} />
        ))}
      </CardContent>
    </Card>
  )
}

function GoalItem({ goal }: { goal: Goal }) {
  const progress = goalProgress(goal)
  const filled = Math.round(progress * TICKS)
  const color = `var(--series-${goal.slot})`

  // `flex-1` nos três itens: o cartão estica junto com o gráfico da mesma linha, e a folga
  // se reparte igualmente entre as metas em vez de virar um vazio no rodapé do cartão.
  return (
    <div className="flex flex-1 flex-col justify-center gap-1.5 rounded-lg p-3 ring-1 ring-foreground/10">
      {/* Empilhado, e não tudo em duas linhas como na referência: o cartão é estreito e ali
          "R$ 12.000,00 / R$ 30.000,00" era cortado no meio. Valor cortado mente sobre a
          quantia, então o que quebra é o layout, não o número. */}
      <span className="truncate font-medium text-sm" title={goal.label}>
        {goal.label}
      </span>
      <div className="flex items-baseline justify-between gap-2 tabular-nums">
        <span className="font-semibold text-base">{formatBRL(goal.saved)}</span>
        <span className="shrink-0 font-semibold text-base">{formatPercent(progress)}</span>
      </div>
      <span className="text-muted-foreground tabular-nums">
        de {formatBRL(goal.target)} · até {formatMonthShort(goal.targetMonth)}
      </span>
      {/* `role="img"`: os tiquinhos são desenho. Quem não os vê já tem os dois valores e a
          porcentagem escritos logo acima, então o rótulo aqui só nomeia a barra. */}
      <span role="img" aria-label={`${formatPercent(progress)} de ${goal.label}`} className="mt-1 flex h-4 w-full items-stretch justify-between">
        {Array.from({ length: TICKS }, (_, i) => (
          <span key={i} className="w-1 shrink-0 rounded-[1px]" style={{ background: i < filled ? color : 'var(--chart-track)' }} />
        ))}
      </span>
    </div>
  )
}
