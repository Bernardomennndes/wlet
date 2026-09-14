import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hidingSquares, polygonPoints } from '@/lib/hiding-squares'
import { read, stripComments } from './support/source-fields'

/**
 * O padrão animado do cabeçalho — e ele não é "só decoração".
 *
 * O módulo carrega DOIS defeitos que já foram medidos e corrigidos, e os dois têm o mesmo
 * sintoma: o padrão PARA. Ninguém abre um chamado por causa disso — não há erro, nada quebra, e a
 * pessoa só sente que a tela está travando. É o tipo de regressão que volta na primeira
 * "simplificação" bem-intencionada.
 *
 * 1. O movimento vinha de oscilar `noiseScale` com um seno, e seno tem derivada zero nos picos: o
 *    padrão parava duas vezes por ciclo, e entre as paradas refazia o próprio caminho.
 * 2. Corrigido para avançar no eixo do TEMPO, a interpolação desse eixo continuava usando
 *    smoothstep — que também tem derivada zero nas pontas —, e aí ele congelava a cada nó da
 *    grade do ruído.
 *
 * O teste de fluidez abaixo é a forma executável dessa medição, e ele separa os dois estados com
 * folga: hoje a razão entre o quadro que mais muda e o que menos muda é 3,9×; com smoothstep no
 * tempo ela vai a 49×.
 */
const OPCOES = { grid: 7, noiseScale: 0.55, threshold: 0.42, seed: 7 }

describe('o padrão é DETERMINÍSTICO', () => {
  it('a mesma semente devolve a mesma grade', () => {
    // É o que permite animar mexendo só no tempo, e o que impede o padrão de piscar diferente a
    // cada montagem do componente.
    assert.deepEqual(hidingSquares(OPCOES), hidingSquares(OPCOES))
  })

  it('sementes diferentes desenham grades diferentes', () => {
    assert.notDeepEqual(hidingSquares(OPCOES), hidingSquares({ ...OPCOES, seed: 8 }))
  })

  it('e não há sorteio nenhum na fonte', () => {
    // Teste de FONTE porque o comportamento não distingue: um `Math.random` chamado uma vez por
    // montagem passaria nos dois testes acima dentro da mesma execução, e só apareceria ao
    // recarregar a página — onde nenhum teste olha.
    const source = stripComments(read('apps/web/src/lib/hiding-squares.ts'))
    assert.doesNotMatch(source, /Math\.random/, 'sorteio quebra a reprodutibilidade do padrão')
    assert.doesNotMatch(source, /Date\.now|new Date/, 'o tempo entra por parâmetro, não pelo relógio')
  })
})

describe('a grade não muda de tamanho nem de ordem', () => {
  it('são sempre `grid × grid` itens, mesmo com tudo escondido', () => {
    // Quadrado escondido sai com `size: 0` em vez de sair da lista: é o que mantém contagem e
    // ordem estáveis entre quadros, e sem isso a animação teria de remontar a árvore a cada um.
    assert.equal(hidingSquares(OPCOES).length, 49)
    const tudoEscondido = hidingSquares({ ...OPCOES, threshold: 1 })
    assert.equal(tudoEscondido.length, 49, 'a lista não encolhe')
    assert.ok(
      tudoEscondido.every((q) => q.size === 0),
      'escondido é tamanho zero',
    )
  })

  it('limiar em 1 não vira divisão por zero', () => {
    // O que este teste garante é o RESULTADO — nada de Infinity ou NaN chegando ao SVG, onde
    // viram atributo inválido e o navegador descarta o nó em silêncio.
    //
    // Fica dito o que a mutação mostrou: a guarda `threshold >= 1 ? 0 :` do módulo é REDUNDANTE
    // hoje. Tirada, `(n - 1) / 0` dá -Infinity para todo `n < 1`, e o `Math.max(0, Math.min(1, …))`
    // logo abaixo já o traz para zero. Ela só passaria a valer se o ruído devolvesse 1 exato —
    // `0 / 0` é NaN, e NaN atravessa os dois clamps —, e o `hash` devolve [0,1). É guarda contra
    // um estado que a fonte do número não produz.
    assert.ok(hidingSquares({ ...OPCOES, threshold: 1 }).every((q) => Number.isFinite(q.size) && Number.isFinite(q.x) && Number.isFinite(q.y)))
  })

  it('quanto maior o limiar, menos quadrados aparecem', () => {
    const visiveis = (threshold: number) => hidingSquares({ ...OPCOES, threshold }).filter((q) => q.size > 0).length
    assert.ok(visiveis(0.1) > visiveis(0.6), 'o limiar corta de fato')
    assert.equal(visiveis(1), 0)
  })

  it('cada quadrado fica CENTRADO na própria célula', () => {
    // O quadrado nasce do nada e cresce a partir do centro. Ancorado num canto, ele deslizaria
    // enquanto muda de tamanho, e a grade pareceria tremer.
    const cell = 24 / 7
    for (const [i, q] of hidingSquares(OPCOES).entries()) {
      const col = i % 7
      const row = Math.floor(i / 7)
      assert.ok(Math.abs(q.x + q.size / 2 - (col * cell + cell / 2)) < 1e-9, `coluna ${col}`)
      assert.ok(Math.abs(q.y + q.size / 2 - (row * cell + cell / 2)) < 1e-9, `linha ${row}`)
      assert.ok(q.size <= cell * (1 - 0.16) + 1e-9, 'o respiro entre células é preservado')
    }
  })
})

describe('o padrão NUNCA para', () => {
  it('nenhum quadro muda muito menos que os outros', () => {
    // A medição que os dois defeitos produziram, virada teste. A razão entre o quadro que mais
    // muda e o que menos muda é 3,9× hoje; com smoothstep no eixo do tempo ela vai a 49×, e o
    // olho lê isso como congelar a cada poucos segundos. O corte em 10 fica longe dos dois.
    const passo = 0.04
    const mudancas: number[] = []
    for (let i = 0; i < 200; i++) {
      const before = hidingSquares({ ...OPCOES, time: i * passo })
      const after = hidingSquares({ ...OPCOES, time: (i + 1) * passo })
      mudancas.push(before.reduce((total, q, k) => total + Math.abs(q.size - after[k].size), 0))
    }
    const razao = Math.max(...mudancas) / Math.min(...mudancas)
    assert.ok(razao < 10, `o padrão estaciona: razão de ${razao.toFixed(1)}× entre o quadro mais rápido e o mais lento`)
  })

  it('e o tempo nunca refaz o caminho de volta', () => {
    // O defeito do seno: ida e volta percorrem os mesmos valores, então o padrão desanda e
    // reanda. Avançando linearmente, dois instantes distantes não coincidem.
    const aos = (time: number) => JSON.stringify(hidingSquares({ ...OPCOES, time }))
    assert.notEqual(aos(0), aos(2), 'o campo se transformou')
    assert.notEqual(aos(1), aos(3))
  })
})

describe('os polígonos das formas', () => {
  const pontos = (spec: string) => spec.split(' ').map((p) => p.split(',').map(Number) as [number, number])

  it('têm o número de lados pedido, e são REGULARES', () => {
    for (const sides of [6, 8]) {
      const vertices = pontos(polygonPoints(sides))
      assert.equal(vertices.length, sides)
      // Distância ao centro, e não largura da caixa: é ela que separa "regular" de "achatado".
      // O defeito que a doc do módulo descreve é dividir X e Y por eixos DIFERENTES — a forma
      // preenche a caixa inteira e deixa de ser regular, e só esta medida acusa.
      const raios = vertices.map(([x, y]) => Math.hypot(x - 12, y - 12))
      assert.ok(Math.max(...raios) - Math.min(...raios) < 1e-3, `${sides} lados: vértices a distâncias diferentes do centro`)
    }
  })

  it('o `inset` encolhe mantendo o CENTRO', () => {
    // Ele existe para o traço: um `stroke` é centrado no caminho, e sem recuo metade dele cai
    // fora do `viewBox`. Encolher passando uma caixa menor deslocaria a forma.
    const full = pontos(polygonPoints(6))
    const inset = pontos(polygonPoints(6, { inset: 2 }))
    const raio = (v: [number, number][]) => Math.hypot(v[0][0] - 12, v[0][1] - 12)
    assert.ok(raio(inset) < raio(full))
    const centro = (v: [number, number][]) => v.reduce((s, [x, y]) => [s[0] + x / v.length, s[1] + y / v.length], [0, 0])
    assert.deepEqual(
      centro(inset).map((n) => n.toFixed(2)),
      centro(full).map((n) => n.toFixed(2)),
    )
  })

  it('a rotação padrão põe um VÉRTICE para cima', () => {
    const vertices = pontos(polygonPoints(6))
    const topo = vertices.reduce((a, b) => (a[1] <= b[1] ? a : b))
    assert.ok(Math.abs(topo[0] - 12) < 1e-3, 'o vértice mais alto está no meio da caixa')
  })

  it('e `PI / lados` põe um LADO para cima — o octógono vira quadrado chanfrado', () => {
    const vertices = pontos(polygonPoints(8, { rotation: Math.PI / 8 }))
    const alturas = vertices.map(([, y]) => y).sort((a, b) => a - b)
    assert.ok(Math.abs(alturas[0] - alturas[1]) < 1e-3, 'dois vértices dividem a altura do topo')
  })
})
