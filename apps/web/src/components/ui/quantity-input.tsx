import { type ComponentProps, useState } from 'react'
import { InputGroup, InputGroupInput } from '@/components/ui/input-group'
import { formatQuantity, parseQuantity } from '@/lib/quantity-mask'
import { cn } from '@/lib/utils'

type Props = Omit<ComponentProps<typeof InputGroupInput>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  value: number
  onValueChange: (value: number) => void
  /** A unidade, ao lado do número: `kg`, `un`, `dose`. Texto livre — ver `BudgetItem.unit`. */
  unit?: string
  onUnitChange?: (unit: string) => void
  groupClassName?: string
}

/**
 * Campo de quantidade com a unidade ao lado, num invólucro só.
 *
 * **Não é `type="number"`**, e a razão é a mesma que o `MoneyInput` já documenta: um campo
 * numérico aceita o separador decimal do LOCALE DO SISTEMA, então num Mac em inglês quem
 * digita vírgula tem a tecla ignorada sem explicação — medido nesta própria tela, onde "0,5"
 * voltava como 1. E as setinhas de incremento são controle NATIVO do sistema, que não se
 * estiliza e destoa de todo o resto do formulário.
 *
 * O texto digitado vive em estado local para a vírgula PENDENTE sobreviver: enquanto se digita
 * "0,", o número é 0, e reescrever o campo a partir dele apagaria a vírgula recém-teclada. A
 * sincronização é derivada no render, sem efeito — se o número de fora deixou de corresponder
 * ao que o texto representa, quem manda é o número.
 *
 * A unidade é um segundo campo dentro do MESMO `InputGroup`: ela pertence ao número, e separá-la
 * em outra caixa faria "2" e "kg" parecerem dois dados independentes.
 */
export function QuantityInput({ value, onValueChange, unit, onUnitChange, groupClassName, className, ...props }: Props) {
  const [typed, setTyped] = useState(() => formatQuantity(value))
  const shown = parseQuantity(typed) === value ? typed : formatQuantity(value)

  return (
    <InputGroup className={groupClassName}>
      <InputGroupInput
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        className={cn('text-right', className)}
        value={shown}
        onChange={(event) => {
          setTyped(event.target.value)
          onValueChange(parseQuantity(event.target.value))
        }}
        {...props}
      />
      {onUnitChange && (
        <InputGroupInput
          aria-label="Unidade"
          autoComplete="off"
          placeholder="un"
          maxLength={6}
          className="text-muted-foreground w-12 flex-none pl-0"
          value={unit ?? ''}
          onChange={(event) => onUnitChange(event.target.value)}
        />
      )}
    </InputGroup>
  )
}
