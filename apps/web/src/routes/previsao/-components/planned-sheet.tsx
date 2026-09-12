import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, type RefObject } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { AppCombobox } from '@wlet/ui/components/app-combobox'
import { Button } from '@wlet/ui/components/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@wlet/ui/components/field'
import { Input } from '@wlet/ui/components/input'
import { MoneyInput } from '@wlet/ui/components/money-input'
import { MonthPicker } from '@wlet/ui/components/month-picker'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@wlet/ui/components/sheet'
import { ToggleGroup, ToggleGroupItem } from '@wlet/ui/components/toggle-group'
import { CATEGORIES } from '@wlet/domain'
import { entityKinds, flowKinds, plannedRecurrences, type Entity, type PlannedEntry, type Recurrence } from '@wlet/domain'
import { DueOnField, MAX_BUSINESS_DAY_OF_MONTH, MAX_DAY_OF_MONTH } from '@/components/due-on-field'

const CATEGORY_ITEMS = CATEGORIES.map((c) => ({ value: c.id, label: c.label, description: c.description }))

// Os valores do schema saem das listas de enum do domínio, nunca de um `z.enum` redigitado:
// uma recorrência nova em `plannedRecurrences` tem de ser erro de compilação aqui, não uma
// opção que o formulário aceita e a leitura rejeita.
/**
 * Um lançamento previsto só é entrada ou saída — as outras duas faces de `Flow` (transferência
 * e reembolso) descrevem o que JÁ aconteceu no extrato, e não há como declará-las de antemão.
 * A lista sai de `flowKinds` filtrada, e não de rótulos redigitados aqui: é a §1 da
 * `enum-display`, e é o que o próprio `PlannedEntry.kind` já documenta ("subconjunto de `Flow`,
 * sem lista própria").
 */
const ENTRY_FLOWS = flowKinds.filter((f) => f.value === 'income' || f.value === 'expense')

const RECURRENCE_VALUES = plannedRecurrences.map((r) => r.value) as [Recurrence, ...Recurrence[]]
const ENTITY_VALUES = entityKinds.map((e) => e.value) as [Entity, ...Entity[]]

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

const schema = z
  .object({
    label: z.string().trim().min(1, 'Dê um nome ao lançamento.'),
    amount: z.number().positive('Informe o valor.'),
    kind: z.enum(['income', 'expense']),
    categoryId: z.string().min(1, 'Escolha uma categoria.'),
    entity: z.enum(ENTITY_VALUES),
    recurrence: z.enum(RECURRENCE_VALUES),
    startMonth: z.string().regex(MONTH, 'Escolha o mês inicial.'),
    count: z.number(),
    // Vazio quer dizer "sem prazo", que é diferente de um mês escolhido — a mesma distinção
    // que o plano sem mês faz.
    endMonth: z.union([z.string().regex(MONTH), z.literal('')]),
    /**
     * O credor, e é ELE que separa as duas naturezas de uma declaração: com nome preenchido a
     * regra vira CONTA A PAGAR e ganha situação em Pagamentos; sem nome, ela só projeta. Por
     * isso ele é opcional e não tem valor padrão — preencher por quem não preencheu
     * transformaria toda projeção numa cobrança que ninguém combinou.
     */
    merchants: z.string(),
    /**
     * O dia é um objeto de duas formas, e entra no formulário como qualquer outro campo.
     *
     * Ele vivia num `useRef` lido durante o render, o que o lint acusou com razão: um valor
     * assim não faz o campo re-renderizar, então escolher "5º dia útil" não redesenhava nada
     * até outra coisa mudar. `undefined` é estado legítimo — regra sem dia não entra no mês em
     * curso, porque não há como saber se ela já aconteceu.
     */
    dueOn: z
      .union([
        z.object({ kind: z.literal('day'), day: z.number().int().min(1).max(MAX_DAY_OF_MONTH) }),
        z.object({ kind: z.literal('business-day'), nth: z.number().int().min(1).max(MAX_BUSINESS_DAY_OF_MONTH) }),
      ])
      .optional(),
  })
  // Parcelada sem contagem não tem fim, e a janela dela iria ao infinito na projeção — é a
  // mesma recusa que `assertPlanned` faz no serviço, dita aqui antes de chegar lá.
  .superRefine((values, ctx) => {
    if (values.recurrence === 'installments' && !(Number.isInteger(values.count) && values.count > 0)) {
      ctx.addIssue({ code: 'custom', path: ['count'], message: 'Uma regra parcelada precisa do número de parcelas.' })
    }
  })
  /**
   * A SAÍDA do schema É o payload — e é por isso que a conversão mora aqui, não no `handleSubmit`.
   *
   * Ela vivia lá dentro: o credor virava lista, `count` e `endMonth` sumiam por ramo, `match`
   * nascia condicional. O efeito era que `z.output` descrevia uma forma e o objeto que de fato
   * saía era outra, montada à mão — nenhum `safeParse` conseguia provar o que a tela produz, e
   * o `tsc` não tinha o que comparar. Com o `.transform()`, o schema volta a ser a função
   * inteira (entra digitação, sai o lançamento), e a anotação de retorno faz o compilador ser o
   * juiz: mudar `PlannedEntry` quebra AQUI, na hora.
   *
   * `exceptions` NÃO entra: não há campo para ela na gaveta, e um payload que carrega dado que
   * nenhuma tecla produziu é adaptador disfarçado. Quem edita é que a preserva, do mesmo jeito
   * que já preserva o `id` — ver `submitEntry` em `previsao/-content.tsx`.
   */
  .transform((values): Omit<PlannedEntry, 'id'> => {
    const merchants = values.merchants
      .split(',')
      .map((m) => m.trim().toUpperCase())
      .filter(Boolean)
    return {
      label: values.label,
      amount: values.amount,
      kind: values.kind,
      categoryId: values.categoryId,
      entity: values.entity,
      recurrence: values.recurrence,
      startMonth: values.startMonth,
      // Os três abaixo SOMEM quando não se aplicam, em vez de irem como zero ou vazio:
      // `count` só existe em parcelada, `endMonth` só em mensal com prazo, e `match` só
      // quando há credor — e é a ausência dele que mantém a regra como mera projeção.
      count: values.recurrence === 'installments' ? values.count : undefined,
      endMonth: values.recurrence === 'monthly' && values.endMonth ? values.endMonth : undefined,
      dueOn: values.dueOn,
      match: merchants.length ? { merchants } : undefined,
    }
  })

/** O que os CAMPOS coletam. A saída é outra coisa — é `Omit<PlannedEntry, 'id'>`, acima. */
type FormValues = z.input<typeof schema>

/**
 * A gaveta que COMPÕE um lançamento previsto.
 *
 * Existe um botão de confirmar, ao contrário da linha da lista: apagar grava na hora, mas
 * compor um objeto novo precisa de um momento em que ele fica pronto. Ele vive no rodapé,
 * FORA do `<form>`, então submete pelo `formRef` — é a §4 da `forms.md`.
 *
 * São nove campos, e por isso é gaveta e não edição em linha: a `forms.md` §1 exige
 * `react-hook-form` + `zodResolver` de qualquer coleta que alimente uma escrita, e nove
 * campos numa linha de lista não se leem.
 */
export function PlannedSheet({
  open,
  onOpenChange,
  editing,
  defaultMonth,
  minMonth,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: PlannedEntry | null
  defaultMonth: string
  minMonth: string
  onSubmit: (entry: Omit<PlannedEntry, 'id'>) => void
}) {
  const formRef = useRef<HTMLFormElement>(null)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editing ? 'Editar lançamento previsto' : 'Novo lançamento previsto'}</SheetTitle>
          <SheetDescription>Com credor preenchido, vira conta a pagar e ganha situação em Pagamentos. Sem credor, só projeta — que é o certo para gasto sem cobrador único.</SheetDescription>
        </SheetHeader>

        {/* A chave REMONTA o formulário quando o alvo muda, e é o que dispensa um efeito de
            `reset`: o estado do react-hook-form nasce dos valores certos em vez de ser
            corrigido depois deles. */}
        <PlannedForm
          key={editing?.id ?? 'novo'}
          formRef={formRef}
          editing={editing}
          defaultMonth={defaultMonth}
          minMonth={minMonth}
          onSubmit={(entry) => {
            onSubmit(entry)
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

function PlannedForm({
  formRef,
  editing,
  defaultMonth,
  minMonth,
  onSubmit,
}: {
  formRef: RefObject<HTMLFormElement | null>
  editing: PlannedEntry | null
  defaultMonth: string
  minMonth: string
  onSubmit: (entry: Omit<PlannedEntry, 'id'>) => void
}) {
  // Três parâmetros porque a entrada e a saída do schema deixaram de ser a mesma coisa: os
  // campos coletam `FormValues`, o `handleSubmit` entrega o lançamento já montado.
  const form = useForm<FormValues, unknown, Omit<PlannedEntry, 'id'>>({
    resolver: zodResolver(schema),
    defaultValues: {
      label: editing?.label ?? '',
      amount: editing?.amount ?? 0,
      kind: editing?.kind ?? 'expense',
      categoryId: editing?.categoryId ?? '',
      entity: editing?.entity ?? 'PF',
      recurrence: editing?.recurrence ?? 'monthly',
      startMonth: editing?.startMonth ?? defaultMonth,
      count: editing?.count ?? 0,
      endMonth: editing?.endMonth ?? '',
      merchants: editing?.match?.merchants.join(', ') ?? '',
      dueOn: editing?.dueOn,
    },
  })
  const recurrence = useWatch({ control: form.control, name: 'recurrence' })

  return (
    <form
      ref={formRef}
      className="flex-1 space-y-4 overflow-y-auto px-4 py-2"
      // Passagem DIRETA, sem lambda que "arruma um campinho": é ela que faz o `tsc` conferir
      // de graça que a saída do schema serve quem consome o formulário.
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Field>
        <FieldLabel htmlFor="planned-label">Nome</FieldLabel>
        <Input id="planned-label" placeholder="Aluguel" {...form.register('label')} />
        <FieldError errors={[form.formState.errors.label]} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="planned-amount">Valor</FieldLabel>
          <Controller control={form.control} name="amount" render={({ field }) => <MoneyInput id="planned-amount" value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} />} />
          <FieldError errors={[form.formState.errors.amount]} />
        </Field>
        <Field>
          <FieldLabel>Fluxo</FieldLabel>
          <Controller
            control={form.control}
            name="kind"
            render={({ field }) => (
              <ToggleGroup variant="outline" value={[field.value]} onValueChange={(next) => next[0] && field.onChange(next[0])}>
                {ENTRY_FLOWS.map((flow) => (
                  <ToggleGroupItem key={flow.value} value={flow.value}>
                    {flow.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          />
          <FieldError errors={[form.formState.errors.kind]} />
        </Field>
      </div>

      <Field>
        <FieldLabel>Categoria</FieldLabel>
        <Controller
          control={form.control}
          name="categoryId"
          render={({ field }) => <AppCombobox items={CATEGORY_ITEMS} value={field.value} onValueChange={field.onChange} aria-label="Categoria do lançamento" className="w-full" />}
        />
        <FieldError errors={[form.formState.errors.categoryId]} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel>Recorte</FieldLabel>
          <Controller
            control={form.control}
            name="entity"
            render={({ field }) => (
              <ToggleGroup variant="outline" value={[field.value]} onValueChange={(next) => next[0] && field.onChange(next[0])}>
                {entityKinds.map((entity) => (
                  <ToggleGroupItem key={entity.value} value={entity.value}>
                    {entity.value}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          />
          <FieldError errors={[form.formState.errors.entity]} />
        </Field>
        <Field>
          <FieldLabel>Recorrência</FieldLabel>
          <Controller
            control={form.control}
            name="recurrence"
            render={({ field }) => (
              <AppCombobox items={plannedRecurrences.map((r) => ({ value: r.value, label: r.label }))} value={field.value} onValueChange={field.onChange} aria-label="Recorrência" className="w-full" />
            )}
          />
          <FieldError errors={[form.formState.errors.recurrence]} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel>Mês inicial</FieldLabel>
          <Controller
            control={form.control}
            name="startMonth"
            render={({ field }) => <MonthPicker value={field.value} onValueChange={field.onChange} min={minMonth} aria-label="Mês inicial" className="w-full" />}
          />
          <FieldError errors={[form.formState.errors.startMonth]} />
        </Field>
        {recurrence === 'installments' && (
          <Field>
            <FieldLabel htmlFor="planned-count">Parcelas</FieldLabel>
            <Input id="planned-count" type="number" min={1} {...form.register('count', { valueAsNumber: true })} />
            <FieldError errors={[form.formState.errors.count]} />
          </Field>
        )}
        {recurrence === 'monthly' && (
          <Field>
            <FieldLabel>Último mês</FieldLabel>
            <Controller
              control={form.control}
              name="endMonth"
              render={({ field }) => <MonthPicker value={field.value || form.getValues('startMonth')} onValueChange={field.onChange} min={minMonth} aria-label="Último mês" className="w-full" />}
            />
            <FieldDescription>Deixe no mês inicial para uma regra sem prazo.</FieldDescription>
            <FieldError errors={[form.formState.errors.endMonth]} />
          </Field>
        )}
      </div>

      <Field>
        <FieldLabel>Dia do vencimento</FieldLabel>
        <Controller
          control={form.control}
          name="dueOn"
          render={({ field }) => (
            <div className="flex flex-wrap items-end gap-3">
              <DueOnField value={field.value} onChange={field.onChange} disabled={false} label="Dia" />
            </div>
          )}
        />
        <FieldDescription>Sem dia declarado, a regra não entra no mês em curso — não há como saber se ela já aconteceu.</FieldDescription>
        <FieldError errors={[form.formState.errors.dueOn]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="planned-merchants">Credor (opcional)</FieldLabel>
        <Input id="planned-merchants" placeholder="NOME COMO APARECE NO BANCO" {...form.register('merchants')} />
        <FieldDescription>Separe por vírgula quando mais de um nome quita a mesma conta. Com credor, a regra ganha situação de pagamento.</FieldDescription>
        <FieldError errors={[form.formState.errors.merchants]} />
      </Field>
    </form>
  )
}
