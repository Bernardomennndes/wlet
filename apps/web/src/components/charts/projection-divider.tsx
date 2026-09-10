import { useId } from 'react'
import { usePlotArea, useXAxisScale } from 'recharts'

/** Quanto o brilho avança para dentro da projeção, em pixels. */
const GLOW_WIDTH = 8

/**
 * Quanto o rótulo e o marcador ocupam ACIMA da área de plotagem. O gráfico que usa este
 * divisor precisa reservar ao menos isto no `margin.top`, senão os dois saem cortados pela
 * borda do SVG.
 */
export const PROJECTION_MARKER_SPACE = 26

/**
 * A fronteira entre medição e previsão: rótulo, marcador, linha tracejada e um brilho suave
 * entrando na área prevista.
 *
 * O `x` vem de `useXAxisScale(…, { position: 'start' })` porque o eixo é de BANDA e a linha
 * precisa cair na BORDA da primeira coluna prevista, não no centro dela. Um `<ReferenceLine>`
 * não serve: ele soma metade da banda e a linha sai atravessando a primeira barra da
 * projeção — medido, 556px contra os 530,5px onde a faixa começa.
 *
 *
 * Renderizado direto dentro do gráfico: no Recharts 3 o `<Customized>` está depreciado e
 * qualquer elemento pode ser filho do chart.
 */
export function ProjectionDivider({ month, label = 'Previsão' }: { month: string; label?: string }) {
  const gradientId = useId()
  const xScale = useXAxisScale()
  const plot = usePlotArea()
  if (!xScale || !plot) return null

  const x = xScale(month, { position: 'start' })
  if (x === undefined) return null

  const top = plot.y

  return (
    <g aria-hidden>
      <defs>
        {/* Branco no escuro, quase preto no claro: o brilho é sempre um degradê da cor de
            realce do tema, não uma cor fixa. */}
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={x} x2={x + GLOW_WIDTH} y1={0} y2={0}>
          {/* Três paradas, não duas: uma rampa linear de 8px termina de forma visível, e o
              ponto intermediário mais baixo faz a cauda desaparecer antes da borda. */}
          <stop offset="0%" stopColor="var(--chart-projection-glow)" stopOpacity={0.09} />
          <stop offset="50%" stopColor="var(--chart-projection-glow)" stopOpacity={0.028} />
          <stop offset="100%" stopColor="var(--chart-projection-glow)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <rect x={x} y={top} width={GLOW_WIDTH} height={plot.height} fill={`url(#${gradientId})`} />
      {/* Rótulo e marcador vivem FORA da área de plotagem, na margem superior do gráfico:
          dentro dela o rótulo disputaria espaço com a barra mais alta e com as etiquetas
          que ficam sobre ela. */}
      <text x={x} y={top - 11} textAnchor="middle" fill="var(--chart-muted)" fontSize={11}>
        {label}
      </text>
      <polygon points={`${x},${top} ${x + 5},${top - 7} ${x - 5},${top - 7}`} fill="var(--chart-muted)" />
      <line x1={x} x2={x} y1={top} y2={top + plot.height} stroke="var(--chart-muted)" strokeDasharray="4 4" strokeWidth={1} />
    </g>
  )
}
