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
