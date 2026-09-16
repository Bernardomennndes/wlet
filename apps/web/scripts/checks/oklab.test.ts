import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mixInOklab, oklabToRgb, type Rgb, rgbToOklab } from '@/lib/oklab'

/**
 * A mistura de cor que pinta a marca. O modo de falha dela é silencioso: uma matriz com um sinal
 * trocado ainda devolve uma cor válida, só que com um matiz que ninguém escolheu — e numa marca
 * monocromática um cinza esverdeado passa semanas sem ser notado.
 */
const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]
const APP_TEXT: Rgb = [10, 10, 10]

const closeTo = (actual: Rgb, expected: Rgb, tolerance = 1) => actual.every((channel, i) => Math.abs(channel - expected[i]) <= tolerance)

describe('conversão entre sRGB e OKLab', () => {
  it('branco tem luminosidade 1 e preto 0, sem matiz', () => {
    const white = rgbToOklab(WHITE)
    const black = rgbToOklab(BLACK)
    assert.ok(Math.abs(white[0] - 1) < 1e-3 && Math.abs(white[1]) < 1e-3 && Math.abs(white[2]) < 1e-3, `branco: ${white}`)
    assert.ok(Math.abs(black[0]) < 1e-9 && Math.abs(black[1]) < 1e-9 && Math.abs(black[2]) < 1e-9, `preto: ${black}`)
  })

  it('ida e volta devolve a mesma cor', () => {
    // Um coeficiente errado em qualquer das duas matrizes aparece aqui, inclusive em cor com matiz.
    const samples: Rgb[] = [WHITE, BLACK, APP_TEXT, [255, 0, 0], [0, 128, 255], [34, 177, 76], [200, 180, 20], [128, 128, 128]]
    for (const color of samples) assert.ok(closeTo(oklabToRgb(rgbToOklab(color)), color), `ida e volta alterou ${color}`)
  })
})

describe('a mistura', () => {
  it('as pontas são as próprias cores', () => {
    assert.ok(closeTo(mixInOklab(WHITE, APP_TEXT, 0), WHITE))
    assert.ok(closeTo(mixInOklab(WHITE, APP_TEXT, 1), APP_TEXT))
  })

  it('cinza misturado com cinza continua cinza', () => {
    // A marca é monocromática: qualquer desvio entre os canais seria um matiz inventado.
    for (let i = 0; i <= 10; i++) {
      const [red, green, blue] = mixInOklab(WHITE, APP_TEXT, i / 10)
      assert.ok(Math.abs(red - green) <= 1 && Math.abs(green - blue) <= 1, `t=${i / 10} saiu com matiz: ${[red, green, blue]}`)
    }
  })

  it('degraus iguais de t dão degraus iguais de luminosidade, nos dois sentidos', () => {
    // É a razão de misturar em OKLab em vez de usar transparência: o mesmo degrau pesa igual no tema
    // claro (texto escuro sobre branco) e no escuro (texto claro sobre fundo escuro).
    for (const [from, to] of [
      [WHITE, APP_TEXT],
      [APP_TEXT, WHITE],
    ] as const) {
      const lightness = Array.from({ length: 9 }, (_, i) => rgbToOklab(mixInOklab(from, to, i / 8))[0])
      const steps = lightness.slice(1).map((value, i) => value - lightness[i])
      // A tolerância cobre o arredondamento para inteiro de cada canal.
      assert.ok(Math.max(...steps) - Math.min(...steps) < 0.01, `degraus desiguais: ${steps.map((s) => s.toFixed(3)).join(' ')}`)
    }
  })
})
