import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyPlans, type PlansData } from '@wlet/domain/plans'
import { makePlansService } from '@wlet/services/plans/application/plans.service'
import type { PlanRepository } from '@wlet/services/plans/domain/ports/plan-repository'

/**
 * Duas escritas de plano em voo ao mesmo tempo PERDEM uma — e isto documenta que perdem.
 *
 * A porta do catálogo é um agregado: `mutate` (em `plans.service.ts`) lê tudo, aplica e grava tudo.
 * É decisão deliberada, e está justificada no port — um `PUT /plans` publica grupos e itens na mesma
 * transação, e um grupo sem os planos dele é estado que não se pode desenhar. O preço é este: quem
 * dispara a segunda escrita antes de a primeira voltar leu o retrato ANTIGO, e o `save` dela apaga a
 * primeira. Sem barulho nenhum — o plano simplesmente não está lá.
 *
 * **A tela é quem impede.** Rubricas trava a lista com `updatingRubric || deletingRubric`; Planos
 * passou a travar com `disabled={saving}`, depois de este teste mostrar que a perda é real e não
 * teórica. O teste fica como a razão daquele `disabled`: sem ele, alguém o remove por parecer zelo.
 *
 * **Se um dia a porta virar granular** — o contrato JÁ tem `POST /plans`, `PATCH /plans/{id}` e
 * `DELETE /plans/{id}`, hoje sem chamador —, este teste é o que muda de resposta, e é onde a mudança
 * deve ser provada.
 */
function slowRepository(ms: number): PlanRepository & { snapshot: () => PlansData } {
  let data: PlansData = emptyPlans()
  return {
    async findAll() {
      await new Promise((r) => setTimeout(r, ms))
      return structuredClone(data)
    },
    async save(next) {
      await new Promise((r) => setTimeout(r, ms))
      data = structuredClone(next)
    },
    snapshot: () => data,
  }
}

const draft = { label: 'x', cash: 100, categoryId: 'compras', status: 'considering' as const }

describe('escrita concorrente no catálogo de planos', () => {
  it('duas escritas simultâneas perdem uma — é o custo do agregado, e a tela é quem evita', async () => {
    const repository = slowRepository(20)
    let n = 0
    const service = makePlansService({ repository, ids: { next: () => `plan-${++n}` } })

    await Promise.all([service.addPlan({ ...draft, label: 'Primeiro' }), service.addPlan({ ...draft, label: 'Segundo' })])

    assert.equal(repository.snapshot().items.length, 1, 'se passarem os DOIS, a porta deixou de ser lê-aplica-grava — atualize este teste e o comentário do port')
  })

  it('em SÉRIE as duas sobrevivem — é isso que o `disabled` da tela garante', async () => {
    const repository = slowRepository(5)
    let n = 0
    const service = makePlansService({ repository, ids: { next: () => `plan-${++n}` } })

    await service.addPlan({ ...draft, label: 'Primeiro' })
    await service.addPlan({ ...draft, label: 'Segundo' })

    assert.deepEqual(
      repository.snapshot().items.map((p) => p.label),
      ['Primeiro', 'Segundo'],
    )
  })
})
