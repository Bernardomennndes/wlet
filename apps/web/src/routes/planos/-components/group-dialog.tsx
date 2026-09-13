import { useRef, type RefObject } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch, type Control } from 'react-hook-form'
import { Button } from '@wlet/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@wlet/ui/components/dialog'
import { Field, FieldError, FieldLabel } from '@wlet/ui/components/field'
import { Input } from '@wlet/ui/components/input'
import { MonthPicker } from '@wlet/ui/components/month-picker'
import { Textarea } from '@wlet/ui/components/textarea'
import type { PlanGroup } from '@wlet/domain'
import { groupFormSchema as schema, type GroupFormValues as FormValues } from './group-dialog-schema'

/** O tipo de `control` depois do `.transform()`: entrada, contexto e saída, nessa ordem. */
type GroupFormControl = Control<FormValues, unknown, Omit<PlanGroup, 'id'>>

const EMPTY: FormValues = { label: '', from: null, to: null, note: '' }

/**
 * O formulário de um grupo — uma viagem, uma reforma, um setup.
 *
 * É `Dialog` e não `Sheet` porque são três campos e nenhum deles é longo: a gaveta existe
 * para formulário que precisa de altura, como o de um plano, e abrir a lateral inteira para
 * pedir um nome é desproporcional.
 *
 * A JANELA é opcional e fica atrás de um interruptor de propósito. Ela é RÓTULO, não regra:
 * quem decide em que mês cada custo cai é o próprio plano, e um grupo que distribuísse os
 * itens sozinho teria de inventar a proporção entre passagem, diária e alimentação. Pedi-la
 * sempre sugeriria que ela faz alguma coisa.
 */
export function GroupDialog({
  open,
  onOpenChange,
  defaultMonth,
  monthsWithData,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultMonth: string
  monthsWithData: string[]
  onSubmit: (group: Omit<PlanGroup, 'id'>) => void
}) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo grupo</DialogTitle>
          <DialogDescription>Reúne os custos de uma mesma coisa — uma viagem, uma reforma, um setup — e mostra o total deles junto.</DialogDescription>
        </DialogHeader>

        {/* Cada abertura monta um formulário novo: é o que devolve os campos em branco sem
            um efeito de `reset` observando o `open`. */}
        <GroupForm
          key={String(open)}
          formRef={formRef}
          defaultMonth={defaultMonth}
          monthsWithData={monthsWithData}
          onSubmit={(group) => {
            onSubmit(group)
            onOpenChange(false)
          }}
        />

        <DialogFooter>
          <Button onClick={() => formRef.current?.requestSubmit()}>Adicionar</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GroupForm({
  formRef,
  defaultMonth,
  monthsWithData,
  onSubmit,
}: {
  formRef: RefObject<HTMLFormElement | null>
  defaultMonth: string
  monthsWithData: string[]
  onSubmit: (group: Omit<PlanGroup, 'id'>) => void
}) {
  // Os três parâmetros são entrada, contexto e SAÍDA: o `handleSubmit` entrega o que o
  // `.transform()` produziu, que já é o grupo.
  const { control, register, handleSubmit, setValue, formState } = useForm<FormValues, unknown, Omit<PlanGroup, 'id'>>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  })

  return (
    <form ref={formRef} onSubmit={handleSubmit((group) => onSubmit(group))} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="grupo-nome">Nome</FieldLabel>
        <Input id="grupo-nome" {...register('label')} placeholder="Viagem ao Chile, setup do escritório…" autoFocus />
        <FieldError errors={[formState.errors.label]} />
      </Field>

      <PeriodField
        control={control}
        defaultMonth={defaultMonth}
        monthsWithData={monthsWithData}
        onDefine={() => {
          setValue('from', defaultMonth)
          setValue('to', defaultMonth)
        }}
      />

      <Field>
        <FieldLabel htmlFor="grupo-nota">Observação</FieldLabel>
        <Textarea id="grupo-nota" {...register('note')} rows={2} placeholder="Opcional" />
        <FieldError errors={[formState.errors.note]} />
      </Field>
    </form>
  )
}

/**
 * A janela do grupo: um botão enquanto não existe, dois seletores depois de definida.
 *
 * Quem decide qual das duas caras aparecer é o próprio VALOR — `from` vazio significa "sem
 * janela" —, então não há um segundo estado dizendo se o bloco está aberto. Dois estados para
 * a mesma pergunta divergiriam no primeiro ajuste.
 */
function PeriodField({ control, monthsWithData, onDefine }: { control: GroupFormControl; defaultMonth: string; monthsWithData: string[]; onDefine: () => void }) {
  const from = useWatch({ control, name: 'from' })

  if (!from) {
    return (
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={onDefine}>
        Definir período
      </Button>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <Controller
        control={control}
        name="from"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel htmlFor="grupo-de">De</FieldLabel>
            <MonthPicker id="grupo-de" value={field.value ?? ''} onValueChange={field.onChange} withData={monthsWithData} aria-label="Início do grupo" />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="to"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel htmlFor="grupo-ate">Até</FieldLabel>
            <MonthPicker id="grupo-ate" value={field.value ?? ''} onValueChange={field.onChange} withData={monthsWithData} aria-label="Fim do grupo" />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </div>
  )
}
