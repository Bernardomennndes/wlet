import type { ComponentProps } from 'react'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { maskMoney, parseMoney } from '@/lib/money-mask'

type Props = Omit<ComponentProps<typeof InputGroupInput>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  value: number
  onValueChange: (value: number) => void
  /**
   * Classe do INVÓLUCRO, não do campo.
   *
   * Existe porque `className` cai no `<input>` interno, e largura passada a ele não alcança
   * quem de fato ocupa espaço — a armadilha já documentada no `CLAUDE.md`. Quem precisa
   * dimensionar o campo, ou encaixá-lo num `ButtonGroup`, escreve aqui.
   */
  groupClassName?: string
}

/**
 * Campo de dinheiro: "R$" fixo à esquerda e o valor mascarado enquanto se digita.
 *
 * O que ele substitui é um `type="number"`, e a troca não é cosmética. Um campo numérico exibe
 * "3000" e o leitor precisa contar as casas para saber se são três mil ou trinta reais; ele
 * também aceita notação científica, sinal e o separador do LOCALE DO SISTEMA — num Mac em
 * inglês o usuário digita vírgula e o campo simplesmente ignora a tecla, sem dizer por quê. E
 * as setinhas de incremento oferecem passo de centavo num valor de milhares, que ninguém usa.
 *
 * O valor que sai é sempre `number` em reais: quem consome não vê máscara nenhuma. Por isso a
 * prop é `onValueChange` e não `onChange` — não é o evento do DOM, é o número já lido, no
 * mesmo formato de `AppSelect` e `MonthPicker`.
 *
 * **O "R$" é um adorno, não texto do campo.** Ele fica fora do `<input>`, então não entra no
 * valor, não pode ser apagado por engano e não atrapalha copiar e colar.
 *
 * `inputMode="numeric"` traz o teclado numérico no celular sem transformar o campo num
 * `type="number"` — a máscara é uma string, e um campo numérico a recusaria por inteiro.
 */
export function MoneyInput({ value, onValueChange, groupClassName, ...props }: Props) {
  return (
    <InputGroup className={groupClassName}>
      <InputGroupAddon>
        <InputGroupText>R$</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput inputMode="numeric" autoComplete="off" placeholder="0,00" value={maskMoney(value)} onChange={(event) => onValueChange(parseMoney(event.target.value))} {...props} />
    </InputGroup>
  )
}
