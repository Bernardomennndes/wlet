import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Trash } from '@phosphor-icons/react'
import { AppCombobox } from '@wlet/ui/components/app-combobox'
import { Button } from '@wlet/ui/components/button'
import { ButtonGroup, ButtonGroupText } from '@wlet/ui/components/button-group'
import { FieldError } from '@wlet/ui/components/field'
import { InputGroup, InputGroupInput } from '@wlet/ui/components/input-group'
import { MoneyInput } from '@wlet/ui/components/money-input'
import { QuantityInput } from '@wlet/ui/components/quantity-input'
import { budgetCadences, type BudgetCadence, type BudgetItem } from '@wlet/domain'
import { itemAmount } from '@wlet/domain/rubric'
import { formatBRL } from '@wlet/lib/format'

/** Do enum para o que o `AppCombobox` recebe — a mesma conversão de `plan-row-controls`. */
const CADENCE_OPTIONS = budgetCadences.map((cadence) => ({ value: cadence.value, label: cadence.label, description: cadence.labelPlural }))

/**
 * Os valores aceitos saem da lista do DOMÍNIO, nunca de um `z.enum` redigitado aqui — é a §3 da
 * `forms.md`. E é ele que apagou o `cadence as BudgetCadence` que a linha carregava: o combobox
 * devolve `string`, e quem promete que a string é uma cadência é o schema, não uma asserção.
 */
const CADENCE_VALUES = budgetCadences.map((cadence) => cadence.value) as [BudgetCadence, ...BudgetCadence[]]

/**
 * O item da composição, como o formulário o coleta.
 *
 * **O nome NÃO é obrigatório**, e isso é decisão de desenho e não esquecimento: o item nasce
 * vazio de propósito (ver o "Adicionar item" da lista), e exigir nome no commit faria a
 * quantidade e o preço de um item recém-criado não gravarem enquanto ninguém o batizasse — uma
 * recusa silenciosa, que é pior que o campo em branco. O que o schema prende é o que não tem
 * leitura possível: quantidade e preço negativos.
 */
const itemSchema = z.object({
  label: z.string(),
  quantity: z.number().min(0, 'A quantidade não pode ser negativa.'),
  /** Texto livre — ver `BudgetItem.unit`; uma lista fechada obrigaria a mentir sobre a compra. */
  unit: z.string(),
  cadence: z.enum(CADENCE_VALUES),
  unitAmount: z.number().min(0, 'O preço unitário não pode ser negativo.'),
})

type ItemFormValues = z.infer<typeof itemSchema>

const amountSchema = z.object({ amount: z.number().min(0, 'O planejado não pode ser negativo.') })

type AmountFormValues = z.infer<typeof amountSchema>

interface ItemProps {
  item: BudgetItem
  /** Só a REMOÇÃO desabilita durante a gravação: campo desabilitado perde o foco. */
  disabled: boolean
  onChange: (patch: Partial<BudgetItem>) => void
  onRemove: () => void
  /** O último item não sai — ver o comentário na lixeira. */
  canRemove: boolean
}

/** O que já está gravado é igual ao que sairia do formulário? Então não há o que gravar. */
function isSameItem(patch: BudgetItem, item: BudgetItem) {
  return (
    patch.label === item.label &&
    patch.quantity === item.quantity &&
    patch.unitAmount === item.unitAmount &&
    (patch.unit ?? '') === (item.unit ?? '') &&
    // A ausência de cadência JÁ significa "todo mês" (ver `BudgetCadence`), então o item
    // legado sem o campo é igual ao que o formulário devolve com `month` escolhido.
    patch.cadence === (item.cadence ?? 'month')
  )
}

/**
 * A linha de UM item da composição de uma rubrica — e ela é um FORMULÁRIO.
 *
 * Mora em arquivo próprio pelo critério objetivo da §1 da `component-construction`: junta à
 * lista, ela levava o JSX a dez handlers e a um `map` dentro de outro `map`. E ela satisfaz o
 * último critério da mesma seção — os dados chegam prontos: daqui para baixo só se desenha um
 * `BudgetItem`, sem saber de que rubrica ele é.
 *
 * **O nome do arquivo é `rubricas-form` e não `rubric-item-row`, e a troca é o conserto.** Cinco
 * campos que alimentam uma escrita são um formulário pela §1 da `forms.md` — mas a regra casa por
 * PADRÃO DE NOME, e o padrão dela é `-form`: um arquivo chamado pela LINHA da tabela nunca a
 * recebia, e nasceu com `useState` avulso e sem validação nenhuma — exatamente o modo de falha
 * silencioso que a `naming.md` §1 descreve. Afrouxar o glob para alcançar `-row` era o caminho
 * proibido; o certo é o arquivo passar a se chamar pelo que ele é.
 *
 * A linha inteira é UM `ButtonGroup`: nome, quantidade com unidade, cadência, preço unitário,
 * subtotal e remoção encostam um no outro numa peça só, com raio nas pontas e divisa entre os
 * campos. Antes eram cinco controles soltos com "×" e "=" escritos entre eles, e a conta ficava
 * por conta do leitor — além de três alturas diferentes na mesma linha, medidas: 28px nos
 * campos e 24px no botão. O grupo impõe uma altura só.
 */
export function RubricItemForm({ item, disabled, onChange, onRemove, canRemove }: ItemProps) {
  /**
   * O gravado entra como `values` — e não como `defaultValues` — porque a linha é REUTILIZADA.
   *
   * A lista chaveia os itens por índice (o item não tem id e o rótulo é editável), então remover
   * o primeiro de três faz esta mesma instância receber outro item nas props. Com
   * `defaultValues`, o formulário continuaria exibindo o item que saiu; com `values`, o
   * react-hook-form o reencaixa quando a referência muda — que é também o que dispensa um
   * `useEffect` de `reset`, proibido pela §2 da `component-construction`.
   */
  const values = useMemo<ItemFormValues>(() => ({ label: item.label, quantity: item.quantity, unit: item.unit ?? '', cadence: item.cadence ?? 'month', unitAmount: item.unitAmount }), [item])
  const { control, register, handleSubmit, setValue, formState } = useForm<ItemFormValues>({ resolver: zodResolver(itemSchema), values })

  /**
   * O que se digita sobe no BLUR, não a cada tecla.
   *
   * Gravar por tecla levantava `saving`, que a tela repassava como `disabled` — e campo
   * desabilitado perde o foco. Adiar até o blur tira a gravação do caminho da digitação, e de
   * quebra deixa de mandar uma escrita por caractere ao IndexedDB.
   */
  const commit = handleSubmit((submitted) => {
    const patch: BudgetItem = {
      label: submitted.label,
      quantity: submitted.quantity,
      unitAmount: submitted.unitAmount,
      // Unidade vazia SOME em vez de virar string vazia: o campo é opcional no domínio, e um
      // `""` gravado é um dado que ninguém informou.
      unit: submitted.unit.trim() || undefined,
      cadence: submitted.cadence,
    }
    // Blur sem edição não grava. Sem esta guarda, atravessar a linha com Tab mandaria uma
    // escrita por campo — e cada uma levanta `saving` na tela inteira, sem número novo nenhum.
    if (isSameItem(patch, item)) return
    onChange(patch)
  })

  /**
   * O blur é escutado no `<form>`, não campo a campo, e isso conserta um buraco.
   *
   * O `focusout` borbulha, então UM ouvinte aqui cobre todos os campos — inclusive a unidade,
   * que o `QuantityInput` desenha por dentro e não expõe `onBlur`: antes, digitar "kg" e clicar
   * fora deixava a unidade pendente até outro campo perder o foco, e quem saísse da linha a
   * perdia sem aviso.
   */
  const onBlur = () => void commit()

  /** Enter vale como sair do campo: quem digita um número e confirma espera que ele conte. */
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== 'Enter') return
    // O `<form>` não tem botão de submit, então o Enter nativo não submeteria com vários
    // campos na linha — quem submete é esta chamada, e o `preventDefault` evita o resto.
    event.preventDefault()
    void commit()
  }

  // O que a linha DESENHA é o que está no formulário, não o que está gravado: assim o subtotal
  // acompanha a digitação em vez de congelar até o blur.
  const label = useWatch({ control, name: 'label' })
  const quantity = useWatch({ control, name: 'quantity' })
  const unit = useWatch({ control, name: 'unit' })
  const cadence = useWatch({ control, name: 'cadence' })
  const unitAmount = useWatch({ control, name: 'unitAmount' })
  const nome = label || 'item sem nome'

  return (
    /*
     * A linha OCUPA a largura toda, e quem absorve a folga é o NOME.
     *
     * Ela era `w-fit` com todos os campos em `flex-none`: a peça parava onde o conteúdo
     * acabava e sobrava metade do cartão vazia à direita. Os campos numéricos continuam em
     * largura medida de propósito — eles são uma COLUNA, e coluna que muda de largura de uma
     * linha para a outra deixa de ser comparável, que é a única razão de existir uma coluna.
     * O nome é o oposto: o conteúdo dele varia a cada item e é o que se lê para achar a linha.
     *
     * O `min-w-48` é o que impede o nome de colapsar quando não há folga; abaixo disso a peça
     * volta a transbordar, e o `overflow-x-auto` do `<ul>` da lista continua dando conta.
     */
    <form onSubmit={commit} onBlur={onBlur} className="space-y-1">
      <ButtonGroup className="w-full">
        <InputGroup className="min-w-48 flex-1">
          <InputGroupInput
            aria-label="Nome do item"
            autoComplete="off"
            // Placeholder, NÃO valor: um item nasce sem nome, e escrever "Novo
            // item" no campo afirmaria um nome que ninguém digitou — a mesma
            // regra do plano que nasce sem mês e da célula que fica vazia.
            placeholder="Nome do item"
            onKeyDown={onKeyDown}
            {...register('label')}
          />
        </InputGroup>
        <Controller
          control={control}
          name="quantity"
          render={({ field }) => (
            <QuantityInput
              groupClassName="w-32 flex-none"
              aria-label={`Quantidade de ${nome}`}
              aria-invalid={Boolean(formState.errors.quantity)}
              value={field.value}
              onValueChange={field.onChange}
              onKeyDown={onKeyDown}
              unit={unit}
              // A unidade é campo do MESMO controle, e por isso vai por `setValue` em vez de um
              // segundo `Controller`: o `QuantityInput` é um componente só.
              onUnitChange={(next) => setValue('unit', next)}
            />
          )}
        />
        <Controller
          control={control}
          name="cadence"
          render={({ field }) => (
            <AppCombobox
              items={CADENCE_OPTIONS}
              value={field.value}
              // Escolher uma cadência é um ato DELIBERADO e sem digitação pendente — grava na
              // hora, mas pelo mesmo `commit` dos outros campos, e não por um caminho paralelo
              // que pulava a validação da linha.
              onValueChange={(next) => {
                field.onChange(next)
                void commit()
              }}
              aria-label={`Frequência de ${nome}`}
              // Sem `rounded-none`: o `ButtonGroup` já zera os raios internos por CSS,
              // e repetir a decisão aqui a duplicaria em dois lugares.
              className="w-28 flex-none"
              variant="outline"
            />
          )}
        />
        <Controller
          control={control}
          name="unitAmount"
          render={({ field }) => (
            <MoneyInput
              groupClassName="w-32 flex-none"
              aria-label={`Preço unitário de ${nome}`}
              aria-invalid={Boolean(formState.errors.unitAmount)}
              value={field.value}
              onValueChange={field.onChange}
              onKeyDown={onKeyDown}
            />
          )}
        />
        {/*
          O subtotal é sempre MENSAL, mesmo num item semanal, e é por isso que ele
          precisa da legenda: sem o "/mês" a linha "2 kg /semana × R$ 22" ao lado
          de "R$ 191,19" pareceria erro de conta.
        */}
        <ButtonGroupText className="w-32 flex-none justify-end font-mono tabular-nums">
          {formatBRL(itemAmount({ label, quantity, unitAmount, cadence }))}
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
          // Dentro de um `<form>`, botão sem `type` é botão de submit: sem isto, remover o
          // item submeteria a linha antes de ela sair.
          type="button"
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
      {/*
        UM erro para a linha toda, e não um por campo: a linha é uma peça de seis colunas
        estreitas, e uma mensagem sob cada uma quebraria o `ButtonGroup` em seis alturas
        diferentes. O campo em falta se identifica pelo `aria-invalid`, e o texto diz qual é.
      */}
      <FieldError className="pl-1" errors={[formState.errors.quantity, formState.errors.unitAmount]} />
    </form>
  )
}

/**
 * O valor de uma rubrica SEM composição — um campo só, e ainda assim um formulário.
 *
 * A §1 da `forms.md` é explícita: vale para qualquer coleta que alimente uma escrita, "inclusive
 * de UM único campo e inclusive inline". Ele é componente próprio porque precisa de estado — o
 * que se digita só sobe no blur — e um hook não pode viver dentro do `map` da lista. Mesmo
 * motivo e mesmo remédio da linha de item: com a gravação por tecla, `saving` desabilitava o
 * campo e o foco ia para o `body`.
 */
export function RubricAmountForm({ label, amount, onCommit }: { label: string; amount: number; onCommit: (amount: number) => void }) {
  const values = useMemo<AmountFormValues>(() => ({ amount }), [amount])
  const { control, handleSubmit, formState } = useForm<AmountFormValues>({ resolver: zodResolver(amountSchema), values })

  const commit = handleSubmit((submitted) => {
    // Mesma guarda da linha de item: blur sem edição não é gravação.
    if (submitted.amount === amount) return
    onCommit(submitted.amount)
  })

  return (
    <form onSubmit={commit} onBlur={() => void commit()}>
      <Controller
        control={control}
        name="amount"
        render={({ field }) => (
          <MoneyInput
            aria-label={`Planejado para ${label}`}
            aria-invalid={Boolean(formState.errors.amount)}
            value={field.value}
            onValueChange={field.onChange}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              void commit()
            }}
          />
        )}
      />
      <FieldError errors={[formState.errors.amount]} />
    </form>
  )
}
