import { useState } from 'react'
import { AppSelect } from '@/components/ui/app-select'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MonthPicker } from '@/components/ui/month-picker'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CATEGORIES } from '@/data/categories'
import { paymentModes, planStatuses, type Plan } from '@/data/types'
import { formatBRL } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PlanGroup } from '@/data/types'

const CATEGORY_ITEMS = CATEGORIES.filter((c) => c.kind === 'expense').map((c) => ({ value: c.id, label: c.label }))
const STATUS_ITEMS = planStatuses.map((s) => ({ value: s.value, label: s.label }))

function blank(month: string): Omit<Plan, 'id'> {
  return { label: '', categoryId: CATEGORY_ITEMS[0]?.value ?? 'compras', cash: 0, payment: 'cash', status: 'considering', month }
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
 * grava na hora, mas COMPOR um objeto novo precisa de um momento em que ele fica pronto.
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
  // Os campos do parcelamento vivem em estado CRU, separados do plano.
  //
  // Eles estão sempre na tela, e `financed` é DERIVADO deles — some quando não há preço ou
  // quando as vezes não fazem sentido. Guardá-los dentro do plano faria o campo se apagar
  // sozinho no meio da digitação: zerar o total anularia `financed`, e com ele o número de
  // parcelas que a pessoa acabou de escolher.
  const [raw, setRaw] = useState(() => editing?.financed ?? { total: 0, installments: 2 })
  const [key, setKey] = useState(editing?.id ?? 'novo')

  // Estado derivado por render, não por efeito — o padrão que a regra de componentes exige.
  const target = editing?.id ?? 'novo'
  if (target !== key) {
    setKey(target)
    setDraft(editing ?? blank(defaultMonth))
    setRaw(editing?.financed ?? { total: 0, installments: 2 })
  }

  const financed = raw.total > 0 && Number.isInteger(raw.installments) && raw.installments > 1 && raw.installments <= 99 ? raw : undefined
  // Escolher parcelado e depois apagar o preço deixaria um estado que não se pode desenhar.
  const payment = draft.payment === 'financed' && !financed ? 'cash' : draft.payment
  const saving = financed ? financed.total - draft.cash : null
  const valid = draft.label.trim() !== '' && draft.cash > 0
  const groupItems = [{ value: '', label: 'Sem grupo' }, ...groups.map((g) => ({ value: g.id, label: g.label }))]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editing ? 'Editar plano' : 'Novo plano'}</SheetTitle>
          <SheetDescription>Guarde os dois preços — à vista e parcelado — e escolha qual vale. Só a forma escolhida entra na previsão.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-2">
          <Field>
            <FieldLabel htmlFor="plano-rotulo">O que é</FieldLabel>
            <Input id="plano-rotulo" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Monitor, passagem para o Chile…" />
          </Field>

          <Field>
            <FieldLabel htmlFor="plano-avista">Preço à vista</FieldLabel>
            <Input id="plano-avista" type="number" min={0} step="0.01" value={draft.cash || ''} onChange={(e) => setDraft({ ...draft, cash: Number(e.target.value) })} placeholder="0,00" />
          </Field>

          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <span className="text-xs font-medium">Parcelado</span>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="plano-total">Preço total</FieldLabel>
                <Input id="plano-total" type="number" min={0} step="0.01" value={raw.total || ''} onChange={(e) => setRaw({ ...raw, total: Number(e.target.value) })} placeholder="0,00" />
              </Field>
              <Field>
                <FieldLabel htmlFor="plano-parcelas">Parcelas</FieldLabel>
                <Input id="plano-parcelas" type="number" min={2} max={99} step={1} value={raw.installments} onChange={(e) => setRaw({ ...raw, installments: Number(e.target.value) })} />
              </Field>
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

          <Field>
            <FieldLabel>Como vou pagar</FieldLabel>
            {/* O seletor só oferece parcelado quando existe preço parcelado: uma escolha que o
                app não conseguiria desenhar não deve ser oferecível. */}
            <ToggleGroup
              value={[payment]}
              onValueChange={(next) => {
                const picked = next[0]
                if (picked === 'cash' || (picked === 'financed' && financed)) setDraft({ ...draft, payment: picked })
              }}
            >
              {paymentModes.map((mode) => (
                <ToggleGroupItem key={mode.value} value={mode.value} disabled={mode.value === 'financed' && !financed} className={cn('flex-1')}>
                  {mode.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>

          <Field>
            <FieldLabel htmlFor="plano-categoria">Categoria</FieldLabel>
            <AppSelect id="plano-categoria" value={draft.categoryId} onValueChange={(v) => setDraft({ ...draft, categoryId: v })} items={CATEGORY_ITEMS} />
          </Field>

          <Field>
            <FieldLabel htmlFor="plano-mes">Mês da compra</FieldLabel>
            <MonthPicker value={draft.month} onValueChange={(v) => setDraft({ ...draft, month: v })} withData={monthsWithData} aria-label="Mês da compra" />
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
              onSubmit({ ...draft, label: draft.label.trim(), financed, payment })
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
