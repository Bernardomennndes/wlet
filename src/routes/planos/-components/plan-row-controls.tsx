import { useState } from 'react'
import { CalendarPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MonthPicker } from '@/components/ui/month-picker'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { paymentModes, type PaymentMode, type Plan } from '@/data/types'
import { formatBRL } from '@/lib/format'
import { installmentAmount, planInstallments } from '@/lib/plans'

/**
 * Os controles rápidos de um plano, na própria linha da lista.
 *
 * A gaveta continua existindo para COMPOR um plano — nome, categoria, os dois preços, grupo.
 * O que vem para cá é o que se mexe muitas vezes seguidas enquanto se decide: em quantas
 * vezes, como paga e em que mês. Abrir uma gaveta para trocar 10× por 12× e fechá-la de novo
 * cobra três cliques por ajuste, e ajustar é justamente o que se faz o tempo todo aqui.
 *
 * Cada controle grava NA HORA, sem botão de confirmar — ao contrário da gaveta. A diferença
 * não é de gosto: ali se compõe um objeto novo, que precisa de um momento em que fica pronto;
 * aqui se altera um campo de um plano que já existe, e o efeito é imediato no gráfico ao lado.
 */
export function PlanRowControls({
  plan,
  monthsWithData,
  defaultMonth,
  onUpdate,
}: {
  plan: Plan
  monthsWithData: string[]
  /** O mês que "Definir mês" propõe: o primeiro projetável, não o último medido. */
  defaultMonth: string
  onUpdate: (patch: Partial<Omit<Plan, 'id'>>) => void
}) {
  /**
   * O campo de parcelas guarda TEXTO CRU enquanto está sendo digitado.
   *
   * Ligado direto ao plano ele era intransponível: para chegar a 12 é preciso passar por "1",
   * que a faixa 2..99 recusa — o campo voltava a "4", o "2" caía depois dele e o plano era
   * gravado com 42 parcelas, um valor que ninguém pediu. Apagar tudo também não funcionava.
   *
   * É a mesma lição que a gaveta já tinha aprendido, e que eu repeti aqui: campo controlado
   * pelo dado se corrige no meio da digitação, e a correção vira entrada.
   */
  const [draft, setDraft] = useState<string | null>(null)
  const times = planInstallments(plan)

  /**
   * Trocar o número de parcelas de um plano que só tem preço à vista.
   *
   * Sem bloco parcelado não há o que dividir, e recusar a edição obrigaria a abrir a gaveta só
   * para digitar um preço que talvez seja o mesmo. O total nasce do PREÇO À VISTA — é a mesma
   * escolha que a migração da versão 1 do envelope faz: sem desconto conhecido, o valor
   * disponível é o único que se pode afirmar. Pesquisou o preço parcelado depois? A gaveta
   * corrige.
   */
  const setInstallments = (n: number) => {
    if (!Number.isInteger(n) || n < 2 || n > 99) return false
    onUpdate({ financed: { total: plan.financed?.total ?? plan.cash, installments: n }, payment: 'financed' })
    return true
  }

  const setPayment = (next: PaymentMode | undefined) => {
    if (next === 'financed') setInstallments(plan.financed?.installments ?? 2)
    else onUpdate({ payment: next })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* O seletor de forma aceita ficar SEM escolha: clicar na opção acesa a desmarca, e o
          plano volta a "ainda não decidi" — o mesmo estado que o formulário permite. */}
      <ToggleGroup
        aria-label={`Como pagar ${plan.label}`}
        variant="outline"
        size="sm"
        value={plan.payment ? [plan.payment] : []}
        onValueChange={(next) => setPayment(next[0] as PaymentMode | undefined)}
      >
        {paymentModes.map((mode) => (
          <ToggleGroupItem key={mode.value} value={mode.value}>
            {mode.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {/* O campo de parcelas só aparece quando parcelado é a forma escolhida: um "1×" editável
          ao lado de "À vista" ofereceria dois jeitos de dizer a mesma coisa. */}
      {plan.payment === 'financed' ? (
        <span className="flex items-center gap-1">
          <Input
            aria-label={`Parcelas de ${plan.label}`}
            type="number"
            min={2}
            max={99}
            step={1}
            value={draft ?? String(times)}
            onChange={(event) => {
              // O rascunho some assim que o valor digitado é gravável; enquanto não for,
              // ele fica na tela para a pessoa terminar de digitar.
              setDraft(setInstallments(Number(event.target.value)) ? null : event.target.value)
            }}
            onBlur={() => setDraft(null)}
            className="h-7 w-14 text-center"
          />
          <span className="text-xs text-muted-foreground tabular-nums">× {formatBRL(installmentAmount(plan))}</span>
        </span>
      ) : null}

      {plan.month ? (
        <span className="flex items-center gap-1">
          <MonthPicker
            aria-label={`Mês da compra de ${plan.label}`}
            value={plan.month}
            onValueChange={(month) => onUpdate({ month })}
            withData={monthsWithData}
            min={monthsWithData[0]}
            className="h-7"
          />
          <Button variant="ghost" size="icon-sm" aria-label={`Limpar o mês de ${plan.label}`} onClick={() => onUpdate({ month: undefined })}>
            <X />
          </Button>
        </span>
      ) : (
        <Button variant="outline" size="sm" onClick={() => onUpdate({ month: defaultMonth })}>
          <CalendarPlus data-icon="inline-start" /> Definir mês
        </Button>
      )}
    </div>
  )
}
