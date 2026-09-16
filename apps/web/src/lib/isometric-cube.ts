/**
 * A marca da aplicação: um cubo de pontos visto pela diagonal, RESPIRANDO pelas três arestas centrais,
 * pelos pontos ao lado delas e pela quina que elas formam em cada face.
 *
 * Um cubo olhado ao longo da diagonal que liga dois vértices opostos tem, por geometria, o contorno
 * de um hexágono regular — e com o vértice (−1, −1, 1) apontado para cima, é o hexágono de vértice
 * para cima que a marca sempre teve. Dentro dele, as três arestas que saem do vértice da frente
 * desenham um "Y": é nelas, na fileira de pontos colada a elas e no bloco 3×3 de cada quina central,
 * que a animação mora. É o que faz a marca ler como prisma e triângulo, e não como um quadrado de pontos.
 *
 * **Só a aresta não bastava.** Na primeira versão apenas os pontos SOBRE as arestas respiravam, e o
 * "Y" saía como uma linha de uma conta de espessura, sem corpo. Cada ponto das faces da frente sabe a
 * que distância está da aresta central mais próxima: sobre ela respira inteiro, na fileira ao lado
 * respira com peso menor (misturado ao tom de face), e daí para fora fica parado.
 *
 * **E a fileira não fechava a quina.** Em cada face da frente, duas arestas centrais se cruzam no
 * vértice do centro e formam uma quina. O bloco 3×3 junto dela tinha oito pontos respirando e um
 * parado — o da diagonal, a duas fileiras de cada aresta —, e o miolo do "Y" ficava com um furo. Esse
 * bloco respira inteiro agora (`CUBE_CORNER_SPAN`, `CUBE_CORNER_EMPHASIS`).
 *
 * **A respiração acende da borda para o centro, e apaga da borda para o centro.** Cada ponto oscila
 * com um atraso proporcional à distância da quina do contorno, medida AO LONGO da aresta: a quina chega
 * ao pico primeiro, o centro por último — e no apagar, a mesma ordem. O vizinho herda a posição do
 * ponto da aresta mais perto dele, então os dois respiram em fase. E a borda nunca chega à tinta cheia:
 * o pico depende de onde o ponto está, e só o centro alcança o topo da escala.
 *
 * **A projeção é ortográfica, de propósito.** O protótipo usava perspectiva leve, e ela deixa o
 * contorno irregular: os vértices do contorno mais perto do olho saíam ~16% mais longe do centro
 * que os de trás. "Isométrico" é, por definição, sem perspectiva — e sem ela o contorno em repouso
 * é um hexágono REGULAR, que o teste prende.
 *
 * **O movimento é uma precessão, nunca um seno na inclinação.** A normal do cubo descreve um cone de
 * abertura constante com o ângulo avançando linearmente. Um seno pararia nos extremos — o defeito que
 * uma marca anterior teve duas vezes, com o mesmo sintoma: o desenho congela sem erro nenhum.
 *
 * Tudo é DETERMINÍSTICO: não há sorteio nem relógio. O tempo entra por parâmetro. A COR também não
 * mora aqui: cada ponto sai com um `tone` — a posição entre o fundo (0) e a cor do texto (1) —, e
 * quem pinta é que sabe quais são as duas cores.
 */

export interface CubeDot {
  /** Identidade estável do ponto: a ordem da lista muda com a profundidade, o `id` não. */
  id: number
  /**
   * Os índices do ponto na grade do cubo, de 0 a `divisions` em cada eixo. O vértice da frente é
   * `[n, n, n]`; um ponto está numa face da frente quando algum índice vale `n`.
   */
  cell: readonly [number, number, number]
  x: number
  y: number
  /** Profundidade: maior é mais perto do olho. A lista sai ordenada de trás para a frente. */
  depth: number
  radius: number
  /** Posição na escala de tinta, de 0 (o fundo) a 1 (a cor do texto). */
  tone: number
  /**
   * Quanto o ponto respira, de 0 (parado) a 1 (sobre uma aresta central). A fileira colada à aresta e
   * o bloco da quina central ficam no meio; o resto das faces e as faces de trás, em 0.
   */
  emphasis: number
  /**
   * Posição ao longo da aresta central mais próxima: 0 na quina do contorno, 1 no vértice do centro.
   * `null` para os pontos que não respiram.
   */
  centralEdge: number | null
}

export interface IsometricCubeOptions {
  /** Onde a animação está. Uma unidade é um ciclo inteiro da respiração. */
  time?: number
  /** Lado da caixa, em pixels CSS. O cubo fica centrado e inscrito nela. */
  box?: number
  /**
   * Abertura da precessão, em radianos. 0 é o cubo parado pela diagonal, com o contorno regular.
   * Quanto maior, mais volume e menos hexágono — no protótipo, 13° já lia como uma caixa girada.
   */
  tilt?: number
  /** Intervalos por aresta. 4 dá cinco pontos por aresta e 98 no total. */
  divisions?: number
}

/**
 * A escala de tinta da marca. Três famílias, e a hierarquia entre elas não se inverte em instante
 * nenhum: o fantasma (as faces de trás) fica abaixo de tudo; as faces da frente têm um tom fixo que
 * cresce da borda para o centro; e as arestas centrais respiram entre o repouso e o pico — com o pico
 * da quina na metade da tinta, e só o do centro no topo.
 *
 * **O repouso da aresta fica ACIMA de qualquer face.** Na primeira calibragem ele caía na mesma faixa
 * das faces, e no vale da respiração o "Y" sumia: por um instante a marca virava uma grade de pontos
 * apagada, e a 32px no tema escuro quase desaparecia. Com o piso da aresta acima do teto da face, o
 * "Y" nunca some — a marca respira em torno do estado de repouso em vez de se apagar inteira.
 */
export const CUBE_TONE = {
  ghost: 0.14,
  face: { border: 0.24, center: 0.4 },
  edge: {
    rest: { border: 0.44, center: 0.66 },
    peak: { border: 0.5, center: 0.96 },
  },
} as const

/**
 * Quanto respira cada fileira, pela distância em passos da grade até a aresta central mais próxima:
 * sobre a aresta, a respiração inteira; na fileira ao lado, pouco mais da metade — o bastante para o
 * "Y" ganhar corpo sem virar uma mancha que engole as faces.
 */
export const CUBE_EMPHASIS = [1, 0.55] as const

/** Lado, em pontos, do bloco que respira junto à quina central de cada face da frente. */
export const CUBE_CORNER_SPAN = 3

/** Quanto respira o ponto do bloco da quina que a distância à aresta deixaria parado. */
export const CUBE_CORNER_EMPHASIS = 0.55

/** Quanto do ciclo a respiração leva para ir da quina ao centro. */
export const BREATH_LAG = 0.35

/**
 * O instante em que o centro está no pico: o estado para onde a marca sempre volta. É onde a
 * animação começa e o quadro único de quem pediu movimento reduzido.
 */
export const CUBE_REST_TIME = 0.5 + BREATH_LAG

type Vector = readonly [number, number, number]

const TAU = Math.PI * 2
/** Precessão de ~6°: o bastante para dar volume, pouco para o cubo se afastar do estado de repouso. */
const DEFAULT_TILT = 0.1
/** Voltas da precessão por ciclo da respiração. */
const PRECESSION_RATE = 0.3
/** Quanto do lado da caixa o cubo ocupa. Menor que 1 porque ponto tem raio e a precessão afasta os vértices. */
const FILL = 0.86
/** Raio do ponto, como fração do lado da caixa: acompanha o tom, do mais claro ao mais escuro da frente. */
const RADIUS = { min: 0.013, max: 0.036, ghost: 0.012 } as const
/** Uma face conta como visível quando a normal aponta para o olho com alguma folga. */
const FACING_THRESHOLD = 0.02

const lerp = (from: number, to: number, t: number) => from + (to - from) * t
const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const dot3 = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a: Vector, b: Vector): Vector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const normalize3 = (v: Vector): Vector => {
  const length = Math.hypot(v[0], v[1], v[2])
  return [v[0] / length, v[1] / length, v[2] / length]
}

/**
 * A base de vista: a diagonal (1, 1, 1) vai para o olho e o vértice (−1, −1, 1) para cima. `RIGHT`
 * sai do produto vetorial para a base ser destra — x à direita, y para cima, z na direção do olho.
 */
const DIAGONAL = normalize3([1, 1, 1])
const UP = normalize3([-2 / 3, -2 / 3, 4 / 3])
const RIGHT = cross3(UP, DIAGONAL)
const toView = (p: Vector): Vector => [dot3(p, RIGHT), dot3(p, UP), dot3(p, DIAGONAL)]
/** Raio do hexágono do contorno de um cubo de lado 2, visto pela diagonal: a projeção de um vértice. */
const SILHOUETTE_RADIUS = Math.hypot(2 / 3, 2 / 3, 4 / 3)

/** Rodrigues em torno do eixo `(−sen φ, cos φ, 0)`: a peça inclina sem girar em torno do próprio eixo. */
function precess(v: Vector, tilt: number, phi: number): Vector {
  const axis: Vector = [-Math.sin(phi), Math.cos(phi), 0]
  const cos = Math.cos(tilt)
  const sin = Math.sin(tilt)
  const across = cross3(axis, v)
  const along = dot3(axis, v) * (1 - cos)
  return [v[0] * cos + across[0] * sin + axis[0] * along, v[1] * cos + across[1] * sin + axis[1] * along, v[2] * cos + across[2] * sin + axis[2] * along]
}

interface Sample {
  cell: readonly [number, number, number]
  /** Posição já na base de vista e com o contorno de raio 1. */
  view: Vector
  /** Normais das faces a que o ponto pertence (uma, duas na aresta, três no vértice), na base de vista. */
  normals: Vector[]
  /** 1 no centro do desenho, 0 no contorno — medido na pose de repouso, então não varia com a precessão. */
  centrality: number
  /** Quanto o ponto respira, ou 0. */
  emphasis: number
  /** Posição ao longo da aresta central mais próxima, de 0 (quina) a 1 (centro), ou `null`. */
  centralEdge: number | null
}

const samplesByDivisions = new Map<number, Sample[]>()

/**
 * A aresta central mais próxima de uma célula: quantas fileiras a separam dela e em que ponto dela a
 * célula está.
 *
 * As três arestas centrais saem do vértice da frente (`n, n, n`); em cada uma, duas coordenadas ficam
 * no máximo e a terceira corre da quina (0) ao centro (`n`). A distância, em passos da grade, é o maior
 * afastamento das duas coordenadas fixas — sobre uma face da frente, exatamente quantas fileiras
 * separam a célula da aresta.
 *
 * **O desempate é pela SOMA dos afastamentos, e não por qual posição é maior.** Perto do centro duas
 * arestas empatam na distância, e o critério antigo escolhia a de posição maior — que costumava ser a
 * aresta cujo ponto mais próximo é o próprio vértice central, deixando esses pontos em fase com o
 * centro. A soma aponta a aresta que está de fato mais perto, e o ponto respira junto do trecho dela
 * que tem ao lado.
 */
function nearestCentralEdge([i, j, k]: readonly [number, number, number], divisions: number): { steps: number; along: number } {
  let steps = Number.POSITIVE_INFINITY
  let spread = Number.POSITIVE_INFINITY
  let along = 0
  for (const [fixedA, fixedB, running] of [
    [j, k, i],
    [i, k, j],
    [i, j, k],
  ]) {
    const candidateSteps = Math.max(divisions - fixedA, divisions - fixedB)
    const candidateSpread = divisions - fixedA + (divisions - fixedB)
    const candidateAlong = running / divisions
    const closer = candidateSteps < steps || (candidateSteps === steps && candidateSpread < spread)
    const tie = candidateSteps === steps && candidateSpread === spread && candidateAlong > along
    if (closer || tie) {
      steps = candidateSteps
      spread = candidateSpread
      along = candidateAlong
    }
  }
  return { steps, along }
}

/**
 * Os pontos da SUPERFÍCIE do cubo, calculados uma vez por densidade. O miolo fica de fora: ponto
 * interno nunca apareceria e só custaria pintura. Borda e aresta são decididas pelo ÍNDICE, não
 * comparando o valor com ±1 — `-1 + 2·i/n` não garante chegar exato.
 *
 * Só pontos das faces da FRENTE respiram: um ponto de face de trás pode estar "perto" de uma aresta pela
 * conta, mas nunca é visto. O bloco da quina central é o de uma face da frente (algum índice em `n`) com
 * os outros dois índices a menos de `CUBE_CORNER_SPAN` passos do máximo.
 */
function cubeSamples(divisions: number): Sample[] {
  const cached = samplesByDivisions.get(divisions)
  if (cached) return cached
  const coordinate = (i: number) => -1 + (2 * i) / divisions
  const samples: Sample[] = []
  for (let i = 0; i <= divisions; i++) {
    for (let j = 0; j <= divisions; j++) {
      for (let k = 0; k <= divisions; k++) {
        const normals: Vector[] = []
        if (i === 0 || i === divisions) normals.push(toView([i === 0 ? -1 : 1, 0, 0]))
        if (j === 0 || j === divisions) normals.push(toView([0, j === 0 ? -1 : 1, 0]))
        if (k === 0 || k === divisions) normals.push(toView([0, 0, k === 0 ? -1 : 1]))
        if (normals.length === 0) continue
        const cell = [i, j, k] as const
        const { steps, along } = nearestCentralEdge(cell, divisions)
        const onFront = normals.some((normal) => normal[2] > 0)
        const inCorner = onFront && cell.includes(divisions) && cell.every((index) => index > divisions - CUBE_CORNER_SPAN)
        const emphasis = onFront ? Math.max(CUBE_EMPHASIS[steps] ?? 0, inCorner ? CUBE_CORNER_EMPHASIS : 0) : 0
        const view = toView([coordinate(i), coordinate(j), coordinate(k)])
        const unit: Vector = [view[0] / SILHOUETTE_RADIUS, view[1] / SILHOUETTE_RADIUS, view[2] / SILHOUETTE_RADIUS]
        samples.push({ cell, view: unit, normals, centrality: clamp01(1 - Math.hypot(unit[0], unit[1])), emphasis, centralEdge: emphasis > 0 ? along : null })
      }
    }
  }
  samplesByDivisions.set(divisions, samples)
  return samples
}

/**
 * O tom de um ponto da frente. A base é o tom fixo de face; quem respira mistura a ele o tom da aresta,
 * na proporção da ênfase. A aresta oscila (`0.5 − 0.5·cos`, lenta nos extremos, como um fôlego) com
 * atraso: o ponto da quina acende e apaga antes, o do centro depois — e o atraso espalha as pausas pela
 * aresta, então o desenho como um todo não para.
 */
function toneOf(sample: Sample, time: number): number {
  const face = lerp(CUBE_TONE.face.border, CUBE_TONE.face.center, sample.centrality)
  if (sample.centralEdge === null) return face
  const position = sample.centralEdge
  const breath = 0.5 - 0.5 * Math.cos(TAU * (time - BREATH_LAG * position))
  const rest = lerp(CUBE_TONE.edge.rest.border, CUBE_TONE.edge.rest.center, position)
  const peak = lerp(CUBE_TONE.edge.peak.border, CUBE_TONE.edge.peak.center, position)
  return lerp(face, lerp(rest, peak, breath), sample.emphasis)
}

/**
 * O cubo inteiro num instante, SEMPRE com a mesma quantidade de pontos, ordenado de trás para a
 * frente — a ordem em que se pinta, para o ponto da frente cobrir o de trás.
 */
export function isometricCube({ time = CUBE_REST_TIME, box = 24, tilt = DEFAULT_TILT, divisions = 4 }: IsometricCubeOptions = {}): CubeDot[] {
  const phi = TAU * time * PRECESSION_RATE
  const center = box / 2
  const reach = center * FILL
  const toneSpan = CUBE_TONE.edge.peak.center - CUBE_TONE.face.border
  const dots = cubeSamples(divisions).map((sample, id): CubeDot => {
    const [x, y, depth] = precess(sample.view, tilt, phi)
    const position = { id, cell: sample.cell, x: center + x * reach, y: center - y * reach, depth, emphasis: sample.emphasis, centralEdge: sample.centralEdge }
    const facing = sample.normals.some((normal) => precess(normal, tilt, phi)[2] > FACING_THRESHOLD)
    if (!facing) return { ...position, radius: box * RADIUS.ghost, tone: CUBE_TONE.ghost }
    const tone = toneOf(sample, time)
    // Tamanho e tinta dizem a mesma coisa: ponto mais escuro, ponto maior.
    const weight = clamp01((tone - CUBE_TONE.face.border) / toneSpan)
    return { ...position, radius: box * lerp(RADIUS.min, RADIUS.max, weight), tone }
  })
  return dots.sort((a, b) => a.depth - b.depth)
}
