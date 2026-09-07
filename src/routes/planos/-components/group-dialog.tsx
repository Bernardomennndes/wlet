import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MonthPicker } from '@/components/ui/month-picker'
import { Textarea } from '@/components/ui/textarea'
import type { PlanGroup } from '@/data/types'

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
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null)

  const reset = () => {
    setLabel('')
    setNote('')
    setPeriod(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo grupo</DialogTitle>
          <DialogDescription>Reúne os custos de uma mesma coisa — uma viagem, uma reforma, um setup — e mostra o total deles junto.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="grupo-nome">Nome</FieldLabel>
            <Input id="grupo-nome" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Viagem ao Chile, setup do escritório…" autoFocus />
          </Field>

          {period ? (
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="grupo-de">De</FieldLabel>
                <MonthPicker value={period.from} onValueChange={(v) => setPeriod({ ...period, from: v })} withData={monthsWithData} aria-label="Início do grupo" />
              </Field>
              <Field>
                <FieldLabel htmlFor="grupo-ate">Até</FieldLabel>
                <MonthPicker value={period.to} onValueChange={(v) => setPeriod({ ...period, to: v })} withData={monthsWithData} aria-label="Fim do grupo" />
              </Field>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="self-start" onClick={() => setPeriod({ from: defaultMonth, to: defaultMonth })}>
              Definir período
            </Button>
          )}

          <Field>
            <FieldLabel htmlFor="grupo-nota">Observação</FieldLabel>
            <Textarea id="grupo-nota" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Opcional" />
          </Field>
        </div>

        <DialogFooter>
          <Button
            disabled={label.trim() === ''}
            onClick={() => {
              onSubmit({ label: label.trim(), from: period?.from, to: period?.to, note: note.trim() || undefined })
              reset()
              onOpenChange(false)
            }}
          >
            Adicionar
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
          >
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
