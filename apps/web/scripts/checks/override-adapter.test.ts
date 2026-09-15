import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makeOrpcOverrideRepository } from '@wlet/services'

/**
 * O adapter dos AJUSTES DE CATEGORIA — o único da migração que não é fino.
 *
 * A §9 registra que os adapters de oRPC "são mantidos FINOS de propósito, sem regra de negócio", e
 * que o que neles pode dar errado em silêncio já tem sensor próprio (`remote-errors.test.ts`, que
 * tranca a tradução de erro e a obrigação de embrulhar toda chamada). Este é a exceção, e o
 * medidor a encontrou: `save` inteiro — doze linhas — nunca rodava.
 *
 * Ele não é fino porque a PORTA não cabe na rede. `save(overrides)` recebe o mapa inteiro, herança
 * de um armazenamento onde gravar era escrever o documento todo; contra `/v1` isso viraria uma
 * chamada por transação, a cada ajuste. O adapter resolve comparando com o que leu e mandando só o
 * que MUDOU — a porta continua honesta e a rede não paga por ela. É regra de negócio disfarçada de
 * detalhe de transporte, e é por isso que precisa de teste.
 *
 * Os dois modos de falha são silenciosos e opostos: um diff que manda de menos deixa o ajuste no
 * navegador e o servidor com a categoria velha — a tela fica certa até o próximo carregamento, e
 * aí o gasto volta sozinho para a categoria do ingest. Um diff que manda de mais só custa rede.
 */
type Call = { transactionId: string; categoryId: string | null }

/**
 * `failAt` é MUTÁVEL de propósito: o teste da falha precisa levantar a rede de novo e gravar com o
 * MESMO adapter, porque o que se mede é o estado interno dele. Trocar de adapter mediria outra
 * coisa — um recém-criado reenvia tudo por não ter lido nada.
 */
function fakeClient(list: Record<string, string>) {
  const calls: Call[] = []
  const net = { failAt: undefined as string | undefined }
  const client = {
    overrides: {
      list: async () => ({ ...list }),
      set: async (input: Call) => {
        if (input.transactionId === net.failAt) throw new Error('rede caiu no meio')
        calls.push(input)
        return {}
      },
    },
  }
  return { client: client as never, calls, net }
}

describe('só o que MUDOU atravessa', () => {
  it('reenviar o mesmo mapa não gera chamada nenhuma', async () => {
    // O caso mais comum da tela: a pessoa mexe num ajuste e o serviço grava o mapa inteiro. Sem o
    // diff, cada gravação reenviaria TODOS os ajustes já existentes — e o custo cresce com o
    // histórico, não com o que ela fez.
    const { client, calls } = fakeClient({ t1: 'mercado', t2: 'saude' })
    const repository = makeOrpcOverrideRepository({ client })
    await repository.findAll()
    await repository.save({ t1: 'mercado', t2: 'saude' })
    assert.deepEqual(calls, [])
  })

  it('o ajuste NOVO vai, e só ele', async () => {
    const { client, calls } = fakeClient({ t1: 'mercado' })
    const repository = makeOrpcOverrideRepository({ client })
    await repository.findAll()
    await repository.save({ t1: 'mercado', t2: 'saude' })
    assert.deepEqual(calls, [{ transactionId: 't2', categoryId: 'saude' }])
  })

  it('o ajuste TROCADO vai com o valor novo', async () => {
    const { client, calls } = fakeClient({ t1: 'mercado' })
    const repository = makeOrpcOverrideRepository({ client })
    await repository.findAll()
    await repository.save({ t1: 'restaurantes' })
    assert.deepEqual(calls, [{ transactionId: 't1', categoryId: 'restaurantes' }])
  })

  it('e o ajuste REMOVIDO vira `null`, que é "volte ao que o ingest decidiu"', async () => {
    // A chave some do mapa, e o adapter precisa traduzir a AUSÊNCIA em `null`. Sem isso o servidor
    // nunca fica sabendo da remoção: a pessoa desfaz o ajuste, a tela obedece, e no carregamento
    // seguinte o ajuste apagado ressuscita.
    const { client, calls } = fakeClient({ t1: 'mercado', t2: 'saude' })
    const repository = makeOrpcOverrideRepository({ client })
    await repository.findAll()
    await repository.save({ t1: 'mercado' })
    assert.deepEqual(calls, [{ transactionId: 't2', categoryId: null }])
  })

  it('desfazer e REFAZER o mesmo ajuste chega ao servidor as duas vezes', async () => {
    // Achado pela falsificação: trocar `ultimo = { ...next }` por `{ ...ultimo, ...next }` passava
    // por todos os outros testes. A diferença é a chave REMOVIDA — com o espalhamento acumulado ela
    // sobrevive em `ultimo`, e o adapter passa a comparar contra um estado que o servidor não tem.
    //
    // O estrago aparece no terceiro passo, não no segundo: a pessoa tira o ajuste de `t2`, o `null`
    // vai, e depois ela repõe a MESMA categoria. `ultimo` ainda diz `saude`, `next` diz `saude`, os
    // dois são iguais — e o adapter não manda nada. A tela mostra o ajuste de volta, o servidor
    // continua com `null`, e no próximo carregamento o gasto volta para a categoria do ingest.
    //
    // É o modo de falha que mais se parece com "não salvou e eu não percebi", e nenhuma das
    // asserções anteriores o alcançava porque todas param na primeira gravação.
    const { client, calls } = fakeClient({ t1: 'mercado', t2: 'saude' })
    const repository = makeOrpcOverrideRepository({ client })
    await repository.findAll()

    await repository.save({ t1: 'mercado' })
    await repository.save({ t1: 'mercado', t2: 'saude' })

    assert.deepEqual(calls, [
      { transactionId: 't2', categoryId: null },
      { transactionId: 't2', categoryId: 'saude' },
    ])
  })

  it('sem `findAll` antes, TODO ajuste é novidade', async () => {
    // O estado de comparação nasce vazio. Gravar sem ter lido manda tudo — o que é mais caro e
    // está correto: o adapter não pode presumir o que o servidor tem.
    const { client, calls } = fakeClient({ t1: 'mercado' })
    await makeOrpcOverrideRepository({ client }).save({ t1: 'mercado' })
    assert.deepEqual(calls, [{ transactionId: 't1', categoryId: 'mercado' }])
  })
})

describe('uma falha no meio do laço não pode APAGAR o que faltou mandar', () => {
  it('a próxima gravação reenvia o que não passou', async () => {
    // O invariante que o módulo documenta e que ninguém exercitava: `ultimo` só é atualizado DEPOIS
    // do laço inteiro. Atualizá-lo por item faria o adapter esquecer exatamente o ajuste que não
    // chegou — a rede cai na terceira de cinco chamadas, o erro sobe, a pessoa tenta de novo, e o
    // diff agora acha que aquelas três já estão no servidor. O ajuste some sem nada acusar.
    //
    // As chaves saem de um `Set` de `Object.keys`, então a ordem é a de inserção: `t1` passa, `t2`
    // falha, `t3` nem chega a ser tentado.
    const { client, calls, net } = fakeClient({})
    const repository = makeOrpcOverrideRepository({ client })
    await repository.findAll()

    net.failAt = 't2'
    await assert.rejects(() => repository.save({ t1: 'mercado', t2: 'saude', t3: 'lazer' }))
    assert.deepEqual(calls, [{ transactionId: 't1', categoryId: 'mercado' }], 'parou na falha')

    // A rede volta, e a pessoa tenta de novo — no MESMO adapter, que é onde o estado mora.
    net.failAt = undefined
    calls.length = 0
    await repository.save({ t1: 'mercado', t2: 'saude', t3: 'lazer' })
    assert.deepEqual(
      calls.map((c) => c.transactionId),
      ['t1', 't2', 't3'],
      'reenvia os TRÊS — inclusive o que já tinha passado, porque `ultimo` ficou no estado anterior',
    )
  })
})
