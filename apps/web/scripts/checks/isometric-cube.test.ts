import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BREATH_LAG, CUBE_CORNER_EMPHASIS, CUBE_CORNER_SPAN, CUBE_EMPHASIS, CUBE_REST_TIME, CUBE_TONE, type CubeDot, isometricCube } from '@/lib/isometric-cube'
import { read, stripComments } from './support/source-fields'

/**
 * A marca animada da barra lateral e da tela de entrada: um cubo de pontos visto pela diagonal, que
 * respira pelas três arestas centrais, pelos pontos ao lado delas e pelo bloco 3×3 de cada quina central.
 *
 * O que ela precisa manter, e nenhum outro teste vê: o contorno em repouso é um HEXÁGONO REGULAR de
 * vértice para cima (é a identidade da marca); só o "Y", a fileira colada a ele e as quinas centrais
 * animam; a respiração acende e apaga DA BORDA PARA O CENTRO; a borda nunca chega à tinta cheia; e o
 * desenho NUNCA para — uma marca anterior congelou duas vezes por um seno com derivada zero, sem erro
 * nenhum na tela.
 */
const BOX = 32
const CENTER = BOX / 2
const DIVISIONS = 4

/** Lados do fecho convexo dos centros dos pontos, sem contar pontos colineares. */
function outlineSides(dots: CubeDot[]): { sides: number; hull: [number, number][] } {
  const points = [...new Map(dots.map((dot) => [`${dot.x.toFixed(6)},${dot.y.toFixed(6)}`, [dot.x, dot.y] as [number, number]])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const turn = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const chain = (list: [number, number][]) => {
    const hull: [number, number][] = []
    for (const point of list) {
      while (hull.length >= 2 && turn(hull[hull.length - 2], hull[hull.length - 1], point) <= 1e-9) hull.pop()
      hull.push(point)
    }
    hull.pop()
    return hull
  }
  const hull = [...chain(points), ...chain([...points].reverse())]
  return { sides: hull.length, hull }
}

/** Os instantes de um ciclo inteiro, amostrados. */
const cycle = (samples: number) => Array.from({ length: samples }, (_, i) => i / samples)

/** O tom de um ponto, pelo `id`, ao longo do ciclo. */
const toneTrack = (id: number, times: number[]) => times.map((time) => isometricCube({ box: BOX, time }).find((dot) => dot.id === id)?.tone ?? Number.NaN)

/** O teto de tinta de um ponto: o tom de face, ou o pico da posição dele na aresta, o que for maior. */
const ceilingOf = (dot: CubeDot) => {
  if (dot.centralEdge === null) return CUBE_TONE.face.center
  const peak = CUBE_TONE.edge.peak.border + (CUBE_TONE.edge.peak.center - CUBE_TONE.edge.peak.border) * dot.centralEdge
  return Math.max(CUBE_TONE.face.center, peak)
}

/** Se a célula está no bloco da quina central de alguma face da frente. */
const inCornerBlock = (dot: CubeDot) => dot.cell.includes(DIVISIONS) && dot.cell.every((index) => index > DIVISIONS - CUBE_CORNER_SPAN)

/** O ponto do bloco da quina que a distância à aresta deixaria parado: o da diagonal, a duas fileiras de cada aresta. */
const isCornerDiagonal = (dot: CubeDot) => inCornerBlock(dot) && dot.cell.filter((index) => index === DIVISIONS - (CUBE_CORNER_SPAN - 1)).length === 2

describe('o cubo é DETERMINÍSTICO', () => {
  it('o mesmo instante devolve o mesmo desenho', () => {
    assert.deepEqual(isometricCube({ box: BOX, time: 0.37 }), isometricCube({ box: BOX, time: 0.37 }))
  })

  it('e não há sorteio nem relógio na fonte', () => {
    // Teste de FONTE porque o comportamento não distingue: um `Math.random` chamado uma vez por
    // montagem passaria no teste acima dentro da mesma execução.
    const source = stripComments(read('apps/web/src/lib/isometric-cube.ts'))
    assert.doesNotMatch(source, /Math\.random/, 'sorteio quebra a reprodutibilidade')
    assert.doesNotMatch(source, /Date\.now|new Date|performance\.now/, 'o tempo entra por parâmetro, não pelo relógio')
  })
})

describe('os pontos são sempre os mesmos, e saem na ordem de pintura', () => {
  it('são sempre (n + 1)³ − (n − 1)³ pontos: só a superfície do cubo', () => {
    // O miolo nunca apareceria. Com 4 intervalos por aresta são 125 − 27 = 98.
    for (const divisions of [2, 4, 5]) {
      for (const time of [0, 0.3, 0.9]) {
        assert.equal(isometricCube({ box: BOX, time, divisions }).length, (divisions + 1) ** 3 - (divisions - 1) ** 3, `${divisions} intervalos em t=${time}`)
      }
    }
  })

  it('cada `id` aparece uma vez, em qualquer instante, e cada célula também', () => {
    // A ordem da lista muda com a profundidade; é o `id` que liga um quadro ao seguinte.
    const dots = isometricCube({ box: BOX, time: 0.61 })
    assert.equal(new Set(dots.map((dot) => dot.id)).size, dots.length)
    assert.equal(new Set(dots.map((dot) => dot.cell.join())).size, dots.length)
  })

  it('a lista vem de trás para a frente', () => {
    // É a ordem de pintura: com cor sólida, o ponto da frente precisa vir depois para cobrir o de trás.
    for (const time of [0, 0.25, 0.7]) {
      const depths = isometricCube({ box: BOX, time }).map((dot) => dot.depth)
      assert.ok(
        depths.every((depth, i) => i === 0 || depths[i - 1] <= depth),
        `fora de ordem em t=${time}`,
      )
    }
  })
})

describe('em repouso, o contorno é um HEXÁGONO REGULAR de vértice para cima', () => {
  const rest = isometricCube({ box: BOX, tilt: 0 })

  it('o fecho convexo tem seis lados, todos os vértices à mesma distância do centro', () => {
    // Regular, e não só hexagonal: com perspectiva os vértices mais perto do olho saíam ~16% mais
    // longe do centro, e o contorno virava um triângulo arredondado. A projeção é ortográfica por isso.
    const { sides, hull } = outlineSides(rest)
    assert.equal(sides, 6, `contorno com ${sides} lados`)
    const distances = hull.map(([x, y]) => Math.hypot(x - CENTER, y - CENTER))
    assert.ok(Math.max(...distances) - Math.min(...distances) < 1e-6, 'vértices do contorno a distâncias diferentes do centro')
  })

  it('o ponto mais alto está sobre o eixo vertical do centro', () => {
    // A diferença entre vértice para cima e lado para cima: um descuido na base de vista gira a marca 30°.
    const top = rest.reduce((a, b) => (a.y <= b.y ? a : b))
    assert.ok(Math.abs(top.x - CENTER) < 1e-9, `o ponto mais alto está deslocado: x=${top.x}`)
  })

  it('é espelhado da esquerda para a direita', () => {
    const keyOf = (x: number, y: number) => `${x.toFixed(6)},${y.toFixed(6)}`
    const positions = new Set(rest.map((dot) => keyOf(dot.x, dot.y)))
    for (const dot of rest) assert.ok(positions.has(keyOf(2 * CENTER - dot.x, dot.y)), `sem espelho para (${dot.x}, ${dot.y})`)
  })

  it('as três faces de trás ficam em tom fantasma: 98 − 61 = 37 pontos', () => {
    // As três faces da frente somam 3·25 − 3·5 + 1 = 61 pontos (as arestas que dividem e o vértice
    // comum contam uma vez). O resto é o que só pertence às faces de trás.
    const ghosts = rest.filter((dot) => dot.tone === CUBE_TONE.ghost)
    assert.equal(ghosts.length, 37)
  })

  it('respiram 37 pontos: 13 sobre as arestas, 21 na fileira ao lado e 3 que fecham as quinas', () => {
    // Sobre as arestas: cinco por aresta, com o vértice do centro compartilhado — 3·5 − 2. Na fileira
    // colada: em cada face da frente, a fileira em "L" ao lado das duas arestas que ela contém — 2·4 − 1.
    // E em cada face, o ponto da diagonal do bloco da quina, que a distância deixaria parado.
    const breathing = rest.filter((dot) => dot.emphasis > 0)
    assert.equal(rest.filter((dot) => dot.emphasis === CUBE_EMPHASIS[0]).length, 13)
    assert.equal(breathing.filter((dot) => dot.emphasis < 1 && !isCornerDiagonal(dot)).length, 21)
    assert.equal(breathing.filter(isCornerDiagonal).length, 3)
    assert.equal(breathing.length, 37)
    assert.ok(
      breathing.every((dot) => dot.tone !== CUBE_TONE.ghost),
      'um ponto que respira está numa face de trás',
    )
    const hub = breathing.filter((dot) => dot.centralEdge === 1 && dot.emphasis === CUBE_EMPHASIS[0])
    assert.equal(hub.length, 1)
    assert.ok(Math.hypot(hub[0].x - CENTER, hub[0].y - CENTER) < 1e-9, 'o vértice da frente não está no centro')
  })

  it('o bloco 3×3 de cada quina central respira INTEIRO', () => {
    // Três faces da frente, nove pontos cada, e as arestas centrais que elas dividem contando uma vez só:
    // 3·9 − 3·3 + 1 = 19. Sem o bloco, o miolo do "Y" ficava com um furo em cada face.
    const block = rest.filter(inCornerBlock)
    assert.equal(block.length, 19)
    for (const dot of block) assert.ok(dot.emphasis > 0, `a célula ${dot.cell.join()} do bloco da quina está parada`)
    for (const dot of rest.filter(isCornerDiagonal)) assert.equal(dot.emphasis, CUBE_CORNER_EMPHASIS)
  })

  it('a fileira ao lado fica mais perto da aresta do que o resto da face', () => {
    // Prende o SENTIDO da distância: com a conta invertida, a ênfase cairia na borda do contorno, longe do "Y".
    const edge = rest.filter((dot) => dot.emphasis === CUBE_EMPHASIS[0])
    const nearestEdge = (dot: CubeDot) => Math.min(...edge.map((other) => Math.hypot(dot.x - other.x, dot.y - other.y)))
    const beside = rest.filter((dot) => dot.emphasis > 0 && dot.emphasis < 1 && !isCornerDiagonal(dot)).map(nearestEdge)
    const still = rest.filter((dot) => dot.emphasis === 0 && dot.tone !== CUBE_TONE.ghost).map(nearestEdge)
    assert.ok(Math.max(...beside) < Math.min(...still) + 1e-9, 'um ponto parado está mais perto do "Y" que um da fileira ao lado')
  })

  it('o ponto que fecha a quina respira junto do MEIO das arestas, não do centro', () => {
    // Ele está a duas fileiras de duas arestas ao mesmo tempo. O desempate antigo o colocava em fase com
    // o vértice central; o certo é a altura dele na aresta — a metade, com 4 intervalos.
    for (const dot of rest.filter(isCornerDiagonal)) assert.equal(dot.centralEdge, (DIVISIONS - (CUBE_CORNER_SPAN - 1)) / DIVISIONS)
  })
})

describe('a RESPIRAÇÃO', () => {
  const times = cycle(400)

  it('só o "Y", a fileira ao lado e as quinas animam: o resto das faces e o fantasma têm tom fixo', () => {
    // Se as faces inteiras pulsassem, a marca voltaria a ler como um quadrado de pontos acendendo inteiro.
    const frames = [0, 0.13, 0.4, 0.77].map((time) => new Map(isometricCube({ box: BOX, time }).map((dot) => [dot.id, dot])))
    for (const [id, dot] of frames[0]) {
      if (dot.emphasis > 0) continue
      for (const frame of frames) assert.equal(frame.get(id)?.tone, dot.tone, `o ponto parado ${id} mudou de tom`)
    }
  })

  it('a fileira ao lado respira menos que a aresta, e em fase com ela', () => {
    // Menos amplitude é o que dá corpo sem virar mancha; em fase é o que faz os dois lerem como um traço só.
    const dots = isometricCube({ box: BOX, time: 0 })
    const edgeDot = dots.find((dot) => dot.emphasis === CUBE_EMPHASIS[0] && dot.centralEdge === 0.5)
    const besideDot = dots.find((dot) => dot.emphasis === CUBE_EMPHASIS[1] && dot.centralEdge === 0.5 && !isCornerDiagonal(dot))
    if (!edgeDot || !besideDot) throw new Error('faltam pontos na metade de uma aresta central')
    const edgeTrack = toneTrack(edgeDot.id, times)
    const besideTrack = toneTrack(besideDot.id, times)
    const swing = (track: number[]) => Math.max(...track) - Math.min(...track)
    assert.ok(swing(besideTrack) < swing(edgeTrack), 'a fileira ao lado respira tanto quanto a aresta')
    assert.ok(swing(besideTrack) > 0, 'a fileira ao lado não respira')
    const peakAt = (track: number[]) => times[track.indexOf(Math.max(...track))]
    assert.ok(Math.abs(peakAt(besideTrack) - peakAt(edgeTrack)) < 1e-9, 'a fileira ao lado respira fora de fase')
  })

  it('a borda nunca chega à tinta cheia: o teto cresce da quina ao centro', () => {
    for (const time of cycle(60)) {
      for (const dot of isometricCube({ box: BOX, time })) {
        if (dot.tone === CUBE_TONE.ghost) continue
        assert.ok(dot.tone <= ceilingOf(dot) + 1e-9, `o ponto ${dot.id} passou do teto: ${dot.tone.toFixed(3)} > ${ceilingOf(dot).toFixed(3)}`)
      }
    }
    assert.ok(CUBE_TONE.edge.peak.border <= 0.5, 'a quina não pode passar da metade da tinta')
  })

  it('o repouso da aresta fica acima de qualquer face: o "Y" nunca some', () => {
    // No vale da respiração a aresta desce ao repouso. Se ele caísse na faixa das faces, o "Y" sumiria.
    assert.ok(CUBE_TONE.edge.rest.border > CUBE_TONE.face.center, 'o repouso da quina cai na faixa das faces')
    for (const time of cycle(60)) {
      const dots = isometricCube({ box: BOX, time })
      const brightestFace = Math.max(...dots.filter((dot) => dot.emphasis === 0 && dot.tone !== CUBE_TONE.ghost).map((dot) => dot.tone))
      const dimmestEdge = Math.min(...dots.filter((dot) => dot.emphasis === CUBE_EMPHASIS[0]).map((dot) => dot.tone))
      assert.ok(dimmestEdge > brightestFace, `em t=${time.toFixed(2)} a aresta ficou abaixo de uma face`)
    }
  })

  it('acende primeiro na quina e só depois no centro — e apaga na mesma ordem', () => {
    // O atraso é o que faz a respiração "caminhar" da borda para o centro. Com o sinal trocado ela
    // começaria no centro, que é o oposto do pedido.
    const dots = isometricCube({ box: BOX, time: 0 })
    const corner = dots.find((dot) => dot.emphasis === CUBE_EMPHASIS[0] && dot.centralEdge === 0.25)
    const hub = dots.find((dot) => dot.emphasis === CUBE_EMPHASIS[0] && dot.centralEdge === 1)
    if (!corner || !hub) throw new Error('faltam pontos nas arestas centrais')
    const peakAt = (track: number[]) => times[track.indexOf(Math.max(...track))]
    const valleyAt = (track: number[]) => times[track.indexOf(Math.min(...track))]
    const cornerTrack = toneTrack(corner.id, times)
    const hubTrack = toneTrack(hub.id, times)
    assert.ok(peakAt(cornerTrack) < peakAt(hubTrack), 'o centro acendeu antes da borda')
    assert.ok(valleyAt(cornerTrack) < valleyAt(hubTrack), 'o centro apagou antes da borda')
    assert.ok(Math.abs(peakAt(hubTrack) - peakAt(cornerTrack) - BREATH_LAG * 0.75) < 0.01, 'o atraso entre a borda e o centro não é o declarado')
  })

  it('o instante de repouso é o pico do centro', () => {
    // É onde a animação começa e o quadro de quem pediu movimento reduzido: o estado para onde a marca volta.
    const hub = isometricCube({ box: BOX, time: CUBE_REST_TIME }).find((dot) => dot.emphasis === CUBE_EMPHASIS[0] && dot.centralEdge === 1)
    assert.ok(hub && Math.abs(hub.tone - CUBE_TONE.edge.peak.center) < 1e-9, `o centro não está no pico: ${hub?.tone}`)
  })
})

describe('movimento e limites', () => {
  it('a precessão escolhida não troca face de lado', () => {
    // As faces de trás nunca chegam a olhar para o olho. Se chegassem, pontos saltariam entre o
    // fantasma e a frente e o desenho piscaria — este teste acusa se a abertura crescer demais.
    const ghostIds = (time: number) =>
      isometricCube({ box: BOX, time })
        .filter((dot) => dot.tone === CUBE_TONE.ghost)
        .map((dot) => dot.id)
        .sort((a, b) => a - b)
    const atRest = ghostIds(0)
    for (let i = 1; i <= 40; i++) assert.deepEqual(ghostIds(i / 13), atRest, `faces trocaram em t=${(i / 13).toFixed(2)}`)
  })

  it('todo ponto cabe na caixa com o próprio raio, em toda a precessão', () => {
    for (let i = 0; i <= 60; i++) {
      for (const dot of isometricCube({ box: BOX, time: i / 20 })) {
        assert.ok(dot.x - dot.radius >= 0 && dot.x + dot.radius <= BOX, `sai pela lateral: x=${dot.x}`)
        assert.ok(dot.y - dot.radius >= 0 && dot.y + dot.radius <= BOX, `sai por cima ou por baixo: y=${dot.y}`)
      }
    }
  })

  it('o cubo NUNCA para: nenhum quadro muda muito menos que os outros', () => {
    // A razão entre o quadro que mais muda e o que menos muda, comparando cada ponto pelo `id`. Cada
    // ponto respira devagar nos extremos, mas os atrasos espalham essas pausas pela aresta e a precessão
    // não para; um seno na inclinação levaria a razão para as dezenas.
    const step = 1 / 240
    const byId = (time: number) => new Map(isometricCube({ box: BOX, time }).map((dot) => [dot.id, dot]))
    const changes: number[] = []
    for (let i = 0; i < 480; i++) {
      const before = byId(i * step)
      const after = byId((i + 1) * step)
      let total = 0
      for (const [id, dot] of before) {
        const next = after.get(id)
        if (!next) throw new Error(`o ponto ${id} sumiu`)
        total += Math.abs(dot.x - next.x) + Math.abs(dot.y - next.y) + Math.abs(dot.radius - next.radius) + Math.abs(dot.tone - next.tone)
      }
      changes.push(total)
    }
    const ratio = Math.max(...changes) / Math.min(...changes)
    assert.ok(ratio < 3, `o cubo estaciona: razão de ${ratio.toFixed(2)}× entre o quadro mais rápido e o mais lento`)
  })
})
