import { useEffect, useId, useRef, type ComponentProps } from 'react'
import { hidingSquares, polygonPoints, type HidingSquaresOptions } from '@/lib/hiding-squares'
import { cn } from '@/lib/utils'

/**
 * O padrão base do ícone, calibrado por MEDIÇÃO e não a olho.
 *
 * A semente veio da configuração da referência; o resto foi ajustado contra dois números.
 * **Massa de tinta:** com `grid: 6` e o limiar original de 0,35 o ícone cobria 16% da caixa e
 * ficava lavado ao lado dos ícones do lucide, que são traços cheios — a 16px ele lia como
 * chuvisco. Com `grid: 5`, limiar 0,18 e menos respiro, sobe para 29,7% e ganha um degradê
 * diagonal que lê como glifo. **Grade pequena** porque a 16px cada célula tem ~3px: as 23
 * células do gerador original virariam menos de um pixel cada, e o antialiasing dissolveria
 * tudo numa mancha cinza uniforme.
 */
const ICON: HidingSquaresOptions = { grid: 5, noiseScale: 0.55, threshold: 0.18, seed: 3950, gap: 0.12 }

/** A silhueta da marca: 6 lados, um vértice para cima. */
const SIDES = 6

/**
 * Amplitude e período da respiração do `noiseScale`.
 *
 * 0,22 foi a primeira tentativa e move a tinta só 3,3 pontos percentuais ao longo do ciclo —
 * invisível num ícone de 16px. 0,35 move 8,3 pp, que se percebe sem chamar atenção. O período
 * longo é deliberado: é um ícone permanente numa barra lateral, não um indicador de carga.
 */
const AMPLITUDE = 0.35
const PERIOD_MS = 9_000

/**
 * Espessura do contorno e o recuo que ele exige.
 *
 * O `stroke` do SVG é CENTRADO no caminho: metade dele cai para fora da forma. Sem recuar ao
 * menos meia espessura, a ponta de cima e a de baixo do hexágono — que tocam y=0 e y=24 —
 * teriam o traço cortado pelo `viewBox`. O recuo é um pouco maior que a metade para o traço
 * não encostar na borda da caixa.
 */
const STROKE = 1.2
const SHAPE_INSET = STROKE / 2 + 0.2

/**
 * A silhueta, calculada uma vez no módulo: ela não depende de nada que mude entre quadros, e
 * o MESMO caminho serve ao recorte e ao contorno — é o que garante que a borda desenhada caia
 * exatamente onde o padrão é cortado.
 */
const SHAPE = polygonPoints(SIDES, { inset: SHAPE_INSET })

/**
 * O traço que corre pela borda, em porcentagem do perímetro.
 *
 * `pathLength={100}` renormaliza o comprimento do caminho para 100 unidades, então o traço e
 * o vão são lidos como porcentagem e não dependem da geometria. Sem isso, eu teria de calcular
 * o perímetro do hexágono — e recalculá-lo a cada vez que a forma ou o recuo mudassem.
 */
const DASH = 22

/**
 * A marca da aplicação, no cabeçalho da barra lateral: a grade de "hiding squares", respirando.
 *
 * O que anima é o `noiseScale` — o campo de ruído é reamostrado numa escala que oscila, então
 * os quadrados crescem e somem em ondas. Nenhuma outra propriedade se move: a posição de cada
 * célula é fixa, e é isso que faz o efeito ler como um padrão vivo em vez de partículas.
 *
 * **A animação escreve atributos direto no DOM, não em estado.** São 36 nós reavaliados a cada
 * quadro; com `useState` isso seria um re-render do ícone 60 vezes por segundo, para sempre,
 * numa barra lateral que está montada em toda tela do app. O `useEffect` aqui é o caso que a
 * regra de componentes permite explicitamente: animação e DOM imperativo.
 *
 * O primeiro quadro é renderizado pelo React, com a escala base — então o ícone já nasce certo
 * e nunca aparece vazio, inclusive quando a animação não roda.
 *
 * `prefers-reduced-motion` desliga o laço, e o ícone fica no padrão base. O `requestAnimationFrame`
 * também para sozinho quando a aba sai de foco, então o custo em segundo plano é zero.
 *
 * A silhueta vem de um `<clipPath>`. Recortar é melhor que filtrar quadrados inteiros pelo
 * centro: numa grade pequena a borda da forma passa DENTRO das células, então filtrar
 * devolveria a silhueta da grade — um quadrado. O corte parcial é o que desenha a diagonal.
 *
 * Foi um octógono antes, e não funcionava: octógono é quase um quadrado, e num campo
 * ruidoso os cantos cortados eram indistinguíveis dos buracos do próprio ruído. O hexágono
 * tem duas pontas e quatro diagonais longas.
 *
 * **Mas nem o hexágono se lia só pelo recorte, e o contorno é o que conserta isso.** Medido:
 * nas células que a borda atravessa, a força média do ruído é ~50% — elas já estão meio
 * apagadas antes de o recorte chegar, e recortar só tira massa, nunca cria a aresta. Subir a
 * densidade não resolveu (grade 7, 8 e 9 com limiares menores deram 50%, 54% e 56%). Com o
 * traço, a silhueta deixa de depender do ruído: a linha desenha a forma e o padrão vira
 * preenchimento.
 *
 * A borda anima do MESMO relógio que o padrão — um `phase` só, duas leituras. Um segundo
 * laço poderia derivar do primeiro e os dois sairiam de sincronia sem nada acusar.
 */
export function HidingSquaresIcon({ className, ...props }: ComponentProps<'svg'>) {
  // `useId` porque o `id` do clipPath é global no documento: dois ícones montados ao mesmo
  // tempo com o mesmo id fariam o segundo referenciar o recorte do primeiro. A limpeza existe
  // porque o valor do React carrega pontuação, e `url(#...)` só aceita um fragmento válido.
  const clipId = `hiding-squares-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const rects = useRef<(SVGRectElement | null)[]>([])
  const dash = useRef<SVGPolygonElement | null>(null)
  const base = hidingSquares(ICON)

  useEffect(() => {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const started = performance.now()
    const tick = (now: number) => {
      const phase = ((now - started) / PERIOD_MS) * Math.PI * 2
      const squares = hidingSquares({ ...ICON, noiseScale: ICON.noiseScale + AMPLITUDE * Math.sin(phase) })
      for (let i = 0; i < squares.length; i++) {
        const node = rects.current[i]
        if (!node) continue
        const { x, y, size } = squares[i]
        node.setAttribute('x', x.toFixed(3))
        node.setAttribute('y', y.toFixed(3))
        node.setAttribute('width', size.toFixed(3))
        node.setAttribute('height', size.toFixed(3))
      }
      // A borda corre uma volta por período. O deslocamento é negativo para o traço andar no
      // sentido em que o polígono foi desenhado, que é o que lê como "avançando".
      dash.current?.setAttribute('stroke-dashoffset', (-((now - started) / PERIOD_MS) * 100).toFixed(2))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" className={cn(className)} {...props}>
      <defs>
        <clipPath id={clipId}>
          <polygon points={SHAPE} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {base.map((square, i) => (
          <rect
            // A chave é o índice porque a lista É posicional: `hidingSquares` devolve sempre a
            // mesma quantidade, na mesma ordem, e o item i é sempre a mesma célula da grade.
            key={i}
            ref={(node) => {
              rects.current[i] = node
            }}
            x={square.x}
            y={square.y}
            width={square.size}
            height={square.size}
            rx={0.6}
          />
        ))}
      </g>
      {/* O contorno fica FORA do grupo recortado: ele é a própria forma, e recortá-lo comeria
          metade da espessura. Duas linhas sobre o mesmo caminho — a fraca dá a silhueta
          inteira o tempo todo, a forte é o trecho que corre. */}
      <polygon points={SHAPE} fill="none" stroke="currentColor" strokeWidth={STROKE * 0.6} opacity={0.3} strokeLinejoin="round" />
      <polygon
        ref={dash}
        points={SHAPE}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${DASH} ${100 - DASH}`}
      />
    </svg>
  )
}
