import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makePreferencesService } from '@wlet/services/preferences/application/preferences.service'
import { InvalidPeriodError } from '@wlet/services/preferences/domain/errors/index'
import { makeFakePreferencesRepository } from '@wlet/services/preferences/test-support/fake-preferences-repository'

const setup = (inicial?: Parameters<typeof makeFakePreferencesRepository>[0]) => {
  const repository = makeFakePreferencesRepository(inicial)
  return { repository, service: makePreferencesService({ repository, floorMonth: () => '2026-01' }) }
}

describe('serviço de preferências', () => {
  it('nada escolhido devolve null, não um padrão', async () => {
    // O padrão do tema vem do sistema e o do período do último mês com dados — os dois com
    // informação que este contexto não tem. Gravar um padrão afirmaria escolha que ninguém fez.
    const { service } = setup()
    assert.deepEqual(await service.load(), { scope: null, period: null, theme: null })
  })

  it('aplica o PISO do período, e não tem teto', async () => {
    // Antes do primeiro lançamento não há barra para desenhar; o futuro é aberto de propósito,
    // porque parcela e plano caem em qualquer mês à frente.
    const { service } = setup()
    const p = await service.setPeriod({ from: '2019-05', to: '2028-12' })
    assert.deepEqual(p.period, { from: '2026-01', to: '2028-12' })
  })

  it('recusa período invertido e mês malformado', async () => {
    const { service } = setup()
    await assert.rejects(() => service.setPeriod({ from: '2026-06', to: '2026-02' }), InvalidPeriodError)
    await assert.rejects(() => service.setPeriod({ from: '2026-13', to: '2026-14' }), InvalidPeriodError)
  })

  it('um campo alterado preserva os outros', async () => {
    const { service } = setup({ scope: 'PJ' })
    const p = await service.setTheme('dark')
    assert.equal(p.scope, 'PJ')
    assert.equal(p.theme, 'dark')
  })
})

/**
 * O QUE O DOCBLOCK AFIRMA, E O QUE O TESTE PROVAVA.
 *
 * `setPeriod` é escrito como `async` de propósito, e o módulo explica por quê: `normalize` lança, e
 * numa arrow direta ele lançaria de forma SÍNCRONA, antes de existir promessa. Quem chamasse
 * `setPeriod(p).catch(…)` levaria uma exceção não capturada em vez de uma rejeição — "API
 * assíncrona que às vezes explode de forma síncrona é a pior das duas".
 *
 * O comentário termina dizendo "o teste do período invertido é quem prova isto". Escrevi aqui que
 * ele NÃO provava — e estava errado, medido: tirar o `async` derruba aquele teste. `assert.rejects`
 * recebe a função, ela lança na hora, e a asserção falha por `ERR_INVALID_RETURN_VALUE` em vez de
 * casar o `InvalidPeriodError`.
 *
 * Então o docblock está certo e o que este bloco acrescenta é outra coisa: a MENSAGEM. Um
 * `ERR_INVALID_RETURN_VALUE` num teste chamado "recusa período invertido" manda procurar o erro no
 * lugar errado; "a chamada não pode estourar antes de devolver" diz o que quebrou. Numa garantia
 * que existe para um `catch` distante funcionar, saber disso pela primeira linha do erro vale o
 * arquivo.
 */
describe('a rejeição de `setPeriod` é assíncrona, e isso é o contrato', () => {
  it('a chamada devolve promessa em vez de estourar na hora', async () => {
    const { service } = setup()
    let lancouNaHora = false
    let devolvido: unknown

    try {
      devolvido = service.setPeriod({ from: '2026-06', to: '2026-02' })
    } catch {
      lancouNaHora = true
    }

    assert.equal(lancouNaHora, false, 'a chamada não pode estourar antes de devolver')
    assert.ok(devolvido instanceof Promise, 'o que volta é uma promessa')
    await assert.rejects(() => devolvido as Promise<unknown>, InvalidPeriodError)
  })
})

describe('o período inteiro ANTES do primeiro lançamento', () => {
  it('as duas pontas encostam no piso, e a janela vira um mês só', async () => {
    // O caso de quem escolhe 2019 num conjunto que começa em 2026: não há barra para desenhar em
    // nenhum dos meses pedidos. O piso se aplica às DUAS pontas — o teste que já existia só
    // exercitava a de baixo, porque o `to` dele estava no futuro.
    //
    // Uma janela degenerada é a resposta honesta: ela mostra o primeiro mês que existe, em vez de
    // uma faixa vazia que parece defeito do app.
    const { service } = setup()
    const p = await service.setPeriod({ from: '2019-05', to: '2020-03' })
    assert.deepEqual(p.period, { from: '2026-01', to: '2026-01' })
  })

  it('e o mês malformado é recusado mesmo quando só o FIM está errado', async () => {
    // A guarda é um `||`, e o teste que existia mandava os dois lados errados — o primeiro
    // curto-circuitava e o segundo nunca rodava.
    const { service } = setup()
    await assert.rejects(() => service.setPeriod({ from: '2026-01', to: '2026-13' }), InvalidPeriodError)
  })
})

describe('`clear` apaga as três, e não só as que foram mexidas', () => {
  it('volta ao estado de quem nunca escolheu nada', async () => {
    // Não havia teste nenhum para ela. Apagar por omissão — deixando o que não foi tocado — seria
    // o oposto do que o nome promete, e quem pede para limpar não confere campo a campo.
    const { repository, service } = setup({ scope: 'PJ', theme: 'dark', period: { from: '2026-02', to: '2026-05' } })

    const depois = await service.clear()
    assert.deepEqual(depois, { scope: null, period: null, theme: null })
    assert.deepEqual(await repository.find(), depois, 'e o vazio é GRAVADO, não só devolvido')
  })
})
