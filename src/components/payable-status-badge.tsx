import { EnumBadge } from '@/components/enum-badge'
import { payableStatuses, type SettlementStatus } from '@/data/types'

/** Fora do render: a busca na lista não depende de nenhuma prop. */
const OPTIONS = new Map(payableStatuses.map((option) => [option.value, option]))

/** Situação de uma conta a pagar num mês. Mesmo estado da cobrança, outro substantivo. */
export function PayableStatusBadge({ value, className }: { value: SettlementStatus; className?: string }) {
  return <EnumBadge option={OPTIONS.get(value)} value={value} className={className} />
}
