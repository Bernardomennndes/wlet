import { zodResolver } from '@hookform/resolvers/zod'
import type { Plan } from '@wlet/domain'
import { monthOfDate, type PurchaseSuggestion } from '@wlet/domain/purchases'
import { formatBRL, formatMonthShort } from '@wlet/lib/format'
import { fold } from '@wlet/lib/search'
import { cn } from '@wlet/lib/utils'
import { Button } from '@wlet/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@wlet/ui/components/dialog'
import { FieldError } from '@wlet/ui/components/field'
import { Input } from '@wlet/ui/components/input'
import { type KeyboardEvent, type RefObject, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { type PurchaseLinkFormValues, purchaseLinkSchema } from './purchase-link-dialog-schema'

/** "2026-07-04" → "04/07/2026", sem `Date`: data-only formatada como data-hora mostra o dia anterior. */
const dayOf = (date: string) => date.split('-').reverse().join('/')

/**
 * As teclas do padrão ARIA APG de `radiogroup` (roving tabindex): setas movem a seleção entre
 * as opções HABILITADAS, com Home/End nas pontas. O registry não tem componente de radio-group
 * (é por isso que a lista abaixo é `<button role="radio">` de mão própria) — sem este handler o
 * grupo teria o papel ARIA sem o comportamento de teclado que ele promete, e quem navega por
 * leitor de tela esperando "Tab entra uma vez, setas escolhem" veria o Tab passar por cada linha.
 */
const RADIO_NAVIGATION_KEYS = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End']

/**
 * O diálogo que liga um plano a uma compra parcelada.
 *
 * Lista COMPRAS, não parcelas: uma linha por compra, com o que a pessoa precisa para reconhecê-la —
 * estabelecimento, data da compra, conta, parcela, total estimado e quantas já foram pagas. As parecidas
 * com o plano sobem com o selo "Sugerida"; nada é cortado, só ordenado.
 *
 * É `Dialog` e não `Sheet`: é uma escolha numa lista, não um formulário de vários campos. O botão de
 * confirmar mora no rodapé, fora do `<form>`, e submete pelo `formRef` (`forms.md` §4).
 */
export function PurchaseLinkDialog({
  plan,
  suggestions,
  accountName,
  onOpenChange,
  onSubmit,
}: {
  plan: Plan | null
  suggestions: PurchaseSuggestion[]
  accountName: (accountId: string) => string
  onOpenChange: (open: boolean) => void
  onSubmit: (suggestion: PurchaseSuggestion) => void
}) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <Dialog open={plan !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Vincular compra</DialogTitle>
          <DialogDescription>{plan ? `Escolha a compra parcelada que é "${plan.label}". As parecidas aparecem primeiro.` : null}</DialogDescription>
        </DialogHeader>

        {/* A chave remonta o formulário a cada plano: a escolha e a busca nascem vazias sem efeito de reset. */}
        {plan ? <PurchaseLinkForm key={plan.id} formRef={formRef} suggestions={suggestions} accountName={accountName} onSubmit={onSubmit} /> : null}

        <DialogFooter>
          <Button onClick={() => formRef.current?.requestSubmit()} disabled={suggestions.length === 0}>
            Vincular
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PurchaseLinkForm({
  formRef,
  suggestions,
  accountName,
  onSubmit,
}: {
  formRef: RefObject<HTMLFormElement | null>
  suggestions: PurchaseSuggestion[]
  accountName: (accountId: string) => string
  onSubmit: (suggestion: PurchaseSuggestion) => void
}) {
  const [query, setQuery] = useState('')
  const { control, handleSubmit, formState } = useForm<PurchaseLinkFormValues, unknown, { purchaseId: string }>({
    resolver: zodResolver(purchaseLinkSchema),
    defaultValues: { purchaseId: '' },
  })
  // Um botão por item VISÍVEL, indexado como `visible` — só para mover o foco dentro do handler
  // de teclado. Nunca lido durante o render (o lint do React Compiler acusaria).
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const idOf = (suggestion: PurchaseSuggestion) => suggestion.purchase.seen[0].id
  const needle = fold(query.trim())
  const visible = needle ? suggestions.filter((s) => fold(`${s.purchase.merchant} ${s.purchase.rawDescription}`).includes(needle)) : suggestions

  if (suggestions.length === 0) {
    return <p className="rounded-lg border px-3 py-6 text-center text-muted-foreground">Nenhuma compra parcelada nos arquivos. Importe as faturas em Meus dados.</p>
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      onSubmit={handleSubmit(({ purchaseId }) => {
        const chosen = suggestions.find((s) => idOf(s) === purchaseId)
        if (chosen) onSubmit(chosen)
      })}
    >
      <Input aria-label="Buscar compra pelo nome" placeholder="Buscar pelo nome…" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} />

      <Controller
        control={control}
        name="purchaseId"
        render={({ field }) => {
          // Só UM item entra no Tab: o escolhido, se estiver visível e habilitado; senão o
          // primeiro habilitado da lista filtrada. Os demais levam tabIndex={-1} — é o "roving
          // tabindex" do padrão ARIA APG, calculado aqui a partir de `field.value` e `visible`
          // (nunca de uma ref lida durante o render).
          const enabledIndexes = visible.reduce<number[]>((indexes, suggestion, index) => {
            if (suggestion.linkedTo === null) indexes.push(index)
            return indexes
          }, [])
          const checkedIndex = visible.findIndex((suggestion) => idOf(suggestion) === field.value)
          const tabStopIndex = checkedIndex !== -1 && visible[checkedIndex].linkedTo === null ? checkedIndex : (enabledIndexes[0] ?? -1)

          // Seta/Home/End escolhem o próximo item HABILITADO (com wrap) e movem o foco para ele —
          // mover a seleção sem mover o foco quebraria a regra de que só um botão está no Tab.
          const moveSelection = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
            if (!RADIO_NAVIGATION_KEYS.includes(event.key) || enabledIndexes.length === 0) return
            event.preventDefault()
            const position = enabledIndexes.indexOf(index)
            const lastPosition = enabledIndexes.length - 1
            const nextPosition =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? lastPosition
                  : event.key === 'ArrowDown' || event.key === 'ArrowRight'
                    ? (position + 1) % enabledIndexes.length
                    : (position - 1 + enabledIndexes.length) % enabledIndexes.length
            const nextIndex = enabledIndexes[nextPosition]
            field.onChange(idOf(visible[nextIndex]))
            itemRefs.current[nextIndex]?.focus()
          }

          return (
            <div role="radiogroup" aria-label="Compras parceladas" className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-lg border">
              {visible.length === 0 ? <p className="px-3 py-6 text-center text-muted-foreground">Nenhuma compra com esse nome.</p> : null}
              {visible.map((suggestion, index) => {
                const { purchase } = suggestion
                const id = idOf(suggestion)
                const checked = field.value === id
                const blocked = suggestion.linkedTo !== null
                const situation = blocked
                  ? `Vinculada a ${suggestion.linkedTo}`
                  : purchase.completed
                    ? 'Quitada'
                    : purchase.ended
                      ? `Encerrada em ${formatMonthShort(monthOfDate(purchase.latest.date))}`
                      : 'Ativa'
                return (
                  <button
                    key={purchase.key}
                    ref={(element) => {
                      itemRefs.current[index] = element
                    }}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    tabIndex={index === tabStopIndex ? 0 : -1}
                    disabled={blocked}
                    onClick={() => field.onChange(id)}
                    onKeyDown={(event) => moveSelection(event, index)}
                    className={cn(
                      'flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60',
                      checked && 'bg-muted',
                    )}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{purchase.merchant}</span>
                        {suggestion.suggested ? <span className="shrink-0 rounded-md border px-1 text-muted-foreground">Sugerida</span> : null}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {dayOf(purchase.postedDate)} · {accountName(purchase.accountId)} · {purchase.installments}× {formatBRL(purchase.lastAmount)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="font-mono tabular-nums">{formatBRL(purchase.estimatedTotal)}</span>
                      <span className="text-muted-foreground">
                        {purchase.paidCount} de {purchase.installments} pagas · {situation}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )
        }}
      />
      <FieldError errors={[formState.errors.purchaseId]} />
    </form>
  )
}
