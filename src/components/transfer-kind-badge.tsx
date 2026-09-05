import { EnumBadge } from '@/components/enum-badge'
import { transfersKinds, type TransferKind } from '@/data/types'

/** Fora do render: a busca na lista não depende de nenhuma prop. */
const OPTIONS = new Map(transfersKinds.map((option) => [option.value, option]))

/** Tipo de transferência. */
export function TransferKindBadge({ value, className }: { value: TransferKind; className?: string }) {
  return <EnumBadge option={OPTIONS.get(value)} value={value} className={className} />
}
