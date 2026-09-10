import { useRef, type RefObject } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { X } from '@phosphor-icons/react'
import { Controller, useForm, useWatch, type Control } from 'react-hook-form'
import { z } from 'zod'
import { AppCombobox } from '@wlet/ui/components/app-combobox'
import { Button } from '@wlet/ui/components/button'
import { ButtonGroup } from '@wlet/ui/components/button-group'
import { Field, FieldDescription, FieldError, FieldLabel } from '@wlet/ui/components/field'
import { Input } from '@wlet/ui/components/input'
import { MoneyInput } from '@wlet/ui/components/money-input'
import { MonthPicker } from '@wlet/ui/components/month-picker'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@wlet/ui/components/sheet'
import { ToggleGroup, ToggleGroupItem } from '@wlet/ui/components/toggle-group'
import { CATEGORIES } from '@wlet/domain'
import { paymentModes, planStatuses, type PaymentMode, type Plan, type PlanStatus } from '@wlet/domain'
import { formatBRL } from '@wlet/lib/format'
import type { PlanGroup } from '@wlet/domain'

// A descrição do catálogo entra como texto secundário — e, com ela, na busca: procurar
// "padaria" passa a encontrar "Mercado". O ícone da situação sai da lista de enum do domínio.
const CATEGORY_ITEMS = CATEGORIES.filter((c) => c.kind === 'expense').map((c) => ({ value: c.id, label: c.label, description: c.description }))
const STATUS_ITEMS = planStatuses.map((s) => ({ value: s.value, label: s.label, icon: s.icon }))

// Os valores do schema saem das listas de enum do domínio, nunca de um `z.enum` redigitado:
// um estado novo em `planStatuses` tem de ser erro de compilação aqui, não uma opção que o
// formulário aceita e a leitura rejeita.
const STATUS_VALUES = planStatuses.map((s) => s.value) as [PlanStatus, ...PlanStatus[]]
const PAYMENT_VALUES = paymentModes.map((m) => m.value) as [PaymentMode, ...PaymentMode[]]

/** O parcelamento só existe de 2 a 99 vezes — a mesma faixa que `parsePlans` exige na leitura. */
const isInstallmentCount = (n: number) => Number.isInteger(n) && n > 1 && n <= 99

const schema = z
  .object({
    label: z.string().trim().min(1, 'Dê um nome ao plano.'),
    cash: z.number().positive('Informe o preço à vista.'),
    financedTotal: z.number().nonnegative('O preço parcelado não pode ser negativo.'),
    installments: z.number(),
    // Os dois campos abaixo aceitam VAZIO, que quer dizer "ainda não decidi". Não é o mesmo
    // que um valor padrão: um plano recém-anotado não escolheu forma de pagamento nem data, e
    // preencher por ele afirmaria uma decisão que não houve.
    payment: z.union([z.enum(PAYMENT_VALUES), z.literal('')]),
    categoryId: z.string().min(1, 'Escolha uma categoria.'),
    month: z.union([z.string().regex(/^\d{4}-\d{2}$/), z.literal('')]),
    groupId: z.string(),
    status: z.enum(STATUS_VALUES),
  })
  // As parcelas só são cobradas quando existe preço parcelado. O bloco inteiro é opcional, e
  // exigir "2 a 99" de quem deixou tudo em branco transformaria a opção numa obrigação.
  .superRefine((values, ctx) => {
    if (values.financedTotal > 0 && !isInstallmentCount(values.installments)) {
      ctx.addIssue({ code: 'custom', path: ['installments'], message: 'Parcelado vai de 2 a 99 vezes.' })
    }
  })

type FormValues = z.infer<typeof schema>

/** O par de preços vira o bloco `financed` do plano — ou some, quando não há pesquisa parcelada. */
function financedOf(values: Pick<FormValues, 'financedTotal' | 'installments'>) {
  return values.financedTotal > 0 && isInstallmentCount(values.installments) ? { total: values.financedTotal, installments: values.installments } : undefined
}

function toValues(plan: Plan | null): FormValues {
  return {
    label: plan?.label ?? '',
    cash: plan?.cash ?? 0,
    financedTotal: plan?.financed?.total ?? 0,
    installments: plan?.financed?.installments ?? 2,
    payment: plan?.payment ?? '',
    categoryId: plan?.categoryId ?? CATEGORY_ITEMS[0]?.value ?? 'compras',
    month: plan?.month ?? '',
    groupId: plan?.groupId ?? '',
    status: plan?.status ?? 'considering',
  }
}

function toPlan(values: FormValues): Omit<Plan, 'id'> {
  const financed = financedOf(values)
  return {
    label: values.label.trim(),
    cash: values.cash,
    financed,
    // Escolher parcelado e depois apagar o preço deixaria um estado que não se pode desenhar:
    // ele volta a ser "não decidido", não "à vista".
    payment: values.payment === 'financed' && !financed ? undefined : values.payment || undefined,
    categoryId: values.categoryId,
    month: values.month || undefined,
    groupId: values.groupId || undefined,
    status: values.status,
  }
}

/**
 * O formulário de um plano, com as DUAS formas de pagamento.
 *
 * Guardar os dois preços é o que transforma "acho que à vista compensa" num número: a loja
 * cobra R$ 3.000 à vista e R$ 3.400 em 10×, e a diferença de R$ 400 fica escrita em vez de
 * estimada. Os dois ficam guardados mesmo com só um escolhido — apagar o não escolhido jogaria
 * fora a pesquisa de preço já feita, e é ela que permite mudar de ideia depois.
 *
 * A ESCOLHA é o que a previsão usa. Trocar de à vista para parcelado no seletor recompõe os
 * meses: o mesmo plano deixa de pesar tudo num mês e passa a pesar um pouco em vários.
 *
 * Os campos do parcelamento estão SEMPRE na tela. Eram opcionais atrás de um botão, e o botão
 * cobrava um clique para responder a pergunta que se faz em toda compra grande — "quanto fica
 * parcelado?". Deixar em branco continua significando que a loja não parcela; a diferença é
 * que agora isso se diz não preenchendo, em vez de não abrindo.
 *
 * Existe um botão de confirmar, ao contrário do resto da tela: alternar situação ou apagar
 * grava na hora, mas COMPOR um objeto novo precisa de um momento em que ele fica pronto. Ele
 * vive no rodapé da gaveta, FORA do `<form>`, então submete pelo `formRef` (`forms.md` §4).
 */
export function PlanSheet({
  open,
  onOpenChange,
  groups,
  defaultMonth,
  monthsWithData,
  editing,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: PlanGroup[]
  defaultMonth: string
  monthsWithData: string[]
  editing: Plan | null
  onSubmit: (plan: Omit<Plan, 'id'>) => void
}) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editing ? 'Editar plano' : 'Novo plano'}</SheetTitle>
          <SheetDescription>Guarde os dois preços — à vista e parcelado. Forma de pagamento e mês são opcionais: sem mês, o plano fica de fora da previsão até você marcar um.</SheetDescription>
        </SheetHeader>

        {/* A chave REMONTA o formulário quando o alvo muda, e é o que dispensa um efeito de
            `reset`: o estado do react-hook-form nasce dos valores certos em vez de ser
            corrigido depois deles. */}
        <PlanForm
          key={editing?.id ?? 'novo'}
          formRef={formRef}
          groups={groups}
          defaultMonth={defaultMonth}
          monthsWithData={monthsWithData}
          editing={editing}
          onSubmit={(plan) => {
            onSubmit(plan)
            onOpenChange(false)
          }}
        />

        <SheetFooter>
          <Button onClick={() => formRef.current?.requestSubmit()}>{editing ? 'Salvar' : 'Adicionar'}</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function PlanForm({
  formRef,
  groups,
  defaultMonth,
  monthsWithData,
  editing,
  onSubmit,
}: {
  formRef: RefObject<HTMLFormElement | null>
  groups: PlanGroup[]
  defaultMonth: string
  monthsWithData: string[]
  editing: Plan | null
  onSubmit: (plan: Omit<Plan, 'id'>) => void
}) {
  const { control, register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toValues(editing),
  })

  const groupItems = [{ value: '', label: 'Sem grupo' }, ...groups.map((g) => ({ value: g.id, label: g.label }))]

  return (
    <form ref={formRef} onSubmit={handleSubmit((values) => onSubmit(toPlan(values)))} className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-2">
      <Field>
        <FieldLabel htmlFor="plano-rotulo">O que é</FieldLabel>
        <Input id="plano-rotulo" {...register('label')} placeholder="Monitor, passagem para o Chile…" />
        <FieldError errors={[formState.errors.label]} />
      </Field>

      <Controller
        control={control}
        name="cash"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel htmlFor="plano-avista">Preço à vista</FieldLabel>
            <MoneyInput id="plano-avista" value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} aria-invalid={!!fieldState.error} />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      <InstallmentBlock control={control} />

      <Controller control={control} name="payment" render={({ field }) => <PaymentField value={field.value} onChange={field.onChange} control={control} />} />

      <Controller
        control={control}
        name="categoryId"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel htmlFor="plano-categoria">Categoria</FieldLabel>
            <AppCombobox id="plano-categoria" aria-label="Categoria" value={field.value} onValueChange={field.onChange} items={CATEGORY_ITEMS} />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      <Controller control={control} name="month" render={({ field }) => <MonthField value={field.value} onChange={field.onChange} defaultMonth={defaultMonth} monthsWithData={monthsWithData} />} />

      <Controller
        control={control}
        name="groupId"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor="plano-grupo">Grupo</FieldLabel>
            <AppCombobox id="plano-grupo" aria-label="Grupo" value={field.value} onValueChange={field.onChange} items={groupItems} emptyValue="" />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="status"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor="plano-status">Situação</FieldLabel>
            <AppCombobox id="plano-status" aria-label="Situação" value={field.value} onValueChange={field.onChange} items={STATUS_ITEMS} />
          </Field>
        )}
      />
    </form>
  )
}

/**
 * O par de campos do parcelamento, mais a leitura do que eles produzem.
 *
 * É componente próprio porque só ele acompanha os três valores que compõem a dica — e assim
 * digitar o preço parcelado não re-renderiza o formulário inteiro.
 */
function InstallmentBlock({ control }: { control: Control<FormValues> }) {
  const [cash, financedTotal, installments] = useWatch({ control, name: ['cash', 'financedTotal', 'installments'] })
  const financed = financedOf({ financedTotal, installments })
  const saving = financed ? financed.total - cash : null

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <span className="text-xs font-medium">Parcelado</span>
      <div className="grid grid-cols-2 gap-3">
        <Controller
          control={control}
          name="financedTotal"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor="plano-total">Preço total</FieldLabel>
              <MoneyInput id="plano-total" value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} aria-invalid={!!fieldState.error} />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="installments"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor="plano-parcelas">Parcelas</FieldLabel>
              <Input
                id="plano-parcelas"
                type="number"
                min={2}
                max={99}
                step={1}
                value={field.value || ''}
                onChange={(e) => field.onChange(Number(e.target.value))}
                onBlur={field.onBlur}
                aria-invalid={!!fieldState.error}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {financed ? (
          <>
            {financed.installments}× de {formatBRL(financed.total / financed.installments)}
            {saving !== null && saving > 0 && <span className="ml-2 text-[var(--status-good-text)]">à vista economiza {formatBRL(saving)}</span>}
            {saving !== null && saving < 0 && <span className="ml-2 text-[var(--status-critical)]">parcelado sai {formatBRL(-saving)} mais barato</span>}
          </>
        ) : (
          'Deixe em branco se a loja não parcela.'
        )}
      </p>
    </div>
  )
}

/**
 * O seletor da forma de pagamento, que pode ficar SEM escolha.
 *
 * "Ainda não decidi" é um estado legítimo e diferente de "à vista": um plano recém-anotado não
 * tomou essa decisão, e deixar o botão de à vista aceso afirmaria por ele. Clicar na opção já
 * escolhida a desliga — é assim que se volta atrás.
 *
 * Ele só oferece "parcelado" quando existe preço parcelado: uma escolha que o app não
 * conseguiria desenhar não deve ser oferecível. E quando o preço é apagado depois da escolha,
 * o seletor volta a não ter nenhuma — a mesma correção que `toPlan` aplica ao gravar.
 */
function PaymentField({ value, onChange, control }: { value: PaymentMode | ''; onChange: (next: PaymentMode | '') => void; control: Control<FormValues> }) {
  const [financedTotal, installments] = useWatch({ control, name: ['financedTotal', 'installments'] })
  const hasFinanced = financedOf({ financedTotal, installments }) !== undefined
  const shown = value === 'financed' && !hasFinanced ? '' : value

  return (
    <Field>
      <FieldLabel>Como vou pagar</FieldLabel>
      <ToggleGroup
        aria-label="Como vou pagar"
        variant="outline"
        value={shown === '' ? [] : [shown]}
        onValueChange={(next) => {
          const picked = next[0]
          if (picked === undefined) onChange('')
          else if (picked === 'cash' || (picked === 'financed' && hasFinanced)) onChange(picked)
        }}
      >
        {paymentModes.map((mode) => (
          <ToggleGroupItem key={mode.value} value={mode.value} disabled={mode.value === 'financed' && !hasFinanced} className="flex-1">
            {mode.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <FieldDescription>{shown === '' ? 'Opcional. Sem escolha, a previsão usa o preço à vista.' : 'Clique de novo para desmarcar.'}</FieldDescription>
    </Field>
  )
}

/**
 * O mês da compra, que pode não existir.
 *
 * Sem mês o plano é um DESEJO: ele fica na lista, soma nos totais e não entra na previsão,
 * porque não há mês em que pese. Por isso a ausência é o estado inicial e precisa ser
 * reversível nos dois sentidos — daí o par definir/limpar, o mesmo idioma do período de um
 * grupo.
 */
function MonthField({ value, onChange, defaultMonth, monthsWithData }: { value: string; onChange: (next: string) => void; defaultMonth: string; monthsWithData: string[] }) {
  if (value === '') {
    return (
      <Field>
        <FieldLabel>Mês da compra</FieldLabel>
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange(defaultMonth)}>
          Definir mês
        </Button>
        <FieldDescription>Opcional. Sem mês, o plano fica fora da previsão.</FieldDescription>
      </Field>
    )
  }

  return (
    <Field>
      <FieldLabel htmlFor="plano-mes">Mês da compra</FieldLabel>
      <ButtonGroup>
        <MonthPicker id="plano-mes" value={value} onValueChange={onChange} withData={monthsWithData} aria-label="Mês da compra" />
        <Button type="button" variant="outline" size="icon" aria-label="Limpar o mês da compra" onClick={() => onChange('')}>
          <X />
        </Button>
      </ButtonGroup>
    </Field>
  )
}
