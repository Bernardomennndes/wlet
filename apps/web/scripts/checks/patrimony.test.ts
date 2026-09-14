import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { InvestmentSnapshot, PatrimonyPoint } from '@wlet/domain'
import { setDataset } from '@/lib/dataset'

/**
 * A matemática do PATRIMÔNIO — e a distância entre duas porcentagens é a informação.
 *
 * O módulo diz o número medido: numa janela de 12 meses o patrimônio subiu +122%, e quase tudo
 * era APORTE. Uma tela que mostrasse só a evolução bruta estaria dizendo que a carteira rendeu
 * 122% — o erro mais caro que este app pode cometer, porque ele não parece erro: o número está
 * certo, é a leitura dele que é falsa.
 *
 * É por isso que `windowChange` devolve as duas, e por isso que o primeiro teste daqui é o da
 * janela em que TODO o crescimento foi depósito.
 *
 * O portão de boot é semeado antes do import porque `investments.ts` lê `dataset().investments`
 * na avaliação. Nenhuma função sob teste usa as constantes do módulo — todas recebem o que medem.
 */
setDataset({ transactions: [], accounts: [], transfers: [], meta: { months: [] }, investments: { snapshot: null, series: [], income: [] } } as never)

const { assetClasses, benchmarkGap, PATRIMONY_RANGES, windowChange, yieldOf } = await import('@/lib/investments')

const point = (month: string, total: number, contributed: number, benchmark = 0): PatrimonyPoint => ({ month, total, contributed, benchmark, fixedIncome: 0, equity: 0, cash: 0 })

const snapshot = (holdings: { kind: 'fixed-income' | 'equity'; value: number }[], cash: number): InvestmentSnapshot =>
  ({
    asOf: '2026-09-01',
    source: 'teste',
    cash,
    total: holdings.reduce((sum, h) => sum + h.value, 0),
    holdings: holdings.map((h, i) => ({ code: `P${i}`, label: `Papel ${i}`, quantity: 1, ...h })),
  }) as InvestmentSnapshot

describe('a janela: a BRUTA inclui o aporte, a RELATIVA não', () => {
  it('uma janela em que todo o crescimento foi DEPÓSITO rendeu zero', () => {
    // O teste que este arquivo existe para ter. Triplicar o patrimônio depositando não é render:
    // a bruta diz +200% e está certa, e é justamente por estar certa que ela engana sozinha.
    const change = windowChange([point('2026-01', 1000, 1000), point('2026-12', 3000, 3000)])
    assert.equal(change.grossChange, 2, 'o patrimônio triplicou')
    assert.equal(change.contributed, 2000)
    assert.equal(change.gain, 0, 'o dinheiro que você depositou não é rendimento')
    assert.equal(change.netChange, 0)
  })

  it('e o rendimento de verdade aparece separado do aporte', () => {
    // Cresceu 500, dos quais 200 foram depósito: renderam 300. Escrevi 200 na primeira versão
    // deste teste e o módulo me corrigiu — é a subtração inteira, não a parte que sobrou.
    const change = windowChange([point('2026-01', 1000, 1000), point('2026-06', 1500, 1200)])
    assert.deepEqual(change, { grossAmount: 500, grossChange: 0.5, gain: 300, netChange: 0.3, contributed: 200 })
  })

  it('a RETIRADA não vira prejuízo', () => {
    // Tirar 200 do bolso derruba o patrimônio em 200 e não perdeu nada. Sem descontar o aporte
    // com sinal, a janela acusaria -20% num mês em que a carteira ficou parada.
    const change = windowChange([point('2026-01', 1000, 1000), point('2026-02', 800, 800)])
    assert.equal(change.grossAmount, -200)
    assert.equal(change.contributed, -200, 'aporte negativo é retirada')
    assert.equal(change.gain, 0, 'a carteira não perdeu nada')
  })

  it('sem base não há porcentagem — mas o valor em reais continua', () => {
    // Começar do zero é o caso do primeiro mês de carteira. "0,0%" ali seria afirmação, não
    // ausência, e dividir por zero poria "Infinity%" na tela.
    const change = windowChange([point('2026-01', 0, 0), point('2026-02', 500, 500)])
    assert.equal(change.grossChange, null)
    assert.equal(change.netChange, null)
    assert.equal(change.grossAmount, 500, 'o que se pode afirmar continua sendo dito')
  })

  it('janela vazia é toda nula, e não uma pilha de zeros', () => {
    assert.deepEqual(windowChange([]), { grossAmount: null, grossChange: null, gain: null, netChange: null, contributed: null })
  })

  it('um ponto só não varia', () => {
    const change = windowChange([point('2026-01', 1000, 800)])
    assert.deepEqual(change, { grossAmount: 0, grossChange: 0, gain: 0, netChange: 0, contributed: 0 })
  })
})

describe('o rendimento acumulado', () => {
  it('é o patrimônio menos o aporte líquido, em centavos', () => {
    // O arredondamento não é cosmético: este número é subtraído de outro que a tela também
    // mostra, e um resíduo de ponto flutuante faz as duas linhas não fecharem por um centavo.
    assert.equal(yieldOf(point('2026-09', 12345.678, 10000)), 2345.68)
  })

  it('prejuízo aparece como prejuízo', () => {
    // O número já apareceu negativo por defeito — faltava o caixa da corretora no `total` e
    // faltava descontar o que voltou para o banco no `contributed`. Com os dois corrigidos, um
    // negativo aqui é perda de verdade, e escondê-la seria o defeito seguinte.
    assert.equal(yieldOf(point('2026-09', 800, 1000)), -200)
  })
})

describe('o desvio contra o CDI', () => {
  it('é RAZÃO entre os dois valores, não diferença entre eles', () => {
    // As duas séries recebem o mesmo dinheiro nas mesmas datas, então a divisão já neutraliza o
    // efeito do momento de cada aporte. A diferença, além de vir em reais, mudaria de tamanho só
    // porque a carteira cresceu: os mesmos 10% acima do CDI dariam 10 numa carteira e 100 noutra.
    assert.equal(toFixed(benchmarkGap(point('2026-09', 110, 0, 100))), 0.1)
    assert.equal(toFixed(benchmarkGap(point('2026-09', 1100, 0, 1000))), 0.1)
  })

  it('abaixo da régua o desvio é negativo', () => {
    assert.equal(toFixed(benchmarkGap(point('2026-09', 90, 0, 100))), -0.1)
  })

  it('sem régua não há desvio — e nem "Infinity%" na tela', () => {
    assert.equal(benchmarkGap(point('2026-09', 100, 0, 0)), null)
    assert.equal(benchmarkGap(point('2026-09', 100, 0, -5)), null)
  })
})

/** Duas casas: a comparação é de leitura, e o resíduo de ponto flutuante não é o assunto. */
const toFixed = (value: number | null) => (value === null ? null : Math.round(value * 1000) / 1000)

describe('as classes de ativo', () => {
  it('o CAIXA é uma classe, e entra no bolo', () => {
    // Ele não é papel, mas é patrimônio. Uma alocação que soma 100% sem ele estaria dividindo um
    // bolo menor que o número exibido logo acima — e as duas leituras da mesma tela discordariam.
    const classes = assetClasses(
      snapshot(
        [
          { kind: 'fixed-income', value: 600 },
          { kind: 'equity', value: 300 },
        ],
        100,
      ),
    )
    assert.deepEqual(
      classes.map((item) => [item.id, item.value, item.share]),
      [
        ['fixed-income', 600, 0.6],
        ['equity', 300, 0.3],
        ['cash', 100, 0.1],
      ],
    )
    // A soma das fatias é 1 ATÉ O CENTÉSIMO, e não exatamente 1: `0.6 + 0.3 + 0.1` em ponto
    // flutuante dá 0.9999999999999999. As fatias não são arredondadas no módulo de propósito —
    // arredondar aqui deslocaria a geometria do treemap por um resíduo que nenhuma tela mostra,
    // já que as três são exibidas sem casa decimal. Quem compara fatia com fatia precisa saber
    // que a igualdade exata não está disponível.
    assert.equal(Math.round(classes.reduce((sum, item) => sum + item.share, 0) * 100) / 100, 1)
  })

  it('as três aparecem sempre, mesmo zeradas', () => {
    // Tile que some transforma "não tenho ações" em "não sei se tenho ações". Ausência é dado.
    const classes = assetClasses(snapshot([{ kind: 'fixed-income', value: 1000 }], 0))
    assert.deepEqual(
      classes.map((item) => item.id),
      ['fixed-income', 'equity', 'cash'],
    )
    assert.equal(classes[1].value, 0)
  })

  it('carteira vazia não vira NaN', () => {
    // `0 / 0` é NaN, que atravessa toda conta seguinte e chega à tela como "NaN%" ou como uma
    // fatia de largura nenhuma — os dois piores jeitos de dizer "ainda não há carteira".
    assert.deepEqual(
      assetClasses(snapshot([], 0)).map((item) => item.share),
      [0, 0, 0],
    )
  })
})

describe('as janelas do gráfico-herói', () => {
  it('nenhuma é menor que três meses', () => {
    // A série é MENSAL: um seletor de um dia sobre pontos mensais devolveria um ponto só, e um
    // gráfico de um ponto é uma mentira com eixo. Três é o mínimo em que a linha tem forma.
    const finite = PATRIMONY_RANGES.filter((range) => Number.isFinite(range.months))
    assert.ok(finite.length >= 3)
    for (const range of finite) assert.ok(range.months >= 3, `janela de ${range.months} meses`)
  })

  it('"Tudo" não tem limite', () => {
    assert.equal(PATRIMONY_RANGES.at(-1)?.months, Number.POSITIVE_INFINITY)
  })
})
