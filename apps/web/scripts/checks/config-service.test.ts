import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makeConfigService } from '@wlet/services/config/application/config.service'
import { InvalidConfigError } from '@wlet/services/config/domain/errors/index'
import { makeFakeConfigRepository, makeFakeSeed, seedConfig } from '@wlet/services/config/test-support/fake-config-repository'

function setup(saved = null as null | ReturnType<typeof seedConfig>) {
  const repository = makeFakeConfigRepository(saved)
  const service = makeConfigService({ repository, seed: makeFakeSeed(seedConfig()) })
  return { repository, service }
}

describe('serviço de configuração: semente', () => {
  it('parte da semente quando o banco está vazio', async () => {
    const { service } = setup()
    const config = await service.load()
    assert.equal(config.planned.length, 1)
    assert.equal(config.budget.monthlyLimit, 9000)
  })

  it('prefere o que está gravado à semente', async () => {
    const gravado = { ...seedConfig(), budget: { monthlyLimit: 4000, warnAt: 0.5, byCategory: [] } }
    const { service } = setup(gravado)
    assert.equal((await service.load()).budget.monthlyLimit, 4000)
  })

  it('sem gravado E sem semente, abre em BRANCO em vez de recusar', async () => {
    // A semente vem de `src/generated/`, que não é versionado: um clone novo simplesmente não
    // a tem, e isso é o estado inicial do app, não um erro de montagem. Enquanto ele gritava,
    // apagar aquela pasta derrubava o boot inteiro.
    const service = makeConfigService({ repository: makeFakeConfigRepository(), seed: makeFakeSeed(null) })
    const config = await service.load()
    assert.deepEqual(config.planned, [])
    assert.equal(config.budget.monthlyLimit, 0, 'teto zero é lido como "não há teto"')
  })

  it('reset volta ao que a semente declara', async () => {
    const { service } = setup({ ...seedConfig(), goals: [{ id: 'g', label: 'X', target: 1, saved: 0, slot: 1 }] as never })
    const back = await service.reset()
    assert.equal(back.goals.length, 0)
  })
})

describe('serviço de configuração: validação', () => {
  it('recusa regra parcelada sem número de parcelas', async () => {
    // Sem contagem a janela não tem fim, e a projeção iria ao infinito.
    const { service } = setup()
    await assert.rejects(
      () => service.savePlanned([{ id: 'x', kind: 'expense', label: 'Curso', amount: 100, categoryId: 'educacao', entity: 'PF', recurrence: 'installments', startMonth: '2026-01' }]),
      InvalidConfigError,
    )
  })

  it('recusa ids repetidos', async () => {
    const { service } = setup()
    const um = { id: 'x', kind: 'expense' as const, label: 'A', amount: 1, categoryId: 'moradia', entity: 'PF' as const, recurrence: 'monthly' as const, startMonth: '2026-01' }
    await assert.rejects(() => service.savePlanned([um, { ...um }]), InvalidConfigError)
  })

  it('recusa aviso de teto fora de 0..1', async () => {
    const { service } = setup()
    await assert.rejects(() => service.saveBudget({ monthlyLimit: 1000, warnAt: 75, byCategory: [] }), InvalidConfigError)
  })

  it('grava o agregado inteiro, não só a parte alterada', async () => {
    const { repository, service } = setup()
    await service.saveGoals([])
    const snap = repository.snapshot()
    assert.ok(snap)
    assert.equal(snap.planned.length, 1, 'o resto da config veio junto')
  })
})

describe('serviço de configuração: composição de rubrica', () => {
  const comItens = (items: { label: string; quantity: number; unitAmount: number }[]) => ({
    monthlyLimit: 5000,
    warnAt: 0.75,
    byCategory: [{ categoryId: 'suplementacao', amount: 0, items }],
  })

  it('grava o total DERIVADO da composição, não o que veio junto', async () => {
    // A leitura já ignora o `amount` quando há itens; normalizar na escrita é o que impede o
    // dado gravado — e o pacote exportado — de carregar um total que contradiz a lista.
    const { repository, service } = setup()
    await service.saveBudget(comItens([{ label: 'Whey', quantity: 2, unitAmount: 180 }]))
    assert.equal(repository.snapshot()?.budget.byCategory?.[0].amount, 360)
  })

  it('ACEITA item incompleto, porque todo item nasce assim', async () => {
    // A tela grava a cada tecla. Recusar nome em branco fazia o gesto de apagar para renomear
    // acender um erro vermelho no meio da digitação, e recusar quantidade zero impedia a
    // própria adição de um item — foi o que me levou a inventar "Novo item" no lugar do nome
    // que a pessoa ainda não tinha escrito.
    const { repository, service } = setup()
    await service.saveBudget(comItens([{ label: '', quantity: 0, unitAmount: 0 }]))
    assert.equal(repository.snapshot()?.budget.byCategory?.[0].items?.length, 1)
    assert.equal(repository.snapshot()?.budget.byCategory?.[0].amount, 0, 'incompleto vale zero, e zero não estraga soma nenhuma')
  })

  it('recusa o que é IMPOSSÍVEL: valor negativo', async () => {
    const { service } = setup()
    await assert.rejects(() => service.saveBudget(comItens([{ label: 'Whey', quantity: 1, unitAmount: -1 }])), InvalidConfigError)
    await assert.rejects(() => service.saveBudget(comItens([{ label: 'Whey', quantity: -1, unitAmount: 10 }])), InvalidConfigError)
  })
})

describe('serviço de configuração: cobranças a receber', () => {
  // Estes quatro testes existem porque `commit` validava `planned` e `budget` e deixava
  // `receivables` passar direto, embora as duas listas tenham a MESMA forma de recorrência.
  // Nenhuma das falhas estourava: o kernel de conciliação é defensivo (`Math.max(1, count ?? 1)`),
  // então o efeito era o número na tela ficar errado em silêncio — que é pior que um erro.
  const receivable = {
    id: 'r1',
    debtor: 'Mãe',
    label: 'Rateio do plano',
    amount: 120,
    dueOn: { kind: 'day' as const, day: 10 },
    recurrence: 'monthly' as const,
    startMonth: '2026-01',
    match: { merchants: ['MAE'] },
    offsetsCategoryId: 'saude',
  }

  it('grava uma cobrança válida', async () => {
    const { repository, service } = setup()
    await service.saveReceivables([receivable])
    assert.equal(repository.snapshot()?.receivables.length, 1)
    assert.equal(repository.snapshot()?.planned.length, 1, 'o resto da config veio junto')
  })

  it('recusa cobrança sem id', async () => {
    // Sem id, a conciliação não tem onde pendurar o pagamento que quita a cobrança.
    const { service } = setup()
    await assert.rejects(() => service.saveReceivables([{ ...receivable, id: '  ' }]), InvalidConfigError)
  })

  it('recusa mês inicial malformado', async () => {
    // A comparação de mês é de STRING: '2026-1' nunca casa com '2026-01', e a cobrança
    // simplesmente não aparece em mês nenhum.
    const { service } = setup()
    await assert.rejects(() => service.saveReceivables([{ ...receivable, startMonth: '2026-1' }]), InvalidConfigError)
    await assert.rejects(() => service.saveReceivables([{ ...receivable, startMonth: '2026-13' }]), InvalidConfigError)
  })

  it('recusa parcelada sem número de parcelas', async () => {
    // Seis parcelas declaradas sem `count` viravam UMA ocorrência, porque o kernel usa
    // `Math.max(1, count ?? 1)`. A pessoa vê 1/6 do que cobrou e nada indica o motivo.
    const { service } = setup()
    await assert.rejects(() => service.saveReceivables([{ ...receivable, recurrence: 'installments' }]), InvalidConfigError)
  })

  it('recusa ids repetidos', async () => {
    // Duas cobranças com o mesmo id reivindicam os MESMOS pagamentos, e a soma recebida dobra.
    const { service } = setup()
    await assert.rejects(() => service.saveReceivables([receivable, { ...receivable, debtor: 'Pai' }]), InvalidConfigError)
  })

  it('a importação de um pacote inteiro passa pela mesma validação das cobranças', async () => {
    // `replace` é o caminho do arquivo importado, e um export editado à mão chega por aqui.
    const { service } = setup()
    await assert.rejects(() => service.replace({ ...seedConfig(), receivables: [{ ...receivable, startMonth: 'xx' }] }), InvalidConfigError)
  })
})

/**
 * AS BORDAS DA VALIDAÇÃO — o que a tela nunca produz, e o pacote produz.
 *
 * Os testes acima cobrem o que um formulário errado manda. Estes cobrem o que chega por outro
 * caminho: a importação de um pacote gerado noutra versão, um arquivo editado à mão, um campo que
 * o schema de uma tela antiga não exigia. `importState` passa pela MESMA validação — o próprio
 * arquivo registra isso —, e é por ela que o valor impossível entra.
 *
 * Nenhum destes estoura na tela: eles produzem um teto de gastos que não é teto, ou um aviso que
 * avisa sempre — ou nunca. O medidor da rubrica continua desenhando, com a régua errada.
 */
describe('serviço de configuração: as bordas do teto', () => {
  it('recusa teto NEGATIVO', async () => {
    // Um teto negativo faz todo gasto estourar o limite, e a barra da rubrica nasce cheia. É a
    // forma mais barata de a tela mentir sem nada quebrar.
    const { service } = setup()
    await assert.rejects(() => service.saveBudget({ monthlyLimit: -100, warnAt: 0.75, byCategory: [] }), InvalidConfigError)
  })

  it('e aceita teto ZERO, que é "não declarei teto"', async () => {
    // Zero não é impossível — é o estado de quem ainda não definiu. Recusá-lo obrigaria a inventar
    // um número, que é o que este projeto evita em toda tela.
    const { service } = setup()
    const saved = await service.saveBudget({ monthlyLimit: 0, warnAt: 0.75, byCategory: [] })
    assert.equal(saved.budget.monthlyLimit, 0)
  })

  it('recusa aviso em ZERO — ele avisaria sempre', async () => {
    // O outro lado do intervalo, e o que o teste que já existia não alcançava: ele mandava 75, que
    // estoura o teto superior. Com `warnAt: 0`, a comparação `gasto >= limite * 0` é verdadeira
    // desde o primeiro centavo, e a tela fica permanentemente em alerta — o que equivale a não
    // avisar, porque ninguém repara no que está sempre aceso.
    const { service } = setup()
    await assert.rejects(() => service.saveBudget({ monthlyLimit: 1000, warnAt: 0, byCategory: [] }), InvalidConfigError)
  })

  it('e aceita aviso em UM, que é avisar só ao estourar', async () => {
    // A ponta inclusiva. Quem não quer aviso antecipado declara 1, e recusá-lo o empurraria para
    // 0,99 — um número sem significado.
    const { service } = setup()
    const saved = await service.saveBudget({ monthlyLimit: 1000, warnAt: 1, byCategory: [] })
    assert.equal(saved.budget.warnAt, 1)
  })
})

describe('serviço de configuração: regra sem mês inicial', () => {
  it('a AUSÊNCIA do mês é recusada, e não só o formato errado', async () => {
    // O teste que já existia manda um mês malformado. Este manda a ausência — o caso do pacote de
    // uma versão que ainda não tinha o campo. Sem o `?? ''`, o `MONTH.test(undefined)` coagiria
    // para a string "undefined" e a recusa aconteceria pelo motivo certo por acaso; com ele, a
    // intenção fica escrita.
    const { service } = setup()
    const semMes = { id: 'x', kind: 'expense' as const, label: 'A', amount: 1, categoryId: 'moradia', entity: 'PF' as const, recurrence: 'monthly' as const }
    await assert.rejects(() => service.savePlanned([semMes as never]), InvalidConfigError)
  })
})

describe('serviço de configuração: reset sem semente', () => {
  it('volta ao BRANCO, em vez de recusar', async () => {
    // "Sem semente, voltar ao início é voltar ao branco — que é onde este app começa." O caso é o
    // clone novo que nunca rodou `pnpm ingest`: ele não tem semente, e um reset que estourasse
    // deixaria a pessoa presa numa configuração que ela quer descartar.
    const repository = makeFakeConfigRepository(seedConfig())
    const service = makeConfigService({ repository, seed: { read: async () => null } })

    const depois = await service.reset()
    assert.deepEqual(depois.planned, [])
    assert.deepEqual(depois.receivables, [])
    assert.equal(depois.budget.monthlyLimit, 0)
    assert.deepEqual(await repository.find(), depois, 'e o branco é GRAVADO, não só devolvido')
  })
})
