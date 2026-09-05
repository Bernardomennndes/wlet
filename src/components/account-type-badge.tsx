import { EnumBadge } from '@/components/enum-badge'
import { accountsTypes, type AccountType } from '@/data/types'

/** Fora do render: a busca na lista não depende de nenhuma prop. */
const OPTIONS = new Map(accountsTypes.map((option) => [option.value, option]))

/** Tipo da conta. */
export function AccountTypeBadge({ value, className }: { value: AccountType; className?: string }) {
  return <EnumBadge option={OPTIONS.get(value)} value={value} className={className} />
}
