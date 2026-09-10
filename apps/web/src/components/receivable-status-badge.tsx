import { EnumBadge } from '@/components/enum-badge'
import { receivableStatuses, type SettlementStatus } from '@wlet/domain'

/** Fora do render: a busca na lista não depende de nenhuma prop. */
const OPTIONS = new Map(receivableStatuses.map((option) => [option.value, option]))

/** Situação de uma cobrança num mês. Mesmo estado do pagamento, outro substantivo. */
export function ReceivableStatusBadge({ value, className }: { value: SettlementStatus; className?: string }) {
  return <EnumBadge option={OPTIONS.get(value)} value={value} className={className} />
}
