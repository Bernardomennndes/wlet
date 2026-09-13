import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makePlansService } from '@wlet/services/plans/application/plans.service'
import { InvalidPlanError, PlanGroupNotFoundError, PlanNotFoundError } from '@wlet/services/plans/domain/errors/index'
import { makeFakePlanRepository, makeSequentialIds } from '@wlet/services/plans/test-support/fake-plan-repository'

/**
 * O serviço de planos sobre fakes in-memory (§9 da rule de serviços).
 *
 * Roda no runner do Node, sem navegador e sem dependência nova — é o que a camada de aplicação
 * ganha por não conhecer o armazenamento.
 */
function setup() {
  const repository = makeFakePlanRepository()
  const service = makePlansService({ repository, ids: makeSequentialIds() })
  return { repository, service }
}

const monitor = { label: 'Monitor', categoryId: 'tecnologia', cash: 3000 }

describe('serviço de planos: catálogo', () => {
  it('um plano novo nasce EM ESTUDO, não decidido', async () => {
    // Nascer decidido afirmaria por quem só anotou — mesma razão de `payment` e `month` serem
    // opcionais.
    const { service } = setup()
    const plan = await service.addPlan(monitor)
    assert.equal(plan.status, 'considering')
    assert.equal(plan.id, 'plan-1')
  })

  it('grava o catálogo inteiro a cada alteração', async () => {
    const { repository, service } = setup()
    await service.addPlan(monitor)
    await service.addPlan({ ...monitor, label: 'Cadeira' })
    assert.equal(repository.saves, 2)
    assert.equal(repository.snapshot().items.length, 2)
  })

  it('recusa plano sem nome e com preço negativo', async () => {
    const { service } = setup()
    await assert.rejects(() => service.addPlan({ ...monitor, label: '  ' }), InvalidPlanError)
    await assert.rejects(() => service.addPlan({ ...monitor, cash: -1 }), InvalidPlanError)
    await assert.rejects(() => service.addPlan({ ...monitor, month: '2026-13' }), InvalidPlanError)
  })

  it('aceita plano SEM mês e SEM forma de pagamento', async () => {
    // Ausência não é erro: é o desejo ainda não decidido, e o app trata assim em toda parte.
    const { service } = setup()
    const plan = await service.addPlan(monitor)
    assert.equal(plan.month, undefined)
    assert.equal(plan.payment, undefined)
  })

  it('erra ao mexer num plano que não existe', async () => {
    const { service } = setup()
    await assert.rejects(() => service.setStatus('plan-99', 'decided'), PlanNotFoundError)
    await assert.rejects(() => service.removePlan('plan-99'), PlanNotFoundError)
  })
})

describe('serviço de planos: parcelado sem preço parcelado', () => {
  it('recua para NÃO DECIDIDO em vez de afirmar à vista', async () => {
    // A regra do CLAUDE.md trazida para o único lugar que escreve: "parcelado" sem preço
    // parcelado é um estado que não se pode desenhar. Recuar para à vista inventaria uma
    // decisão que ninguém tomou.
    const { service } = setup()
    const plan = await service.addPlan(monitor)
    const após = await service.setPayment(plan.id, 'financed')
    assert.equal(após.payment, undefined)
  })

  it('mantém parcelado quando o preço parcelado existe', async () => {
    const { service } = setup()
    const plan = await service.addPlan({ ...monitor, financed: { total: 3400, installments: 10 } })
    const após = await service.setPayment(plan.id, 'financed')
    assert.equal(após.payment, 'financed')
    assert.equal(após.financed?.total, 3400)
  })

  it('preserva os DOIS preços ao escolher um', async () => {
    // Apagar o outro jogaria fora a pesquisa que permite mudar de ideia.
    const { service } = setup()
    const plan = await service.addPlan({ ...monitor, financed: { total: 3400, installments: 10 } })
    const após = await service.setPayment(plan.id, 'cash')
    assert.equal(após.cash, 3000)
    assert.equal(após.financed?.total, 3400)
  })
})

describe('serviço de planos: grupos', () => {
  it('apagar o grupo NÃO apaga os planos, só o vínculo', async () => {
    // Grupo é organização, não posse: desfazer um agrupamento não cancela compras.
    const { service } = setup()
    const grupo = await service.addGroup({ label: 'Escritório' })
    await service.addPlan({ ...monitor, groupId: grupo.id })
    await service.removeGroup(grupo.id)

    const { items, groups } = await service.list()
    assert.equal(groups.length, 0)
    assert.equal(items.length, 1)
    assert.equal(items[0].groupId, undefined)
  })

  it('recusa plano apontando para grupo inexistente', async () => {
    const { service } = setup()
    await assert.rejects(() => service.addPlan({ ...monitor, groupId: 'group-99' }), PlanGroupNotFoundError)
  })

  it('erra ao apagar grupo que não existe', async () => {
    const { service } = setup()
    await assert.rejects(() => service.removeGroup('group-99'), PlanGroupNotFoundError)
  })
})

describe('serviço de planos: agenda', () => {
  it('delega ao kernel e ignora quem não tem mês', async () => {
    // O serviço ORQUESTRA: a aritmética de agenda vive em src/lib/plans.ts e é testada lá.
    const { service } = setup()
    const comMes = await service.addPlan({ ...monitor, month: '2026-10' })
    await service.setStatus(comMes.id, 'decided')
    await service.addPlan({ ...monitor, label: 'Sem data' })

    const agenda = await service.schedule()
    assert.ok(agenda.length >= 1)
    assert.ok(agenda.some((m) => m.month === '2026-10'))
  })
})

/**
 * Os três métodos que não tinham teste — e `updatePlan` é o mais usado da tela de Planos.
 *
 * A §9 da rule de serviços diz que toda branch nova precisa de teste que a exercite. Estes três
 * escaparam: `updatePlan` é o caminho de TODA edição em linha da tabela (decidido, forma de
 * pagamento, parcelas, mês), `setMonth` é a célula de mês, e `replaceAll` é a importação de um
 * arquivo. Achados medindo a interface contra a suíte.
 */
describe('updatePlan — o caminho de toda edição em linha', () => {
  it('aplica o patch e devolve o plano MERGEADO, não só o campo', async () => {
    const { service } = setup()
    const criado = await service.addPlan(monitor)
    const editado = await service.updatePlan(criado.id, { cash: 2500, status: 'decided' })
    assert.equal(editado.cash, 2500)
    assert.equal(editado.status, 'decided')
    assert.equal(editado.label, 'Monitor', 'o que não foi tocado sobrevive')
    assert.equal(editado.id, criado.id)
  })

  it('valida o RESULTADO do merge, não o patch isolado', async () => {
    // É a diferença que importa: um patch que parece inocente pode produzir um plano inválido.
    const { service } = setup()
    const criado = await service.addPlan(monitor)
    await assert.rejects(() => service.updatePlan(criado.id, { cash: -1 }), InvalidPlanError)
    await assert.rejects(() => service.updatePlan(criado.id, { label: '   ' }), InvalidPlanError)
    await assert.rejects(() => service.updatePlan(criado.id, { month: '2026-13' }), InvalidPlanError)
  })

  it('recua "parcelado" para NÃO DECIDIDO quando o preço parcelado sai no mesmo patch', async () => {
    // A regra que o formulário também aplica, aqui no único lugar que escreve. Recuar para à vista
    // inventaria uma decisão que ninguém tomou.
    const { service } = setup()
    const criado = await service.addPlan({ ...monitor, financed: { total: 3400, installments: 10 }, payment: 'financed' })
    assert.equal(criado.payment, 'financed')
    const semParcelado = await service.updatePlan(criado.id, { financed: undefined })
    assert.equal(semParcelado.payment, undefined)
    assert.notEqual(semParcelado.payment, 'cash')
  })

  it('plano que não existe é PlanNotFoundError, e nada é gravado', async () => {
    const { repository, service } = setup()
    await service.addPlan(monitor)
    const before = structuredClone(repository.snapshot())
    await assert.rejects(() => service.updatePlan('nao-existe', { cash: 1 }), PlanNotFoundError)
    assert.deepEqual(repository.snapshot(), before, 'uma escrita recusada não altera o catálogo')
  })
})

describe('setMonth', () => {
  it('marca e LIMPA o mês — limpar é passar undefined, não string vazia', async () => {
    const { service } = setup()
    const criado = await service.addPlan(monitor)
    assert.equal(criado.month, undefined)
    assert.equal((await service.setMonth(criado.id, '2026-03')).month, '2026-03')
    assert.equal((await service.setMonth(criado.id, undefined)).month, undefined)
  })

  it('recusa mês fora do formato, com a mesma validação do resto', async () => {
    const { service } = setup()
    const criado = await service.addPlan(monitor)
    for (const month of ['2026-3', '2026-13', '2026-00', 'março']) {
      await assert.rejects(() => service.setMonth(criado.id, month), InvalidPlanError, month)
    }
  })
})

describe('replaceAll — o caminho da importação', () => {
  it('substitui o catálogo INTEIRO e devolve o que gravou', async () => {
    const { repository, service } = setup()
    await service.addPlan(monitor)
    await service.addGroup({ label: 'Casa' })

    const importado = { version: 2 as const, groups: [{ id: 'g-novo', label: 'Viagem' }], items: [] }
    const volta = await service.replaceAll(importado)
    assert.deepEqual(volta, importado)
    assert.deepEqual(repository.snapshot(), importado, 'o que havia antes SAIU — é substituição, não fusão')
  })

  it('grava vazio quando o arquivo não tem nada — apagar tudo é uma importação legítima', async () => {
    const { repository, service } = setup()
    await service.addPlan(monitor)
    await service.replaceAll({ version: 2, groups: [], items: [] })
    assert.deepEqual(repository.snapshot()?.items, [])
  })
})
