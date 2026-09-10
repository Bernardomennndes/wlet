import { useState } from 'react'
import { CalendarPlus, X } from '@phosphor-icons/react'
import { AppCombobox, type SelectOption } from '@/components/ui/app-combobox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MonthPicker } from '@/components/ui/month-picker'
import { paymentModes, type PaymentMode, type Plan } from '@wlet/domain'
import { formatBRL } from '@/lib/format'
import { installmentAmount, planInstallments } from '@/lib/plans'

/**
 * As células de edição de uma linha da lista de planos.
 *
 * A gaveta continua existindo para COMPOR um plano — nome, categoria, os dois preços, grupo.
 * O que vem para cá é o que se mexe muitas vezes seguidas enquanto se decide: como paga, em
 * quantas vezes e em que mês. Abrir uma gaveta para trocar 10× por 12× e fechá-la de novo
 * cobra três cliques por ajuste, e ajustar é justamente o que se faz o tempo todo aqui.
 *
 * Cada controle grava NA HORA, sem botão de confirmar — ao contrário da gaveta. A diferença
 * não é de gosto: ali se compõe um objeto novo, que precisa de um momento em que fica pronto;
 * aqui se altera um campo de um plano que já existe, e o efeito é imediato no gráfico acima.
 *
 * **Os controles são `ghost`, não `outline`, e isso é o que torna a grade legível.** Com seis
 * linhas na tela, um par de botões emoldurados por linha pesa mais que o nome do plano — o
 * controle passa a dominar o conteúdo, que é o defeito que a reconstrução veio corrigir. Em
 * `ghost` a célula lê como texto até a linha ser apontada, e a moldura aparece no hover.
 *
 * **E eles são renderizados SEMPRE, nunca só no hover.** Trocar texto por controle ao passar o
 * mouse tiraria do teclado tudo o que a linha edita: não se pode focar um controle que não
 * está no DOM. Quem muda é a aparência, não a existência.
 */

/** O sentinela de "ainda não escolhi", que o `AppCombobox` desenha esmaecido. */
const NO_PAYMENT = 'none'

const PAYMENT_OPTIONS: SelectOption[] = [{ value: NO_PAYMENT, label: 'Não decidido' }, ...paymentModes.map((mode) => ({ value: mode.value, label: mode.label, icon: mode.icon }))]

/** Como o plano é pago. Aceita ficar SEM escolha — é o mesmo estado que o formulário permite. */
export function PaymentCell({ plan, onUpdate }: { plan: Plan; onUpdate: (patch: Partial<Omit<Plan, 'id'>>) => void }) {
  return (
    <AppCombobox
      aria-label={`Como pagar ${plan.label}`}
      variant="ghost"
      className="w-full"
      items={PAYMENT_OPTIONS}
      emptyValue={NO_PAYMENT}
      value={plan.payment ?? NO_PAYMENT}
      onValueChange={(next) => {
        // Escolher parcelado num plano que só tem preço à vista precisa de um bloco parcelado
        // para existir: sem ele a escolha não teria o que dividir. O total nasce do preço à
        // vista — a mesma decisão que a migração da versão 1 do envelope toma: sem desconto
        // conhecido, o valor disponível é o único que se pode afirmar.
        if (next === 'financed') onUpdate({ financed: { total: plan.financed?.total ?? plan.cash, installments: plan.financed?.installments ?? 2 }, payment: 'financed' })
        else onUpdate({ payment: next === NO_PAYMENT || next === '' ? undefined : (next as PaymentMode) })
      }}
    />
  )
}

/**
 * Em quantas vezes. Só existe quando parcelado é a forma escolhida: um "1×" editável ao lado
 * de "À vista" ofereceria dois jeitos de dizer a mesma coisa.
 */
export function InstallmentsCell({ plan, onUpdate }: { plan: Plan; onUpdate: (patch: Partial<Omit<Plan, 'id'>>) => void }) {
  /**
   * O campo guarda TEXTO CRU enquanto está sendo digitado.
   *
   * Ligado direto ao plano ele era intransponível: para chegar a 12 é preciso passar por "1",
   * que a faixa 2..99 recusa — o campo voltava a "4", o "2" caía depois dele e o plano era
   * gravado com 42 parcelas, um valor que ninguém pediu. Apagar tudo também não funcionava.
   *
   * É a mesma lição que a gaveta já tinha aprendido, e que eu repeti aqui: campo controlado
   * pelo dado se corrige no meio da digitação, e a correção vira entrada.
   */
  const [draft, setDraft] = useState<string | null>(null)

  if (plan.payment !== 'financed') return null

  const setInstallments = (n: number) => {
    if (!Number.isInteger(n) || n < 2 || n > 99) return false
    onUpdate({ financed: { total: plan.financed?.total ?? plan.cash, installments: n }, payment: 'financed' })
    return true
  }

  return (
    <>
      <Input
        aria-label={`Parcelas de ${plan.label}`}
        type="number"
        min={2}
        max={99}
        step={1}
        value={draft ?? String(planInstallments(plan))}
        onChange={(event) => {
          // O rascunho some assim que o valor digitado é gravável; enquanto não for, ele fica
          // na tela para a pessoa terminar de digitar.
          setDraft(setInstallments(Number(event.target.value)) ? null : event.target.value)
        }}
        onBlur={() => setDraft(null)}
        // `h-7` casa com a altura padrão dos vizinhos, e o `Input` deste registry não tem prop
        // `size` para declará-la — desvio da §6 sem remédio disponível, porque o arquivo é
        // gerado e o `CLAUDE.md` proíbe editá-lo.
        className="h-7 w-12 px-1 text-center"
      />
      <span className="truncate tabular-nums text-muted-foreground">× {formatBRL(installmentAmount(plan))}</span>
    </>
  )
}

/**
 * O mês da compra.
 *
 * Sem mês o plano não entra em previsão nenhuma (`planMonths` devolve lista vazia), então a
 * célula precisa dizer isso em vez de ficar em branco: "Sem mês" é a lacuna DECLARADA, e o
 * botão que a substitui é o que a preenche num clique.
 */
export function MonthCell({
  plan,
  monthsWithData,
  defaultMonth,
  onUpdate,
}: {
  plan: Plan
  monthsWithData: string[]
  /** O mês que "Sem mês" propõe: o primeiro projetável, não o último medido. */
  defaultMonth: string
  onUpdate: (patch: Partial<Omit<Plan, 'id'>>) => void
}) {
  if (!plan.month) {
    return (
      <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={() => onUpdate({ month: defaultMonth })}>
        <CalendarPlus data-icon="inline-start" /> Sem mês
      </Button>
    )
  }

  return (
    <span className="flex w-full items-center">
      <MonthPicker
        aria-label={`Mês da compra de ${plan.label}`}
        variant="ghost"
        className="min-w-0 flex-1 justify-start"
        value={plan.month}
        onValueChange={(month) => onUpdate({ month })}
        withData={monthsWithData}
        min={monthsWithData[0]}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Limpar o mês de ${plan.label}`}
        className="opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100"
        onClick={() => onUpdate({ month: undefined })}
      >
        <X />
      </Button>
    </span>
  )
}
