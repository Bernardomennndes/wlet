import { type ComponentProps, useEffect, useRef } from 'react'
import { CUBE_REST_TIME, isometricCube } from '@/lib/isometric-cube'
import { mixInOklab, type Rgb, rgbToOklab } from '@/lib/oklab'
import { cn } from '@wlet/lib/utils'

/**
 * Quanto tempo leva um fôlego inteiro: acender da borda ao centro e apagar da borda ao centro. Cinco
 * segundos é o ritmo de uma respiração calma — é uma marca permanente no cabeçalho, não um
 * indicador de carga.
 */
const CYCLE_MS = 5_000

/** Teto da densidade de pixels. Acima de 2 o ganho some a 32px e o custo por quadro não. */
const MAX_DPR = 2

/** A tinta é arredondada para 49 cores por par de fundo e texto, calculadas uma vez. */
const STEPS = 48

/** Ponto claro sobre fundo escuro parece maior do que é; no tema escuro ele sai um pouco menor. */
const IRRADIATION = 0.92

interface Palette {
  levels: string[]
  lightOnDark: boolean
}

const rgbaByCss = new Map<string, readonly [number, number, number, number]>()
const palettes = new Map<string, Palette>()
let probe: CanvasRenderingContext2D | null = null

/**
 * Qualquer cor CSS em RGBA, lida pelo próprio navegador: pinta um pixel e lê de volta. O computado
 * pode vir em `oklch`, `lab` ou `rgb` conforme o navegador, e reescrever esse leitor seria uma
 * segunda implementação do que ele já faz. Em cache, porque a leitura de pixel é cara e as cores só
 * mudam com tema e hover. O canvas de sondagem nasce no primeiro uso, não na importação.
 */
function rgbaOf(css: string): readonly [number, number, number, number] {
  const cached = rgbaByCss.get(css)
  if (cached) return cached
  if (!probe) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    probe = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (!probe) return [0, 0, 0, 0]
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = '#000'
  probe.fillStyle = css
  probe.fillRect(0, 0, 1, 1)
  const [red, green, blue, alpha] = probe.getImageData(0, 0, 1, 1).data
  const rgba = [red, green, blue, alpha / 255] as const
  rgbaByCss.set(css, rgba)
  return rgba
}

/**
 * O fundo real de um canvas transparente: o do primeiro ancestral opaco. Na barra é o da própria
 * barra — ou o do botão, quando o hover o pinta —, e na tela de entrada é o do `body`.
 */
function backgroundOf(element: HTMLElement): string {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const css = getComputedStyle(node).backgroundColor
    if (rgbaOf(css)[3] > 0.5) return css
  }
  return getComputedStyle(document.body).backgroundColor
}

function paletteFor(foregroundCss: string, backgroundCss: string): Palette {
  const key = `${foregroundCss}|${backgroundCss}`
  const cached = palettes.get(key)
  if (cached) return cached
  const [fr, fg, fb] = rgbaOf(foregroundCss)
  const [br, bg, bb] = rgbaOf(backgroundCss)
  const foreground: Rgb = [fr, fg, fb]
  const background: Rgb = [br, bg, bb]
  const levels = Array.from({ length: STEPS + 1 }, (_, i) => {
    const [red, green, blue] = mixInOklab(background, foreground, i / STEPS)
    return `rgb(${red} ${green} ${blue})`
  })
  const palette = { levels, lightOnDark: rgbToOklab(foreground)[0] > rgbToOklab(background)[0] }
  palettes.set(key, palette)
  return palette
}

/**
 * A marca da aplicação: um cubo de pontos visto pela diagonal, com contorno de hexágono, respirando
 * pelas três arestas centrais.
 *
 * **É um `<canvas>`, não SVG.** São 98 pontos reescritos a cada quadro, e em ordem de profundidade
 * que muda com a precessão; no SVG isso seria reordenar nós, e cada atributo trocado invalidaria
 * estilo. No canvas o quadro é um laço de `arc` + `fill`.
 *
 * **A tinta é COR SÓLIDA, não transparência.** Cada ponto recebe uma mistura em OKLab entre o fundo e
 * a cor do texto (`@/lib/oklab`), na posição que a geometria mandou. É o que dá degraus iguais nos
 * dois temas e o que impede ponto sobreposto de escurecer — com `globalAlpha` as duas coisas falhavam.
 * As duas cores são lidas do DOM a cada quadro: a do texto do próprio canvas (o equivalente do
 * `currentColor` do SVG) e a do primeiro ancestral opaco. Isso dispensa `useTheme` — a tela de
 * entrada monta este ícone SEM provider (ver `main.tsx`) — e faz o ícone acompanhar o hover do botão.
 *
 * **A animação começa no estado de repouso** (`CUBE_REST_TIME`, o centro no pico) e é esse mesmo
 * quadro que `prefers-reduced-motion` desenha: quem não vê movimento vê o estado para onde a marca
 * sempre volta, e quem vê não assiste a um salto no primeiro quadro.
 *
 * **O desenho vai para o canvas, não para estado:** um `useState` por quadro seria um re-render 60
 * vezes por segundo numa barra montada em toda tela. O laço para quando o ícone sai da tela e quando
 * a aba fica em segundo plano. Sem laço, o ícone redesenha quando a classe do `<html>` muda, que é
 * onde o tema é aplicado.
 */
export function IsometricCubeIcon({ className, ...props }: ComponentProps<'canvas'>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const started = performance.now()
    let size = 0
    let frame = 0
    let running = false
    let onScreen = true
    let time = CUBE_REST_TIME

    const draw = () => {
      if (size === 0) return
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
      const palette = paletteFor(getComputedStyle(canvas).color, backgroundOf(canvas))
      const shrink = palette.lightOnDark ? IRRADIATION : 1
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, size, size)
      let level = -1
      // A lista já vem de trás para a frente: o ponto da frente cobre o de trás.
      for (const dot of isometricCube({ time, box: size })) {
        const next = Math.round(Math.min(1, Math.max(0, dot.tone)) * STEPS)
        if (next !== level) {
          context.fillStyle = palette.levels[next]
          level = next
        }
        context.beginPath()
        context.arc(dot.x, dot.y, Math.max(0.35, dot.radius * shrink), 0, Math.PI * 2)
        context.fill()
      }
    }

    // O bitmap acompanha o tamanho CSS: quem decide o tamanho é a classe de quem usa o ícone.
    const resize = () => {
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
      size = canvas.clientWidth
      canvas.width = Math.round(size * dpr)
      canvas.height = Math.round(size * dpr)
      draw()
    }

    const tick = (now: number) => {
      time = CUBE_REST_TIME + (now - started) / CYCLE_MS
      draw()
      frame = requestAnimationFrame(tick)
    }
    const start = () => {
      if (running || reducedMotion || !onScreen) return
      running = true
      frame = requestAnimationFrame(tick)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(frame)
    }

    resize()
    start()

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    resizeObserver?.observe(canvas)
    const visibility =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(([entry]) => {
            onScreen = entry.isIntersecting
            if (onScreen) start()
            else stop()
          })
        : null
    visibility?.observe(canvas)
    // Só o `<html>`, e só `class`: é ali que o `ThemeProvider` aplica o tema. Observar a árvore
    // inteira dispararia a cada classe trocada em qualquer lugar do app.
    const themeObserver = new MutationObserver(draw)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => {
      stop()
      resizeObserver?.disconnect()
      visibility?.disconnect()
      themeObserver.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className={cn('block', className)} {...props} />
}
