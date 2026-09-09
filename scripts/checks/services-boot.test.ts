import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

/**
 * O barrel de serviços NÃO pode acordar o dataset ao ser importado.
 *
 * A regra do portão de boot (`src/lib/dataset.ts`) diz que nada avaliado antes do carregamento
 * pode ler o dataset. `main.tsx` importa `@/services`, então essa cadeia inteira está sob a
 * regra — e quebrá-la não produz mensagem nenhuma: o erro acontece durante o import, antes de
 * o `catch` do boot existir, e o que se vê é uma PÁGINA EM BRANCO. Aconteceu uma vez, porque o
 * barrel de `preferences` importava `META` de `@/lib/finance`.
 *
 * Este teste roda no Node, onde `setDataset` nunca foi chamado: se algum módulo da cadeia ler o
 * dataset na avaliação, o import estoura aqui em vez de estourar no navegador de alguém.
 */
describe('portão de boot', () => {
  it('importar @/services não lê o dataset', async () => {
    await assert.doesNotReject(() => import('../../src/services/index.ts'))
  })

  it('e o módulo do portão em si também não', async () => {
    const mod = await import('../../src/lib/dataset.ts')
    assert.equal(mod.hasDataset(), false, 'nada preencheu o portão só por importar')
    // A leitura sem carga LANÇA, e é isso que transforma um erro de ordem de boot em mensagem.
    assert.throws(() => mod.dataset(), /antes do boot/)
    assert.throws(() => mod.declarations(), /antes do boot/)
  })

  it('montar os serviços não lê o dataset', async () => {
    // `services()` monta os cinco adapters. Nenhum deles pode tocar o dataset ao ser criado —
    // só quando um caso de uso for chamado.
    const { services, resetServices } = await import('../../src/services/index.ts')
    resetServices()
    assert.doesNotThrow(() => services())
    resetServices()
  })
})
