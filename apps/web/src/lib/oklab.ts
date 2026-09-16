/**
 * Mistura de cores em OKLab — o espaço de cor em que distâncias iguais PARECEM iguais.
 *
 * Existe por causa da marca animada. A tinta dos pontos era a cor do texto com `globalAlpha`, e
 * transparência não dá degraus perceptivamente iguais: no tom médio o tema claro pedia ~55% de alfa
 * e o escuro ~45% para parecerem o mesmo cinza, e dois pontos sobrepostos somavam tinta. Misturando
 * fundo e texto aqui e pintando a cor SÓLIDA, o degrau é o mesmo nos dois temas e ponto sobre ponto
 * não escurece.
 *
 * As matrizes são as de Björn Ottosson, que definiu o espaço. É a mesma interpolação que o CSS faz
 * em `color-mix(in oklab, …)`, então uma legenda escrita em CSS e o canvas concordam.
 */

/** Cor em sRGB codificado, cada canal de 0 a 255. */
export type Rgb = readonly [red: number, green: number, blue: number]

/** Cor em OKLab: luminosidade de 0 a 1 e os dois eixos de matiz. */
export type Oklab = readonly [lightness: number, a: number, b: number]

function toLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function toEncoded(linear: number): number {
  const encoded = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255)
}

export function rgbToOklab([red, green, blue]: Rgb): Oklab {
  const r = toLinear(red)
  const g = toLinear(green)
  const b = toLinear(blue)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

export function oklabToRgb([lightness, a, b]: Oklab): Rgb {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    toEncoded(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toEncoded(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toEncoded(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/** A cor a `t` do caminho entre `from` (0) e `to` (1), interpolada em OKLab. */
export function mixInOklab(from: Rgb, to: Rgb, t: number): Rgb {
  const start = rgbToOklab(from)
  const end = rgbToOklab(to)
  return oklabToRgb([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t, start[2] + (end[2] - start[2]) * t])
}
