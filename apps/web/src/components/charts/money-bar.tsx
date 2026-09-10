import { HATCH, hatchBackground } from '@/components/charts/chart-theme'
import { formatAxis, formatMonthShort } from '@/lib/format'

/**
 * O vocabulário comum dos gráficos de barra em REAIS por MÊS — hoje o fluxo da Visão geral e
 * a agenda de Planos.
 *
 * O que mora aqui é o que os dois têm de ser iguais: a hachura da saída, o tracejado do que
 * ainda não é fato, a formatação dos eixos e a linha de cabeçalho com a legenda. O que fica
 * em cada tela é o que os distingue — quais séries existem, como cada uma é preenchida e o
 * que o rodapé do tooltip soma.
 *
 * **Eixos e grade saem como OBJETOS DE PROPS, não como componentes**, e isso não é gosto: o
 * Recharts inspeciona os filhos por tipo para montar o gráfico, então um `<MonthAxis />` que
 * devolvesse `<XAxis>` não seria reconhecido como eixo — o gráfico renderizaria sem ele, sem
 * erro nenhum. Espalhar as props (`<XAxis {...MONTH_AXIS} />`) mantém o elemento que o
 * Recharts espera e ainda assim tira a configuração de duas telas.
 */

/**
 * O traço do que AINDA NÃO É FATO, num lugar só.
 *
 * A `dataviz.md` §3 já exigia que ele fosse o mesmo do `<ProjectionDivider>`, e mesmo assim
 * havia três cópias do literal — uma no divisor, uma em cada gráfico. Três lugares para uma
 * regra que diz "seja igual" é o arranjo que garante a divergência.
 */
export const PROJECTION_DASH = '4 4'

/**
 * O fundo do quadradinho de legenda que representa uma saída HACHURADA.
 *
 * Usa o passo `fine` porque a amostra tem 14px: com o passo da barra ela mostraria uma listra
 * só e leria como bloco sólido — a leitura oposta da que a hachura carrega.
 */
export const EXPENSE_HATCH_SWATCH = hatchBackground('var(--series-expense-stripe)', 'var(--series-expense-fill)')

/**
 * O `<pattern>` da hachura de saída, para os `<defs>` de um gráfico.
 *
 * É FUNÇÃO e não componente pela mesma razão dos eixos: chamada em `{expenseHatch(ID)}` ela
 * devolve o `<defs>` direto na árvore, sem um wrapper que o Recharts teria de reconhecer.
 *
 * O `id` é parâmetro porque dois gráficos na mesma página com o mesmo id de pattern colidem —
 * o segundo passa a pintar com o primeiro.
 */
export function expenseHatch(id: string) {
  return hatchDefs([{ id, stripe: 'var(--series-expense-stripe)' }])
}

/**
 * Um ou mais `<pattern>` de hachura, num `<defs>` só.
 *
 * Aceita a COR da listra por padrão porque um gráfico pode ter mais de uma série hachurada —
 * e, quando tem, a hachura deixa de distinguir por si: quem separa as duas passa a ser o
 * matiz, que é o canal da identidade de série (`dataviz.md` §1).
 */
function hatchDefs(patterns: { id: string; stripe: string; fill?: string }[]) {
  return (
    <defs>
      {/* Listras a 45° subindo para a direita: fundo mais traço, num tile do passo `wide`. */}
      {patterns.map(({ id, stripe, fill = 'var(--series-expense-fill)' }) => (
        <pattern key={id} id={id} width={HATCH.wide.step} height={HATCH.wide.step} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width={HATCH.wide.step} height={HATCH.wide.step} style={{ fill }} />
          <rect width={HATCH.wide.stripe} height={HATCH.wide.step} style={{ fill: stripe }} />
        </pattern>
      ))}
    </defs>
  )
}

/** Grade horizontal apenas: linha vertical competiria com a coluna, que é a marca. */
export const MONEY_GRID = { vertical: false, stroke: 'var(--chart-grid)' } as const

/** Eixo dos meses. `tickMargin` afasta o rótulo da linha o bastante para os dois se lerem. */
export const MONTH_AXIS = { dataKey: 'month', tickFormatter: formatMonthShort, axisLine: { stroke: 'var(--chart-grid)' }, tickLine: false, tickMargin: 12 } as const

/**
 * Eixo dos valores. `width: 70` é medido, não arbitrário: cabe "R$ 22 mil" sem truncar, e é o
 * que mantém a área de plotagem começando na mesma coluna nos dois gráficos.
 */
export const MONEY_AXIS = { tickFormatter: (value: number) => formatAxis(value), axisLine: false as const, tickLine: false as const, width: 70 }

/**
 * Uma marca da legenda.
 *
 * O quadradinho REPRODUZ a marca que identifica (`dataviz.md` §2): hachurado se a barra é
 * hachurada, oco e tracejado se a barra é oca. Uma amostra sólida ao lado de uma marca
 * hachurada descreve uma série que não está desenhada.
 */
export interface LegendMark {
  label: string
  /** Preenchimento do quadradinho. Ausente quando a marca é oca. */
  background?: string
  /** Cor do contorno tracejado — a marca OCA do que ainda é hipótese. */
  dashed?: string
  /** Cor do contorno CONTÍNUO — a marca oca do que já foi assumido. */
  outlined?: string
  /** Anel de 1px: a hachura clara some sobre o fundo do cartão sem ele. */
  ring?: boolean
}
