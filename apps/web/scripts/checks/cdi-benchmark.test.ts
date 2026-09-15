import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { benchmarkByMonth, factor, readCdiCache } from '@wlet/ingest/investments'
import type { SourceFile } from '@wlet/ingest/io'

/**
 * A RÉGUA contra a qual a carteira é medida — e metade das funções daqui nunca rodava.
 *
 * O medidor de cobertura apontou `investments.ts` com 46,9% de FUNÇÕES: o teste que existe entra
 * pelo `buildInvestments` e prova a escolha do arquivo, mas não toca no cálculo do benchmark.
 *
 * O que está em jogo é a única comparação honesta que a tela de Patrimônio faz. A carteira recebe
 * aporte irregular, então rentabilidade bruta não se compara com índice nenhum; o que se compara é
 * "quanto os MESMOS aportes, nas MESMAS datas, teriam rendido no CDI". Uma régua errada não
 * estoura: ela diz que você está ganhando do CDI quando não está, ou o contrário.
 */
const day = (date: string, rate: number) => ({ date, rate })

/** Cinco dias úteis a 0,05% ao dia — números redondos para a conta ser conferível a olho. */
const CDI = [day('2026-01-02', 0.0005), day('2026-01-05', 0.0005), day('2026-01-06', 0.0005), day('2026-01-07', 0.0005), day('2026-01-08', 0.0005)]

describe('o fator acumulado', () => {
  it('compõe os dias do intervalo, e a ponta inicial é EXCLUSIVA', () => {
    // O dia do aporte não rende: o dinheiro chega no fim dele. Incluí-lo daria um dia a mais de
    // juros em todo aporte, e o desvio contra o CDI ficaria sistematicamente pior do que é.
    assert.equal(factor(CDI, '2026-01-02', '2026-01-08', 1).toFixed(8), (1.0005 ** 4).toFixed(8))
    assert.equal(factor(CDI, '2026-01-01', '2026-01-08', 1).toFixed(8), (1.0005 ** 5).toFixed(8))
  })

  it('e a ponta final é INCLUSIVA', () => {
    assert.equal(factor(CDI, '2026-01-05', '2026-01-06', 1).toFixed(8), '1.00050000')
    assert.equal(factor(CDI, '2026-01-05', '2026-01-05', 1), 1, 'intervalo vazio não rende')
  })

  it('o percentual do CDI escala a taxa do DIA, não o fator', () => {
    // `110% do CDI` é 1,1× a taxa diária composta, não 1,1× o rendimento final. Com a segunda
    // leitura, quanto mais longo o período, maior o erro — e ele cresce em silêncio.
    assert.equal(factor(CDI, '2026-01-01', '2026-01-08', 1.1).toFixed(8), ((1 + 0.0005 * 1.1) ** 5).toFixed(8))
  })

  it('e um cache vazio não rende nada', () => {
    assert.equal(factor([], '2026-01-01', '2026-12-31', 1), 1)
  })
})

describe('a série mensal do benchmark', () => {
  it('o aporte entra na data dele e passa a render dali em diante', () => {
    const aportes = new Map([['2026-01-02', 1000]])
    const series = benchmarkByMonth(CDI, aportes, '2026-01-08')
    // Entrou no dia 2 (que não rende) e rendeu nos dias 5, 6, 7 e 8.
    assert.equal(series.get('2026-01')?.toFixed(4), (1000 * 1.0005 ** 4).toFixed(4))
  })

  it('dois aportes compõem cada um a partir da sua data', () => {
    const series = benchmarkByMonth(
      CDI,
      new Map([
        ['2026-01-02', 1000],
        ['2026-01-06', 500],
      ]),
      '2026-01-08',
    )
    // O primeiro rende quatro dias; o segundo entra no dia 6 e rende dois.
    const expected = 1000 * 1.0005 ** 4 + 500 * 1.0005 ** 2
    assert.equal(series.get('2026-01')?.toFixed(4), expected.toFixed(4))
  })

  it('sem aporte nenhum, não há régua', () => {
    // Zero não é o mesmo que "nada a comparar": uma série com zeros desenharia uma linha no
    // fundo do gráfico, como se a carteira estivesse perdendo tudo.
    assert.equal(benchmarkByMonth(CDI, new Map(), '2026-01-08').size, 0)
  })

  it('a série para no `until` — o CDI que vem depois não é usado', () => {
    const series = benchmarkByMonth(CDI, new Map([['2026-01-02', 1000]]), '2026-01-06')
    assert.equal(series.get('2026-01')?.toFixed(4), (1000 * 1.0005 ** 2).toFixed(4))
  })

  it('e o aporte MAIS NOVO que o cache do CDI entra como PRINCIPAL, sem render', () => {
    // O defeito que o módulo registra ter tido: o aporte com data entre o último dia útil do
    // cache e o `until` existia no `contributed` e SUMIA do benchmark — o que fazia o desvio
    // contra o CDI parecer melhor do que é. É uma janela de poucos dias que aparece sempre que o
    // cache está mais velho que o extrato, ou seja, quase sempre.
    const series = benchmarkByMonth(
      CDI,
      new Map([
        ['2026-01-02', 1000],
        ['2026-01-20', 700],
      ]),
      '2026-01-20',
    )
    assert.equal(series.get('2026-01')?.toFixed(4), (1000 * 1.0005 ** 4 + 700).toFixed(4), 'o aporte novo conta pelo principal')
  })
})

describe('o cache do CDI', () => {
  const sourceOf = (path: string, body: string): SourceFile => ({ path, bytes: new TextEncoder().encode(body) })

  it('é achado pelo NOME, em qualquer pasta', () => {
    const lido = readCdiCache([sourceOf('docs/investimentos/sub/CDI.json', JSON.stringify(CDI))])
    assert.equal(lido.length, 5)
  })

  it('e sem ele a lista é vazia — não é erro, é ausência', () => {
    // Sem CDI o relatório ainda sai, com o problema declarado: perder a carteira inteira por
    // falta da régua seria trocar um gráfico a menos por nenhum gráfico.
    assert.deepEqual(readCdiCache([sourceOf('docs/investimentos/posicao.xlsx', '{}')]), [])
  })
})
