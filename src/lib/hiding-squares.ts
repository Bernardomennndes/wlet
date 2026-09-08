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
  /**
   * Onde amostrar no eixo do TEMPO. Avançar isto linearmente faz o campo se transformar no
   * lugar, em velocidade constante e sem nunca voltar por onde passou — que é o que oscilar
   * um escalar não consegue dar.
   */
  time?: number
  /**
   * Lado da caixa de coordenadas.
   *
   * 24 é herança do lucide, que o app não usa mais — o Phosphor desenha numa caixa de 256. A
   * medida NÃO precisa casar: `viewBox` é interno ao SVG e o tamanho na tela vem da classe do
   * botão, então os dois alinham do mesmo jeito. O que importa é a proporção que a forma ocupa
   * dentro da própria caixa, e essa foi calibrada por medição (ver o docblock do componente).
   */
  box?: number
  /** Respiro entre células, como fração da célula. */
  gap?: number
}

/**
 * Um número em [0,1) a partir de quatro inteiros. É hash, não gerador de aleatório: a mesma
 * combinação devolve sempre o mesmo valor, que é o que torna o ruído reprodutível.
 *
 * `Math.imul` porque a multiplicação normal de JS perde precisão acima de 2^53 e a mistura
 * de bits deixaria de misturar.
 */
function hash(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 374_761_393) ^ Math.imul(y, 668_265_263) ^ Math.imul(z, 2_246_822_519) ^ Math.imul(seed, 1_274_126_177)
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177)
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/**
 * Ruído de valor em TRÊS dimensões: sorteia nos oito cantos do cubo inteiro e interpola.
 *
 * A terceira dimensão é o TEMPO, e ela existe para a animação poder fluir. Enquanto o
 * movimento vinha de oscilar `noiseScale` com um seno, o padrão parava duas vezes por ciclo:
 * seno tem derivada zero nos picos, e medindo a mudança por quadro ela caía de 0,92 para
 * 0,005 — uma parada de 177×, visível a olho. Pior, entre as paradas o padrão refazia o
 * próprio caminho, porque ida e volta percorrem os mesmos valores. Avançando por `z`, a
 * amostra nunca inverte e nunca se repete.
 *
 * **O eixo do tempo interpola LINEARMENTE; só x e y usam smoothstep.** Não é descuido, é a
 * correção do defeito: smoothstep tem derivada zero em 0 e em 1, então interpolar o tempo com
 * ela faz a amostra parar a cada nó da grade do ruído. Medido, a mudança por quadro variava
 * 328× ao longo do tempo — o padrão congelava a cada seis segundos. Linear no tempo dá
 * velocidade constante entre nós; a razão cai para 1,3×.
 *
 * Em x e y a smoothstep fica, porque ali não há movimento: a derivada nos nós só afeta a
 * aparência estática do campo, e sem ela o padrão ganharia arestas visíveis.
 */
function noise3d(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const u = smooth(x - xi)
  const v = smooth(y - yi)
  const w = z - zi
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const face = (dz: number) => lerp(lerp(hash(xi, yi, zi + dz, seed), hash(xi + 1, yi, zi + dz, seed), u), lerp(hash(xi, yi + 1, zi + dz, seed), hash(xi + 1, yi + 1, zi + dz, seed), u), v)
  return lerp(face(0), face(1), w)
}

/**
 * A grade inteira, SEMPRE com `grid × grid` itens na mesma ordem.
 *
 * Quadrado escondido sai com `size: 0` em vez de sair da lista. Parece desperdício e não é:
 * é o que mantém a contagem e a ordem estáveis entre um quadro e o outro, e sem isso a
 * animação não poderia escrever atributos em nós já montados — teria de remontar a árvore a
 * cada quadro.
 */
export function hidingSquares({ grid, noiseScale, threshold, seed, time = 0, box = 24, gap = 0.16 }: HidingSquaresOptions): HidingSquare[] {
  const cell = box / grid
  const squares: HidingSquare[] = []
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      // Todas as células compartilham o mesmo `z`, e isso é deliberado. Dar a cada uma um
      // deslocamento próprio no tempo dessincroniza os nós do ruído e melhora a métrica de
      // fluidez (1,8× para 1,4×) — mas destrói a coerência espacial: vizinhas passam a
      // amostrar pontos sem relação, o campo deixa de ser campo e o padrão vira chuvisco
      // uniforme. Foi tentado e medido. 1,8× já é uma variação que não tem parada nenhuma.
      const n = noise3d(col * noiseScale, row * noiseScale, time, seed)
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
