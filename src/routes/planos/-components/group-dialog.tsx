import { useRef, type RefObject } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch, type Control } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MonthPicker } from '@/components/ui/month-picker'
import { Textarea } from '@/components/ui/textarea'
import type { PlanGroup } from '@/data/types'

const MONTH = /^\d{4}-\d{2}$/

const schema = z
  .object({
    label: z.string().trim().min(1, 'Dê um nome ao grupo.'),
    // A janela é opcional, e a ausência dela se escreve como string vazia — não como um mês
    // qualquer que depois seria confundido com uma escolha.
    from: z.string(),
    to: z.string(),
    note: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.from === '') return
    if (!MONTH.test(values.from) || !MONTH.test(values.to)) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'Escolha os dois meses da janela.' })
      return
    }
    if (values.to < values.from) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'O fim da janela não pode ser antes do início.' })
    }
  })

type FormValues = z.infer<typeof schema>

const EMPTY: FormValues = { label: '', from: '', to: '', note: '' }

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
  const { control, register, handleSubmit, setValue, formState } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY })

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit((values) =>
        onSubmit({
          label: values.label.trim(),
          from: values.from || undefined,
          to: values.to || undefined,
          note: values.note.trim() || undefined,
        }),
      )}
      className="flex flex-col gap-4"
    >
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
function PeriodField({ control, monthsWithData, onDefine }: { control: Control<FormValues>; defaultMonth: string; monthsWithData: string[]; onDefine: () => void }) {
  const from = useWatch({ control, name: 'from' })

  if (from === '') {
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
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor="grupo-de">De</FieldLabel>
            <MonthPicker id="grupo-de" value={field.value} onValueChange={field.onChange} withData={monthsWithData} aria-label="Início do grupo" />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="to"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel htmlFor="grupo-ate">Até</FieldLabel>
            <MonthPicker id="grupo-ate" value={field.value} onValueChange={field.onChange} withData={monthsWithData} aria-label="Fim do grupo" />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </div>
  )
}
