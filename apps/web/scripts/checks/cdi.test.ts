import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { benchmarkByMonth, type CdiDay, factor, readCdiCache } from '@wlet/ingest/investments'

/**
 * O benchmark do CDI — o "Contra o CDI" da tela de Patrimônio.
 *
 * Ele responde a única pergunta que importa numa carteira quase toda de CDB pós-fixado: "subiu
 * mais do que se eu tivesse deixado no CDI?". Errar aqui não estoura — o cartão mostra um desvio
 * plausível e errado, e a decisão que ele informa (trocar de ativo, resgatar) sai errada junto.
 *
 * As duas funções eram privadas. São puras, e o módulo delas lê arquivo só em OUTRAS funções:
 * exportá-las é o que permite exercitar a conta sem montar um xlsx da B3.
 */
const day = (date: string, rate: number): CdiDay => ({ date, rate })

/** Cinco dias úteis a 0,05% ao dia — número redondo para a conta ser conferível de cabeça. */
const CDI: CdiDay[] = [day('2026-01-05', 0.0005), day('2026-01-06', 0.0005), day('2026-01-07', 0.0005), day('2026-01-08', 0.0005), day('2026-01-09', 0.0005)]

describe('benchmarkByMonth', () => {
  it('o aporte NÃO rende no dia em que chega', () => {
    // É a convenção de qualquer aplicação — comprar hoje começa a render amanhã — e o comentário
    // do módulo diz que sem ela "o benchmark ganharia um dia de juros de graça a cada aporte".
    // Um dia a mais por aporte parece pouco e não é: ele entra em TODO aporte, e o desvio contra
    // o CDI aparece pior do que é, porque o benchmark rende o que a carteira não rendeu.
    const out = benchmarkByMonth(CDI, new Map([['2026-01-05', 1000]]), '2026-01-09')
    // 1000 aportado no dia 5, rendendo do 6 ao 9: quatro dias, não cinco.
    const expected = 1000 * 1.0005 ** 4
    assert.ok(Math.abs((out.get('2026-01') ?? 0) - expected) < 0.01, `esperava ~${expected.toFixed(2)}, veio ${out.get('2026-01')?.toFixed(2)}`)
  })

  it('aporte depois do último dia do cache entra como PRINCIPAL, sem render', () => {
    // O laço antigo o DESCARTAVA: ele existia no `contributed` e sumia do benchmark, "o que fazia
    // o desvio contra o CDI parecer melhor do que é". A janela é de poucos dias e aparece sempre
    // que o cache do CDI está mais velho que o extrato — ou seja, com frequência.
    const out = benchmarkByMonth(
      CDI,
      new Map([
        ['2026-01-05', 1000],
        ['2026-01-20', 500],
      ]),
      '2026-01-31',
    )
    const withoutYield = 1000 * 1.0005 ** 4 + 500
    assert.ok(Math.abs((out.get('2026-01') ?? 0) - withoutYield) < 0.01, `o aporte pendente sumiu: veio ${out.get('2026-01')?.toFixed(2)}`)
  })

  it('sem aporte nenhum não há benchmark — e não é zero, é ausência', () => {
    assert.equal(benchmarkByMonth(CDI, new Map(), '2026-01-09').size, 0)
  })

  it('o valor de cada mês é o do ÚLTIMO dia útil dele', () => {
    const cdi = [...CDI, day('2026-02-02', 0.0005), day('2026-02-03', 0.0005)]
    const out = benchmarkByMonth(cdi, new Map([['2026-01-05', 1000]]), '2026-02-03')
    assert.ok((out.get('2026-02') ?? 0) > (out.get('2026-01') ?? 0), 'fevereiro acumula sobre janeiro')
  })
})

describe('factor', () => {
  it('a janela é exclusiva no início e inclusiva no fim', () => {
    // Incluir o dia inicial daria um dia de juros a mais, que é o mesmo defeito do aporte acima.
    assert.equal(factor(CDI, '2026-01-05', '2026-01-05', 1), 1, 'de um dia para ele mesmo não rende')
    assert.ok(Math.abs(factor(CDI, '2026-01-05', '2026-01-06', 1) - 1.0005) < 1e-9, 'um dia rende um dia')
  })

  it('o `pct` escala a taxa: 50% do CDI rende metade', () => {
    const full = factor(CDI, '2026-01-05', '2026-01-09', 1) - 1
    const half = factor(CDI, '2026-01-05', '2026-01-09', 0.5) - 1
    assert.ok(Math.abs(half / full - 0.5) < 0.001)
  })
})

describe('readCdiCache', () => {
  it('acha o cache pelo nome do arquivo, em qualquer pasta', () => {
    const bytes = new TextEncoder().encode(JSON.stringify([{ date: '2026-01-05', rate: 0.0005 }]))
    assert.deepEqual(readCdiCache([{ path: 'docs/investimentos/cdi.json', bytes }]), [{ date: '2026-01-05', rate: 0.0005 }])
  })

  it('a AUSÊNCIA devolve lista vazia, e não estoura', () => {
    // A ausência não é erro aqui: sem o cache a renda fixa fica sem série histórica, e isso vira
    // um `problems` mais adiante. Lançar aqui derrubaria a ingestão inteira por falta de um
    // arquivo opcional.
    assert.deepEqual(readCdiCache([{ path: 'docs/extrato/janeiro.ofx', bytes: new Uint8Array() }]), [])
  })
})
