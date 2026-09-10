import { EnumBadge } from '@/components/enum-badge'
import { flowKinds, type Flow, type PlannedEntry } from '@wlet/domain'

/** Fora do render: a busca na lista não depende de nenhuma prop. */
const OPTIONS = new Map(flowKinds.map((option) => [option.value, option]))

/**
 * Fluxo de um lançamento. Serve também ao `kind` de uma regra de previsão, que é
 * subconjunto de `Flow` — daí o rótulo singular, e não o plural da legenda.
 */
export function FlowBadge({ value, className }: { value: Flow | PlannedEntry['kind']; className?: string }) {
  return <EnumBadge option={OPTIONS.get(value)} value={value} className={className} />
}
