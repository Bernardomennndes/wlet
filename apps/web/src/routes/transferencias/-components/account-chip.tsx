import { EntityBadge } from '@/components/entity-badge'
import { ACCOUNT_MAP } from '@/lib/finance'

export function AccountChip({ id }: { id: string }) {
  const account = ACCOUNT_MAP[id]
  if (!account) return <span>{id}</span>
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="font-medium">{account.name}</span>
      <EntityBadge entity={account.entity} />
    </span>
  )
}
