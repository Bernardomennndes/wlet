/**
 * Devolve ao ChartContainer os tokens de dataviz do projeto.
 * O ChartContainer aplica `[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground`
 * e `[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted`; regra CSS vence
 * atributo de apresentação, então `tick={{fill}}` e `cursor={{fill}}` seriam ignorados.
 * Aqui as MESMAS variantes são reescritas com --chart-muted / --chart-cursor e o
 * twMerge do `cn` remove as classes base do registry.
 * `aspect-auto w-full` neutraliza o `aspect-video` da base — a altura vem de style={{ height }}.
 * `text-[11px]` reproduz o fontSize 11 do antigo AXIS_TICK (o container herdaria 12px).
 */
export const CHART_TOKENS =
  'aspect-auto w-full [&_.recharts-cartesian-axis-tick_text]:fill-[var(--chart-muted)] [&_.recharts-cartesian-axis-tick_text]:text-[11px] [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-[var(--chart-cursor)]'

/**
 * Passo e espessura da hachura, por tamanho de marca. O ângulo (−45°) e a proporção
 * (a listra é a MENOR parte do passo) são os mesmos em todo lugar; só o passo acompanha a marca,
 * porque um passo grande numa marca pequena mostra uma listra só e lê como bloco sólido.
 *
 * É a fonte única desses números: o `<pattern>` do SVG e o gradiente do CSS leem daqui.
 */
export const HATCH = {
  /** Barra larga — gráfico de fluxo da Visão geral. */
  wide: { step: 5, stripe: 2 },
  /** Barra empilhada — gráfico de categorias. */
  stack: { step: 4.5, stripe: 1.75 },
  /** Marca fina — barra da lista de meses e quadradinho de legenda. */
  fine: { step: 3.5, stripe: 1.25 },
} as const

export type HatchScale = (typeof HATCH)[keyof typeof HATCH]

/**
 * Hachura de saída, em CSS — a mesma leitura do `<pattern>` dos gráficos, para uma saída
 * ter a mesma textura em SVG e em HTML. `fill` transparente deixa o fundo de trás
 * aparecer, que é o que mantém a hachura legível também sobre um item destacado.
 */
export function hatchBackground(color: string, fill = 'transparent', scale: HatchScale = HATCH.fine): string {
  return `repeating-linear-gradient(-45deg, ${color} 0 ${scale.stripe}px, ${fill} ${scale.stripe}px ${scale.step}px)`
}

/**
 * O indicador de série numa legenda é um QUADRADO, nunca um círculo — em qualquer tela.
 * Ele é uma amostra da marca que identifica, e as marcas deste painel são retângulos:
 * barra, fatia de pilha, segmento. Um círculo obriga o olho a traduzir forma antes de
 * casar cor, e é a única forma que o gráfico não desenha em lugar nenhum.
 */
export const SERIES_SWATCH = 'inline-block size-2.5 shrink-0 rounded-[2px]'

/**
 * A altura de um medidor de proporção — a barra que diz "quanto de quanto". Vive aqui
 * porque mais de um cartão a usa e a comparação entre eles depende de serem iguais: com a
 * altura escrita em cada tela, uma fatia arredondada com vão já lê como mais fina que um
 * trilho contínuo da mesma altura, e a divergência passa despercebida.
 *
 * O medidor de tiquinhos das metas é deliberadamente mais alto: são 28 traços finos, e com
 * esta altura eles deixariam de se distinguir uns dos outros.
 */
export const METER_HEIGHT = 'h-3.5'
