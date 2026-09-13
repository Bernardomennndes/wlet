import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { budgetCadences } from '@wlet/domain'
import { rubricAmountSchema, rubricItemSchema } from './rubricas-form-schema'

/**
 * O item de uma rubrica composta — e a decisão que este teste existe para proteger.
 *
 * **O nome NÃO é obrigatório**, e isso é desenho, não esquecimento: o item nasce vazio, e exigir
 * nome no commit faria a quantidade e o preço de um item recém-criado não gravarem enquanto ninguém
 * o batizasse — uma recusa silenciosa, que é pior que o campo em branco.
 *
 * É o tipo de decisão que alguém "conserta" de boa-fé. Com o teste, consertar quebra a suíte em vez
 * de quebrar a tela em silêncio.
 */
const base = { label: '', quantity: 2, unit: 'kg', cadence: 'week' as const, unitAmount: 22 }

describe('o item de uma rubrica', () => {
  it('aceita nome VAZIO — é o item recém-criado, e recusá-lo travaria a gravação', () => {
    const r = rubricItemSchema.safeParse(base)
    assert.equal(r.success, true)
    assert.equal(rubricItemSchema.parse(base).label, '')
  })

  it('recusa quantidade e preço negativos, que não têm leitura possível', () => {
    const q = rubricItemSchema.safeParse({ ...base, quantity: -1 })
    assert.equal(q.success, false)
    if (!q.success) assert.match(q.error.issues[0].message, /quantidade não pode ser negativa/)
    const p = rubricItemSchema.safeParse({ ...base, unitAmount: -0.01 })
    assert.equal(p.success, false)
    if (!p.success) assert.match(p.error.issues[0].message, /preço unitário não pode ser negativo/)
    // Zero é valor legítimo: um item cujo preço ainda não se sabe.
    assert.equal(rubricItemSchema.safeParse({ ...base, quantity: 0, unitAmount: 0 }).success, true)
  })

  it('a cadência sai da lista do DOMÍNIO, não de um z.enum redigitado', () => {
    for (const { value } of budgetCadences) assert.equal(rubricItemSchema.safeParse({ ...base, cadence: value }).success, true, value)
    assert.equal(rubricItemSchema.safeParse({ ...base, cadence: 'ano' }).success, false)
  })

  it('a unidade é texto LIVRE — uma lista fechada obrigaria a mentir sobre a compra', () => {
    for (const unit of ['', 'kg', 'pote', 'caixa de 12']) assert.equal(rubricItemSchema.safeParse({ ...base, unit }).success, true, unit)
  })
})

describe('o teto de uma rubrica simples', () => {
  it('aceita zero e recusa negativo', () => {
    assert.equal(rubricAmountSchema.safeParse({ amount: 0 }).success, true)
    const r = rubricAmountSchema.safeParse({ amount: -1 })
    assert.equal(r.success, false)
    if (!r.success) assert.match(r.error.issues[0].message, /planejado não pode ser negativo/)
  })
})
