import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AppSelect } from '@/components/ui/app-select'
import { MonthPicker } from '@/components/ui/month-picker'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { CATEGORIES } from '@/data/categories'
import { planStatuses, type Plan, type PlanGroup } from '@/data/types'
import { formatBRL } from '@/lib/format'

const CATEGORY_ITEMS = CATEGORIES.filter((c) => c.kind === 'expense').map((c) => ({ value: c.id, label: c.label }))
const STATUS_ITEMS = planStatuses.map((s) => ({ value: s.value, label: s.label }))

/** Um plano em branco, com o mês corrente já preenchido — o caso mais comum. */
function blank(month: string): Omit<Plan, 'id'> {
  return { label: '', categoryId: CATEGORY_ITEMS[0]?.value ?? 'compras', amount: 0, status: 'considering', month }
}

/**
 * O formulário de um plano.
 *
 * Ao contrário do resto da tela, aqui existe um botão de confirmar — não por precaução, mas
 * porque um plano só é um plano depois de ter rótulo, valor e mês. Alternar status ou apagar
 * grava na hora; COMPOR um objeto novo precisa de um momento em que ele fica pronto.
 *
 * O parcelamento aceita 1 como "à vista" e o campo mostra o valor da parcela ao lado: sem
 * isso a pessoa digita o total e vê um impacto mensal que não esperava.
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
  const [draft, setDraft] = useState<Omit<Plan, 'id'>>(() => editing ?? blank(defaultMonth))
  const [key, setKey] = useState(editing?.id ?? 'novo')

  // Troca de alvo (abrir para outro item) recarrega o rascunho. Estado derivado por render,
  // não por efeito — é o padrão que a regra de componentes exige.
  const target = editing?.id ?? 'novo'
  if (target !== key) {
    setKey(target)
    setDraft(editing ?? blank(defaultMonth))
  }

  const parcels = draft.installments ?? 1
  const valid = draft.label.trim() !== '' && draft.amount > 0

  const groupItems = [{ value: '', label: 'Sem grupo' }, ...groups.map((g) => ({ value: g.id, label: g.label }))]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editing ? 'Editar plano' : 'Novo plano'}</SheetTitle>
          <SheetDescription>Uma intenção de compra. Ela só entra na previsão quando você marcar como decidida.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-2">
          <Field>
            <FieldLabel htmlFor="plano-rotulo">O que é</FieldLabel>
            <Input id="plano-rotulo" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Notebook, passagem para o Chile…" />
          </Field>

          <Field>
            <FieldLabel htmlFor="plano-valor">Valor total</FieldLabel>
            <Input id="plano-valor" type="number" min={0} step="0.01" value={draft.amount || ''} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} placeholder="0,00" />
          </Field>

          <Field>
            <FieldLabel htmlFor="plano-parcelas">Parcelas</FieldLabel>
            <div className="flex items-center gap-3">
              <Input
                id="plano-parcelas"
                type="number"
                min={1}
                max={99}
                step={1}
                className="w-24"
                value={parcels}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  setDraft({ ...draft, installments: Number.isInteger(n) && n > 1 && n <= 99 ? n : undefined })
                }}
              />
              <span className="text-xs text-muted-foreground">{parcels > 1 ? `${parcels}× de ${formatBRL(draft.amount / parcels)}` : 'à vista'}</span>
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="plano-categoria">Categoria</FieldLabel>
            <AppSelect id="plano-categoria" value={draft.categoryId} onValueChange={(v) => setDraft({ ...draft, categoryId: v })} items={CATEGORY_ITEMS} />
          </Field>

          <Field>
            <FieldLabel htmlFor="plano-mes">Quando</FieldLabel>
            <MonthPicker value={draft.month} onValueChange={(v) => setDraft({ ...draft, month: v })} withData={monthsWithData} aria-label="Mês do plano" />
          </Field>

          <Field>
            <FieldLabel htmlFor="plano-grupo">Grupo</FieldLabel>
            <AppSelect id="plano-grupo" value={draft.groupId ?? ''} onValueChange={(v) => setDraft({ ...draft, groupId: v || undefined })} items={groupItems} />
          </Field>

          <Field>
            <FieldLabel htmlFor="plano-status">Situação</FieldLabel>
            <AppSelect id="plano-status" value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as Plan['status'] })} items={STATUS_ITEMS} />
          </Field>
        </div>

        <SheetFooter>
          <Button
            disabled={!valid}
            onClick={() => {
              onSubmit({ ...draft, label: draft.label.trim() })
              onOpenChange(false)
            }}
          >
            {editing ? 'Salvar' : 'Adicionar'}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
