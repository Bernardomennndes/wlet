import { type ComponentProps, useEffect, useId, useRef } from 'react'
import { type HidingSquaresOptions, hidingSquares, polygonPoints } from '@/lib/hiding-squares'
import { cn } from '@wlet/lib/utils'

/**
 * O padrão base do ícone, calibrado por MEDIÇÃO e não a olho.
 *
 * A referência é a MASSA DE TINTA dentro do hexágono: 21% da caixa. Abaixo disso a marca fica
 * lavada ao lado do texto do cabeçalho; foi assim que a primeira versão (grade 6, limiar 0,35)
 * saiu, com 16%, lendo como chuvisco.
 *
 * **Subir a grade não aumenta o detalhe, e isso é geometria.** O hexágono de ponta tem largura
 * 20,78 e o recuo do traço tira mais 1,6 — sobram ~19,2 de 24. Com 7 células de 3,43, o centro
 * da primeira cai em x=1,71, fora da borda que está em 2,4: as colunas das pontas ficam vazias
 * em toda linha, e o miolo útil continua com cinco. O que a grade 7 muda é o tamanho do
 * quadrado, não quantos aparecem — medido, a tinta caiu de 21,2% para 15,3% com o mesmo limiar.
 *
 * Daí o limiar ZERO: sem corte, nenhuma célula é apagada de saída e a tinta volta a 21,1%. O
 * "hiding" continua acontecendo, só que por tamanho — onde o ruído é baixo o quadrado encolhe
 * até desaparecer, em vez de sumir num degrau.
 */
const ICON: HidingSquaresOptions = { grid: 9, noiseScale: 0.45, threshold: 0, seed: 3950, gap: 0.12 }

/** A silhueta da marca: 6 lados, um vértice para cima. */
const SIDES = 6

/**
 * Quanto tempo leva para o campo de ruído avançar UMA unidade no eixo do tempo.
 *
 * Este número substituiu uma oscilação em seno, e a troca não foi estética. Com o seno, o
 * padrão parava duas vezes por ciclo: medida a mudança por quadro, ela caía de 0,92 para
 * 0,005 nos picos — 177× mais lento, o instante de pausa que se via a olho. Avançar `time`
 * linearmente dá velocidade constante e nunca refaz o caminho.
 *
 * Seis segundos por unidade é calmo de propósito: é uma marca permanente no cabeçalho, não um
 * indicador de carga.
 */
const DRIFT_MS = 6_000

/**
 * A silhueta, calculada uma vez no módulo: ela não depende de nada que mude entre quadros.
 *
 * Sem recuo. O `inset` existia porque o `stroke` do SVG é centrado no caminho e metade dele
 * caía fora do `viewBox` nas pontas do hexágono; sem contorno não há o que recuar, e a forma
 * volta a ocupar a caixa inteira.
 */
const SHAPE = polygonPoints(SIDES)

/**
 * A marca da aplicação, no cabeçalho da barra lateral: a grade de "hiding squares", respirando.
 *
 * O que anima é a posição no eixo do TEMPO do campo de ruído: ele é reamostrado numa fatia que
 * avança sempre para a frente, então os quadrados crescem e somem em ondas. Nenhuma outra
 * propriedade se move — a posição de cada célula é fixa, e é isso que faz o efeito ler como um
 * padrão vivo em vez de partículas.
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
 * **A silhueta é deliberadamente fraca, e isso é uma escolha, não um descuido.** Houve um
 * contorno aqui — uma linha desenhando o hexágono, com um traço correndo por ela — e ele
 * resolvia a legibilidade da forma: medido, nas células que a borda atravessa a força do ruído
 * é ~50%, então o recorte sozinho nunca cria a aresta, só tira massa. O contorno foi removido
 * a pedido: o que fica é a marca lendo como uma nuvem de pontos com o canto cortado, e a forma
 * se insinua em vez de se afirmar.
 */
export function HidingSquaresIcon({ className, ...props }: ComponentProps<'svg'>) {
  // `useId` porque o `id` do clipPath é global no documento: dois ícones montados ao mesmo
  // tempo com o mesmo id fariam o segundo referenciar o recorte do primeiro. A limpeza existe
  // porque o valor do React carrega pontuação, e `url(#...)` só aceita um fragmento válido.
  const clipId = `hiding-squares-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const rects = useRef<(SVGRectElement | null)[]>([])
  const base = hidingSquares(ICON)

  useEffect(() => {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const started = performance.now()
    const tick = (now: number) => {
      const squares = hidingSquares({ ...ICON, time: (now - started) / DRIFT_MS })
      for (let i = 0; i < squares.length; i++) {
        const node = rects.current[i]
        if (!node) continue
        const { x, y, size } = squares[i]
        node.setAttribute('x', x.toFixed(3))
        node.setAttribute('y', y.toFixed(3))
        node.setAttribute('width', size.toFixed(3))
        node.setAttribute('height', size.toFixed(3))
      }
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
    </svg>
  )
}
