import { Badge } from '@/components/ui/badge'
import type { EnumOption, EnumTone } from '@/data/types'
import { cn } from '@/lib/utils'

/**
 * A tradução de tom em cor, num lugar só. É por existir aqui que `tone` na lista de
 * opções significa alguma coisa: declarado e não lido, ele era campo morto — `muted` em
 * "Sem contraparte" e `positive` em "Entrada" não produziam diferença nenhuma na tela.
 *
 * `neutral` é deliberadamente sem cor. Um valor é neutro até que algo sobre ele diga o
 * contrário; se todo badge da coluna estiver colorido, nenhum estará destacado.
 */
const TONE_CLASS: Record<EnumTone, string> = {
  neutral: '',
  positive: 'border-[var(--status-good-text)]/40 text-[var(--status-good-text)]',
  negative: 'border-[var(--status-critical)]/40 text-[var(--status-critical)]',
  muted: 'border-muted-foreground/40 text-muted-foreground',
}

/**
 * O badge de um valor de enum: sempre `outline`, com a ênfase no ícone e a cor saindo do
 * `tone` da própria lista. Variante preenchida pinta o bloco inteiro — numa coluna com
 * muitas linhas no mesmo estado isso vira parede de cor.
 *
 * Valor fora da lista cai no texto cru em vez de sumir: célula vazia esconde dado ruim.
 */
export function EnumBadge<T extends string>({ option, value, plural, className }: { option: EnumOption<T> | undefined; value: string; plural?: boolean; className?: string }) {
  const Icon = option?.icon
  const label = (plural ? option?.labelPlural : option?.shortLabel) ?? option?.label ?? value
  return (
    <Badge variant="outline" className={cn(TONE_CLASS[option?.tone ?? 'neutral'], className)}>
      {Icon ? <Icon data-icon="inline-start" aria-hidden /> : null}
      {label}
    </Badge>
  )
}
