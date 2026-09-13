import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, type RefObject } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { AppCombobox } from '@wlet/ui/components/app-combobox'
import { Button } from '@wlet/ui/components/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@wlet/ui/components/field'
import { Input } from '@wlet/ui/components/input'
import { MoneyInput } from '@wlet/ui/components/money-input'
import { MonthPicker } from '@wlet/ui/components/month-picker'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@wlet/ui/components/sheet'
import { ToggleGroup, ToggleGroupItem } from '@wlet/ui/components/toggle-group'
import { CATEGORIES } from '@wlet/domain'
import { entityKinds, plannedRecurrences, type PlannedEntry } from '@wlet/domain'
import { DueOnField } from '@/components/due-on-field'
import { ENTRY_FLOWS, plannedFormSchema as schema, type PlannedFormValues as FormValues } from './planned-sheet-schema'

const CATEGORY_ITEMS = CATEGORIES.map((c) => ({ value: c.id, label: c.label, description: c.description }))

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
