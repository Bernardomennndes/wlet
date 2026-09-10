import { Trash } from '@phosphor-icons/react'
import { AppCombobox } from '@/components/ui/app-combobox'
import { Button } from '@/components/ui/button'
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group'
import { InputGroup, InputGroupInput } from '@/components/ui/input-group'
import { MoneyInput } from '@/components/ui/money-input'
import { QuantityInput } from '@/components/ui/quantity-input'
import { budgetCadences, type BudgetCadence, type BudgetItem } from '@/data/types'
import { formatBRL } from '@/lib/format'
import { itemAmount } from '@/lib/rubric'

/** Do enum para o que o `AppCombobox` recebe — a mesma conversão de `plan-row-controls`. */
const CADENCE_OPTIONS = budgetCadences.map((cadence) => ({ value: cadence.value, label: cadence.label, description: cadence.labelPlural }))

interface Props {
  item: BudgetItem
  disabled: boolean
  onChange: (patch: Partial<BudgetItem>) => void
  onRemove: () => void
  /** O último item não sai — ver o comentário na lixeira. */
  canRemove: boolean
}

/**
 * A linha de UM item da composição de uma rubrica.
 *
 * Mora em arquivo próprio pelo critério objetivo da §1 da `component-construction`: junta à
 * lista, ela levava o JSX a dez handlers e a um `map` dentro de outro `map`. E ela satisfaz o
 * último critério da mesma seção — os dados chegam prontos: daqui para baixo só se desenha um
 * `BudgetItem`, sem saber de que rubrica ele é. O precedente é `plan-row-controls.tsx`, criado
 * para tirar da lista de Planos exatamente o mesmo peso.
 *
 * A linha inteira é UM `ButtonGroup`: nome, quantidade com unidade, cadência, preço unitário,
 * subtotal e remoção encostam um no outro numa peça só, com raio nas pontas e divisa entre os
 * campos. Antes eram cinco controles soltos com "×" e "=" escritos entre eles, e a conta ficava
 * por conta do leitor — além de três alturas diferentes na mesma linha, medidas: 28px nos
 * campos e 24px no botão. O grupo impõe uma altura só.
 */
export function RubricItemRow({ item, disabled, onChange, onRemove, canRemove }: Props) {
  const nome = item.label || 'item sem nome'
  return (
    <ButtonGroup className="w-fit">
      <InputGroup className="w-64 flex-none">
        <InputGroupInput
          aria-label="Nome do item"
          autoComplete="off"
          // Placeholder, NÃO valor: um item nasce sem nome, e escrever "Novo
          // item" no campo afirmaria um nome que ninguém digitou — a mesma
          // regra do plano que nasce sem mês e da célula que fica vazia.
          placeholder="Nome do item"
          disabled={disabled}
          value={item.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </InputGroup>
      <QuantityInput
        groupClassName="w-32 flex-none"
        aria-label={`Quantidade de ${nome}`}
        disabled={disabled}
        value={item.quantity}
        onValueChange={(quantity) => onChange({ quantity })}
        unit={item.unit}
        onUnitChange={(unit) => onChange({ unit })}
      />
      <AppCombobox
        items={CADENCE_OPTIONS}
        value={item.cadence ?? 'month'}
        onValueChange={(cadence) => onChange({ cadence: cadence as BudgetCadence })}
        aria-label={`Frequência de ${nome}`}
        // Sem `rounded-none`: o `ButtonGroup` já zera os raios internos por CSS,
        // e repetir a decisão aqui a duplicaria em dois lugares.
        className="w-28 flex-none"
        variant="outline"
      />
      <MoneyInput groupClassName="w-32 flex-none" aria-label={`Preço unitário de ${nome}`} disabled={disabled} value={item.unitAmount} onValueChange={(unitAmount) => onChange({ unitAmount })} />
      {/*
                    O subtotal é sempre MENSAL, mesmo num item semanal, e é por isso que ele
                    precisa da legenda: sem o "/mês" a linha "2 kg /semana × R$ 22" ao lado
                    de "R$ 191,19" pareceria erro de conta.
                  */}
      <ButtonGroupText className="w-32 flex-none justify-end font-mono tabular-nums">
        {formatBRL(itemAmount(item))}
        <span className="text-muted-foreground font-sans">/mês</span>
      </ButtonGroupText>
      <Button
        /*
                      `outline` DENTRO do grupo, e isso não contraria a decisão de
                      `plan-row-controls.tsx` — completa-a. O argumento lá é que "um par de
                      botões emoldurados por linha pesa mais que o nome": o problema são
                      VÁRIAS molduras por linha. O `ButtonGroup` produz UMA, que é o próprio
                      remédio; e ele forma a peça com as bordas dos filhos, então um `ghost`
                      aqui abre um buraco no meio do grupo — medido em captura. Quem fica
                      `ghost` é o que está FORA da peça: o "Adicionar item", abaixo.
                    */
        variant="outline"
        size="icon"
        // O ÚLTIMO item não sai: composição vazia somaria zero e a rubrica
        // sumiria da previsão sem nada dizer. Para largar a composição existe
        // "Usar valor único", que preserva o total.
        disabled={disabled || !canRemove}
        aria-label={`Remover ${nome}`}
        onClick={() => onRemove()}
      >
        <Trash />
      </Button>
    </ButtonGroup>
  )
}
