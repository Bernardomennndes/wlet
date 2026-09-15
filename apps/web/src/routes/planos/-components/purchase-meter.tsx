import { monthOfDate, type InstallmentPurchase } from '@wlet/domain/purchases'
import { formatBRL, formatMonthShort } from '@wlet/lib/format'
import { cn } from '@wlet/lib/utils'

/** Acima disto os segmentos ficam finos demais para contar, e o medidor vira uma barra contínua. */
const MAX_SEGMENTS = 24

/**
 * Quanto de uma compra parcelada já foi pago.
 *
 * O verde é de SITUAÇÃO — "isto já saiu do bolso" —, como o cartão de orçamento, e não cor de série: o
 * medidor mora na linha, fora de gráfico, então não disputa com a identidade das categorias
 * (`dataviz.md` §1). A parte que falta é OCA, o mesmo idioma de "ainda não aconteceu" do app.
 *
 * O desenho é `aria-hidden` e o texto ao lado diz a mesma coisa: contorno e cor não chegam a quem ouve.
 */
export function PurchaseMeter({ purchase }: { purchase: InstallmentPurchase }) {
  const paid = Math.min(purchase.paidCount, purchase.installments)
  const total = purchase.installments
  const suffix = purchase.completed ? ' · quitada' : purchase.ended ? ` · encerrada em ${formatMonthShort(monthOfDate(purchase.latest.date))}` : ''

  return (
    <span className="flex items-center gap-2 font-normal">
      {total <= MAX_SEGMENTS ? (
        <span aria-hidden className="flex gap-0.5">
          {Array.from({ length: total }, (_, index) => (
            // A posição é a identidade do segmento: o índice é a chave certa aqui.
            <span key={index} className={cn('h-1.5 w-3 rounded-[2px]', index < paid ? 'bg-[var(--status-good)]' : 'border border-border')} />
          ))}
        </span>
      ) : (
        <span aria-hidden className="relative h-1.5 w-24 overflow-hidden rounded-[2px] border border-border">
          <span className="absolute inset-y-0 left-0 bg-[var(--status-good)]" style={{ width: `${(paid / total) * 100}%` }} />
        </span>
      )}
      <span className="text-muted-foreground tabular-nums">
        {paid} de {total} pagas · {formatBRL(purchase.paidAmount)}
        {suffix}
      </span>
    </span>
  )
}
