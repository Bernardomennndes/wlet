import { EnumBadge } from '@/components/enum-badge'
import { entityKinds, type Entity } from '@wlet/domain'

/** Fora do render: a busca na lista não depende de nenhuma prop. */
const OPTIONS = new Map(entityKinds.map((option) => [option.value, option]))

/**
 * Entidade de uma conta. A distinção PF/PJ é carregada pelo ícone, não por cor de fundo:
 * o badge aparece em toda linha da tabela de transações e em cada conta das
 * transferências, e ali fundo colorido vira parede.
 */
export function EntityBadge({ entity, className }: { entity: Entity; className?: string }) {
  return <EnumBadge option={OPTIONS.get(entity)} value={entity} className={className} />
}
