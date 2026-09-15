import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makePlansService } from '@wlet/services/plans/application/plans.service'
import { InvalidPlanError, PlanGroupNotFoundError, PlanNotFoundError, PurchaseAlreadyLinkedError } from '@wlet/services/plans/domain/errors/index'
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

/**
 * O checkbox do grupo: decide ou devolve a estudo tudo o que o grupo tem, numa gravação só.
 *
 * A contagem de gravações não é detalhe: com um `setStatus` por plano, as escritas em voo leem o
 * mesmo retrato e só a última sobrevive (`plans-concurrency.test.ts`).
 */
describe('setGroupStatus — o checkbox do grupo', () => {
  async function withGroup() {
    const ctx = setup()
    const trip = await ctx.service.addGroup({ label: 'Viagem' })
    const home = await ctx.service.addGroup({ label: 'Casa' })
    const ticket = await ctx.service.addPlan({ ...monitor, label: 'Passagem', groupId: trip.id })
    const hotel = await ctx.service.addPlan({ ...monitor, label: 'Hotel', groupId: trip.id })
    const dropped = await ctx.service.addPlan({ ...monitor, label: 'Passeio', groupId: trip.id, status: 'discarded' })
    const sofa = await ctx.service.addPlan({ ...monitor, label: 'Sofá', groupId: home.id })
    const loose = await ctx.service.addPlan({ ...monitor, label: 'Cadeira' })
    return { ...ctx, trip, ticket, hotel, dropped, sofa, loose }
  }

  it('decide todos os planos do grupo e devolve os que alcançou', async () => {
    const { service, trip, ticket, hotel } = await withGroup()
    const reached = await service.setGroupStatus(trip.id, 'decided')
    assert.deepEqual(reached.map((p) => p.id).sort(), [ticket.id, hotel.id].sort())
    const { items } = await service.list()
    assert.equal(items.find((p) => p.id === ticket.id)?.status, 'decided')
    assert.equal(items.find((p) => p.id === hotel.id)?.status, 'decided')
  })

  it('o descartado fica descartado — desistir não se desfaz pelo grupo', async () => {
    const { service, trip, dropped } = await withGroup()
    await service.setGroupStatus(trip.id, 'decided')
    const { items } = await service.list()
    assert.equal(items.find((p) => p.id === dropped.id)?.status, 'discarded')
  })

  it('não toca em outro grupo nem nos avulsos', async () => {
    const { service, trip, sofa, loose } = await withGroup()
    await service.setGroupStatus(trip.id, 'decided')
    const { items } = await service.list()
    assert.equal(items.find((p) => p.id === sofa.id)?.status, 'considering')
    assert.equal(items.find((p) => p.id === loose.id)?.status, 'considering')
  })

  it('desmarcar devolve o grupo inteiro a EM ESTUDO', async () => {
    const { service, trip, ticket, hotel } = await withGroup()
    await service.setGroupStatus(trip.id, 'decided')
    await service.setGroupStatus(trip.id, 'considering')
    const { items } = await service.list()
    assert.equal(items.find((p) => p.id === ticket.id)?.status, 'considering')
    assert.equal(items.find((p) => p.id === hotel.id)?.status, 'considering')
  })

  it('é UMA gravação, não uma por plano', async () => {
    const { repository, service, trip } = await withGroup()
    const before = repository.saves
    await service.setGroupStatus(trip.id, 'decided')
    assert.equal(repository.saves - before, 1)
  })

  it('grupo que não existe é PlanGroupNotFoundError, e nada é gravado', async () => {
    const { repository, service } = await withGroup()
    const before = repository.saves
    await assert.rejects(() => service.setGroupStatus('group-99', 'decided'), PlanGroupNotFoundError)
    assert.equal(repository.saves, before)
  })
})

/** Renomear o grupo pela linha dele: um campo, uma gravação, e os planos seguem apontando para o id. */
describe('renameGroup — o nome editado na linha do grupo', () => {
  it('troca o nome, apara os espaços e devolve o grupo renomeado', async () => {
    const { service } = setup()
    const trip = await service.addGroup({ label: 'Viagem' })
    const renamed = await service.renameGroup(trip.id, '  Viagem ao Chile  ')
    assert.equal(renamed.label, 'Viagem ao Chile')
    assert.equal(renamed.id, trip.id)
    const { groups } = await service.list()
    assert.equal(groups.find((g) => g.id === trip.id)?.label, 'Viagem ao Chile')
  })

  it('os planos do grupo continuam nele — o vínculo é pelo id, não pelo nome', async () => {
    const { service } = setup()
    const trip = await service.addGroup({ label: 'Viagem' })
    const ticket = await service.addPlan({ ...monitor, label: 'Passagem', groupId: trip.id })
    await service.renameGroup(trip.id, 'Chile')
    const { items } = await service.list()
    assert.equal(items.find((p) => p.id === ticket.id)?.groupId, trip.id)
  })

  it('é UMA gravação', async () => {
    const { repository, service } = setup()
    const trip = await service.addGroup({ label: 'Viagem' })
    const before = repository.saves
    await service.renameGroup(trip.id, 'Chile')
    assert.equal(repository.saves - before, 1)
  })

  it('recusa nome em branco, e nada é gravado', async () => {
    const { repository, service } = setup()
    const trip = await service.addGroup({ label: 'Viagem' })
    const before = repository.saves
    await assert.rejects(() => service.renameGroup(trip.id, '   '), InvalidPlanError)
    assert.equal(repository.saves, before)
  })

  it('grupo que não existe é PlanGroupNotFoundError', async () => {
    const { service } = setup()
    await assert.rejects(() => service.renameGroup('group-99', 'Chile'), PlanGroupNotFoundError)
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

/**
 * O invariante "ligado ⇒ decidido" é do SERVIÇO, e não da tela.
 *
 * A revisão final achou três portas por onde um plano ligado voltava a "em estudo" sem passar
 * por `unlinkPurchase`: o checkbox do grupo (`setGroupStatus` incluía o ligado em `reached`),
 * a gaveta de edição (`plan-sheet-schema.ts` pode gerar `status: 'considering'`) e um arquivo
 * importado. As três escrevem por `patched` ou por `setGroupStatus`, então o conserto fica ali.
 */
describe('plano ligado é sempre decidido', () => {
  it('setGroupStatus não alcança o plano ligado, e ele sai da contagem devolvida', async () => {
    const { service } = setup()
    const group = await service.addGroup({ label: 'Viagem' })
    const created = await service.addPlan({ ...monitor, label: 'Passagem', groupId: group.id })
    const linked = await service.linkPurchase(created.id, 'db78e48a1935')
    const open = await service.addPlan({ ...monitor, label: 'Hotel', groupId: group.id })

    const reached = await service.setGroupStatus(group.id, 'considering')
    assert.deepEqual(
      reached.map((p) => p.id),
      [open.id],
    )
    const { items } = await service.list()
    assert.equal(items.find((p) => p.id === linked.id)?.status, 'decided')
    assert.equal(items.find((p) => p.id === open.id)?.status, 'considering')
  })

  it('updatePlan não consegue devolver um plano ligado a "em estudo"', async () => {
    const { service } = setup()
    const created = await service.addPlan(monitor)
    await service.linkPurchase(created.id, 'db78e48a1935')

    const after = await service.updatePlan(created.id, { status: 'considering' })
    assert.equal(after.status, 'decided')
    const { items } = await service.list()
    assert.equal(items.find((p) => p.id === created.id)?.status, 'decided')
  })

  it('editar outro campo pela gaveta preserva o vínculo — o merge não o descarta', async () => {
    const { service } = setup()
    const created = await service.addPlan(monitor)
    await service.linkPurchase(created.id, 'db78e48a1935')

    const renamed = await service.updatePlan(created.id, { label: 'Novo nome' })
    assert.equal(renamed.purchaseId, 'db78e48a1935')
    assert.equal(renamed.status, 'decided')
  })
})

/** O vínculo com a compra parcelada: uma escrita, e uma compra liga a um plano só. */
describe('linkPurchase e unlinkPurchase', () => {
  it('ligar grava o id da parcela e marca o plano como decidido, numa escrita', async () => {
    const { repository, service } = setup()
    const created = await service.addPlan(monitor)
    const before = repository.saves
    const linked = await service.linkPurchase(created.id, 'db78e48a1935')
    assert.equal(linked.purchaseId, 'db78e48a1935')
    assert.equal(linked.status, 'decided')
    assert.equal(repository.saves - before, 1)
  })

  it('desvincular remove o id e mantém a situação', async () => {
    const { service } = setup()
    const created = await service.addPlan(monitor)
    await service.linkPurchase(created.id, 'db78e48a1935')
    const unlinked = await service.unlinkPurchase(created.id)
    assert.equal('purchaseId' in unlinked, false)
    assert.equal(unlinked.status, 'decided')
  })

  it('a compra já ligada a outro plano é recusada, e nada é gravado', async () => {
    const { repository, service } = setup()
    const first = await service.addPlan(monitor)
    const second = await service.addPlan({ ...monitor, label: 'Cadeira' })
    await service.linkPurchase(first.id, 'db78e48a1935')
    const before = repository.saves
    await assert.rejects(() => service.linkPurchase(second.id, 'db78e48a1935'), PurchaseAlreadyLinkedError)
    assert.equal(repository.saves, before)
  })

  it('religar o MESMO plano à mesma parcela não é conflito', async () => {
    const { service } = setup()
    const created = await service.addPlan(monitor)
    await service.linkPurchase(created.id, 'db78e48a1935')
    assert.equal((await service.linkPurchase(created.id, 'db78e48a1935')).purchaseId, 'db78e48a1935')
  })

  it('plano inexistente é PlanNotFoundError nos dois caminhos, sem gravar', async () => {
    const { repository, service } = setup()
    await service.addPlan(monitor)
    const before = repository.saves
    await assert.rejects(() => service.linkPurchase('plan-99', 'db78e48a1935'), PlanNotFoundError)
    await assert.rejects(() => service.unlinkPurchase('plan-99'), PlanNotFoundError)
    assert.equal(repository.saves, before)
  })
})
