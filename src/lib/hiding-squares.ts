/**
 * "Hiding squares": uma grade de quadrados que encolhem e somem conforme um campo de ruído.
 *
 * Implementação própria, escrita a partir da ideia visual — nenhum código de terceiro entrou
 * aqui. O gerador que inspirou o efeito não publica licença, e "a ferramenta é gratuita" não
 * é o mesmo que "o código é redistribuível"; a geometria, por outro lado, é simples o
 * bastante para caber em cinquenta linhas.
 *
 * Tudo é DETERMINÍSTICO: a mesma semente devolve sempre a mesma grade. Não há `Math.random`
 * em lugar nenhum, o que é o que permite animar (a forma só muda porque `noiseScale` muda) e
 * o que impede o padrão de piscar diferente a cada montagem do componente.
 */

/** Um quadrado já posicionado na caixa do SVG. `size` 0 significa escondido. */
export interface HidingSquare {
  x: number
  y: number
  size: number
}

export interface HidingSquaresOptions {
  /** Células por lado. */
  grid: number
  /**
   * Quanto o campo de ruído anda a cada célula. É o parâmetro que a animação move: valores
   * pequenos dão manchas grandes e lentas, valores grandes picotam a grade.
   */
  noiseScale: number
  /** Abaixo disto a célula some. 0 mostra tudo, 1 esconde tudo. */
  threshold: number
  /** A mesma semente devolve sempre o mesmo padrão. */
  seed: number
  /** Lado da caixa de coordenadas. 24 é a do lucide, e é o que faz o ícone alinhar com os outros. */
  box?: number
  /** Respiro entre células, como fração da célula. */
  gap?: number
}

/**
 * Um número em [0,1) a partir de três inteiros. É hash, não gerador de aleatório: o mesmo
 * trio devolve sempre o mesmo valor, que é o que torna o ruído reprodutível.
 *
 * `Math.imul` porque a multiplicação normal de JS perde precisão acima de 2^53 e a mistura
 * de bits deixaria de misturar.
 */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374_761_393) ^ Math.imul(y, 668_265_263) ^ Math.imul(seed, 1_274_126_177)
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177)
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296
}

/**
 * Ruído de valor: sorteia nos cantos inteiros e interpola suavemente entre eles.
 *
 * A curva `t²(3−2t)` (smoothstep) é o que faz a animação não ter solavanco — com interpolação
 * linear, a derivada salta ao cruzar cada canto da grade e os quadrados mudam de tamanho aos
 * trancos quando `noiseScale` varia.
 */
function noise2d(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const u = (x - xi) * (x - xi) * (3 - 2 * (x - xi))
  const v = (y - yi) * (y - yi) * (3 - 2 * (y - yi))
  const a = hash(xi, yi, seed)
  const b = hash(xi + 1, yi, seed)
  const c = hash(xi, yi + 1, seed)
  const d = hash(xi + 1, yi + 1, seed)
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v
}

/**
 * A grade inteira, SEMPRE com `grid × grid` itens na mesma ordem.
 *
 * Quadrado escondido sai com `size: 0` em vez de sair da lista. Parece desperdício e não é:
 * é o que mantém a contagem e a ordem estáveis entre um quadro e o outro, e sem isso a
 * animação não poderia escrever atributos em nós já montados — teria de remontar a árvore a
 * cada quadro.
 */
export function hidingSquares({ grid, noiseScale, threshold, seed, box = 24, gap = 0.16 }: HidingSquaresOptions): HidingSquare[] {
  const cell = box / grid
  const squares: HidingSquare[] = []
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const n = noise2d(col * noiseScale, row * noiseScale, seed)
      // Normaliza o que sobrou acima do corte para 0..1, então o quadrado nasce do nada e
      // cresce — em vez de aparecer já grande no instante em que cruza o limiar.
      const strength = threshold >= 1 ? 0 : Math.max(0, Math.min(1, (n - threshold) / (1 - threshold)))
      const size = cell * (1 - gap) * strength
      squares.push({ x: col * cell + (cell - size) / 2, y: row * cell + (cell - size) / 2, size })
    }
  }
  return squares
}

/**
 * Os vértices de um polígono REGULAR de `sides` lados, prontos para o `points` de um
 * `<polygon>`, escalados para caber na caixa sem deformar.
 *
 * Uma função para todas as formas em vez de uma por forma: a diferença entre hexágono e
 * octógono aqui é um número e um ângulo, e duas funções divergiriam no primeiro ajuste de
 * caixa. A escala usa o MAIOR semi-eixo dos vértices, então a forma toca a caixa no lado
 * mais largo e continua regular — dividir X e Y por eixos diferentes preencheria a caixa
 * inteira, mas achataria o polígono.
 *
 * `rotation` está em radianos e o ângulo zero aponta para a direita. Duas orientações
 * interessam: `-Math.PI / 2` põe um vértice para cima (hexágono "de ponta"), e `Math.PI /
 * sides` põe um LADO para cima — que é o que faz um octógono virar o quadrado chanfrado
 * clássico.
 *
 * `inset` encolhe a forma mantendo o CENTRO na caixa. Ele existe para o traço: um `stroke` é
 * centrado no caminho, então metade dele cai para fora — sem recuo de pelo menos meia
 * espessura, a borda de cima e a de baixo são cortadas pelo `viewBox`. Encolher passando um
 * `box` menor não serviria: a forma sairia centrada na caixa menor, deslocada do padrão.
 */
export function polygonPoints(sides: number, { box = 24, rotation = -Math.PI / 2, inset = 0 }: { box?: number; rotation?: number; inset?: number } = {}): string {
  const vertices = Array.from({ length: sides }, (_, i) => {
    const angle = rotation + (i * 2 * Math.PI) / sides
    return [Math.cos(angle), Math.sin(angle)] as const
  })
  const half = box / 2
  const radius = half - inset
  const reach = Math.max(...vertices.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))))
  return vertices.map(([x, y]) => `${(half + (x * radius) / reach).toFixed(3)},${(half + (y * radius) / reach).toFixed(3)}`).join(' ')
}
