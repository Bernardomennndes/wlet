import type { CSSProperties } from 'react'
import { NotInformed } from '@/components/not-informed'
import { SERIES_SWATCH } from '@/components/charts/chart-theme'
import type { SegmentPart, VolumeParts } from '@/lib/expense-segments'
import { formatBRL } from '@wlet/lib/format'
import { cn } from '@wlet/lib/utils'

/**
 * A barra de volume de um mês, e a amostra que a legenda dela usa.
 *
 * Mora aqui, e não no `-components/` de uma rota, porque duas telas desenham a mesma marca:
 * a lista de meses da Visão geral e a de meses previstos da Previsão. Duplicá-la deixaria
 * as duas divergirem no primeiro ajuste de altura ou de gap — que foi o que a regra de
 * organização de rotas pede para evitar quando algo passa a ser compartilhado.
 */

/**
 * O estilo de uma fatia, medida ou prevista.
 *
 * Previsto ESVAZIA a marca (§3 da regra de dataviz): o preenchimento sai e sobra o contorno,
 * na cor da própria série — a identidade não muda, só a densidade. O eixo do fluxo, que na
 * marca cheia é a hachura, passa para o TRAÇO: contínuo na entrada, tracejado na saída.
 *
 * O tracejado não é escolha solta: é o mesmo traço do `<ProjectionDivider>`, que já é o
 * idioma de "daqui para a frente é previsão" no app inteiro.
 */
function styleOf(part: SegmentPart, total: number, projected: boolean): CSSProperties {
  const width = `${(part.value / total) * 100}%`
  if (!projected) return { width, background: part.background }
  return { width, background: 'transparent', border: `1px ${part.flow === 'income' ? 'solid' : 'dashed'} ${part.color}` }
}

/** O quadradinho reproduz a MARCA que ele identifica: hachurado, contornado ou tracejado. */
export function SegmentLabel({ part, projected = false, children }: { part: SegmentPart; projected?: boolean; children: string }) {
  const style: CSSProperties = projected ? { background: 'transparent', border: `1px ${part.flow === 'income' ? 'solid' : 'dashed'} ${part.color}` } : { background: part.background }
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className={SERIES_SWATCH} style={style} />
      {children}
    </span>
  )
}

export function VolumeBar({
  parts,
  label,
  empty = 'Sem movimento no mês',
  projected = false,
  className,
}: {
  parts: VolumeParts
  label: string
  empty?: string
  /** Marca ainda não acontecida: contorno no lugar do preenchimento. */
  projected?: boolean
  className?: string
}) {
  const { total, income, expense } = parts
  if (total <= 0) return <NotInformed>{empty}</NotInformed>
  const all = income ? [income, ...expense] : expense
  const description = all.map((p) => `${p.label} ${formatBRL(p.value)}`).join(', ')
  return (
    // `role="img"` com a descrição inteira: as fatias são desenho, e um leitor de tela
    // precisa da leitura completa, não de doze retângulos sem nome.
    <span role="img" aria-label={`${label}: ${description}`} className={cn('flex h-2 w-full gap-1 overflow-hidden rounded-xs', className)}>
      {all.map((part) => (
        // Fatia prevista tem largura mínima maior: com 2px e 1px de contorno de cada lado,
        // a fatia inteira seria borda e o preenchimento vazio deixaria de se ler como vazio.
        <span key={part.key} className={cn('h-full rounded-xs', projected ? 'min-w-1.5' : 'min-w-0.5')} style={styleOf(part, total, projected)} />
      ))}
    </span>
  )
}
