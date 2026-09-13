import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { plannedFormSchema } from './planned-sheet-schema'

/**
 * A SAÍDA da gaveta de lançamento previsto — provada sem montar React.
 *
 * É o schema com mais decisão do projeto: três campos que SOMEM por ramo, uma união discriminada no
 * dia do vencimento, e o credor que decide se a regra é mera projeção ou conta a pagar. A
 * `form-output-contract.md` §1.1 pede exatamente este teste, e ele não existia porque o schema era um
 * `const` privado dentro do `.tsx`.
 */
const base = {
  label: 'Aluguel',
  amount: 1500,
  kind: 'expense' as const,
  categoryId: 'moradia',
  entity: 'PF' as const,
  recurrence: 'monthly' as const,
  startMonth: '2026-01',
  count: 0,
  endMonth: '',
  merchants: '',
}

describe('a saída do lançamento previsto', () => {
  it('os três campos condicionais SOMEM quando não se aplicam', () => {
    // Ausência é a informação: sem `match` a regra é só projeção, e `count`/`endMonth` só existem
    // no ramo que os usa. Ir como zero ou string vazia inventaria dado que ninguém digitou.
    const entry = plannedFormSchema.parse(base)
    assert.equal(entry.count, undefined)
    assert.equal(entry.endMonth, undefined)
    assert.equal(entry.match, undefined)
    assert.equal(entry.dueOn, undefined)
  })

  it('`count` só sobrevive em parcelada; `endMonth` só em mensal', () => {
    const parcelada = plannedFormSchema.parse({ ...base, recurrence: 'installments', count: 6, endMonth: '2026-12' })
    assert.equal(parcelada.count, 6)
    assert.equal(parcelada.endMonth, undefined, 'parcelada tem contagem, não prazo')

    const mensal = plannedFormSchema.parse({ ...base, recurrence: 'monthly', count: 6, endMonth: '2026-12' })
    assert.equal(mensal.endMonth, '2026-12')
    assert.equal(mensal.count, undefined, 'mensal tem prazo, não contagem')

    const unica = plannedFormSchema.parse({ ...base, recurrence: 'once', count: 6, endMonth: '2026-12' })
    assert.equal(unica.count, undefined)
    assert.equal(unica.endMonth, undefined)
  })

  it('parcelada SEM contagem é recusada — a janela dela iria ao infinito', () => {
    for (const count of [0, -1, 2.5]) {
      const r = plannedFormSchema.safeParse({ ...base, recurrence: 'installments', count })
      assert.equal(r.success, false, `count ${count} devia ser recusado`)
      if (!r.success) assert.match(r.error.issues[0].message, /parcelada precisa do número/)
    }
  })

  /**
   * O credor é o que separa as duas naturezas de uma declaração, e a normalização dele é regra:
   * maiúsculas e sem espaço, porque é assim que o casamento compara contra o extrato.
   */
  it('o credor vira lista NORMALIZADA, e vazio não cria match', () => {
    const comCredor = plannedFormSchema.parse({ ...base, merchants: ' imobiliária silva , JOÃO  ' })
    assert.deepEqual(comCredor.match, { merchants: ['IMOBILIÁRIA SILVA', 'JOÃO'] })
    // Só separadores não é credor: `match` tem de continuar ausente, senão a projeção virava
    // conta a pagar com uma lista vazia dentro.
    assert.equal(plannedFormSchema.parse({ ...base, merchants: ' , , ' }).match, undefined)
  })

  it('o dia do vencimento é união discriminada, com o teto de CADA forma', () => {
    assert.deepEqual(plannedFormSchema.parse({ ...base, dueOn: { kind: 'day', day: 31 } }).dueOn, { kind: 'day', day: 31 })
    assert.equal(plannedFormSchema.safeParse({ ...base, dueOn: { kind: 'day', day: 32 } }).success, false)
    // 18 e não 23: é o que o validador do pipeline aceita, e o campo acompanha quem recusa.
    assert.deepEqual(plannedFormSchema.parse({ ...base, dueOn: { kind: 'business-day', nth: 18 } }).dueOn, { kind: 'business-day', nth: 18 })
    assert.equal(plannedFormSchema.safeParse({ ...base, dueOn: { kind: 'business-day', nth: 19 } }).success, false)
    // Misturar as duas formas não passa: `day` não existe em dia útil.
    assert.equal(plannedFormSchema.safeParse({ ...base, dueOn: { kind: 'business-day', day: 5 } as never }).success, false)
  })

  it('recusa mês malformado e mês 13', () => {
    assert.equal(plannedFormSchema.safeParse({ ...base, startMonth: '2026-1' }).success, false)
    assert.equal(plannedFormSchema.safeParse({ ...base, startMonth: '2026-13' }).success, false)
    assert.equal(plannedFormSchema.safeParse({ ...base, startMonth: '2026-00' }).success, false)
    assert.equal(plannedFormSchema.safeParse({ ...base, startMonth: '2026-12' }).success, true)
  })

  it('recusa nome vazio e valor não positivo', () => {
    assert.equal(plannedFormSchema.safeParse({ ...base, label: '  ' }).success, false)
    assert.equal(plannedFormSchema.safeParse({ ...base, amount: 0 }).success, false)
  })

  it('`exceptions` NÃO entra na saída — não há campo para ela na gaveta', () => {
    // Payload que carrega dado que nenhuma tecla produziu é adaptador disfarçado. Quem edita é que
    // preserva as exceções, do mesmo jeito que preserva o `id`.
    assert.equal('exceptions' in plannedFormSchema.parse(base), false)
  })
})
