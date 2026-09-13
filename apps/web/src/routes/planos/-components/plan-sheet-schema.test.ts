import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planFormSchema } from './plan-sheet-schema'

/**
 * A SAÍDA do formulário de plano — provada sem montar React.
 *
 * A `form-output-contract.md` §1.1 é explícita sobre onde esses casos devem viver: o schema é uma
 * função de objeto para objeto, e o teste dele é `parse` direto. Montar componente para provar regra
 * de schema é pagar DOM por nada. Enquanto o schema era um `const` privado dentro do `.tsx`, esse
 * teste não podia existir — e as regras abaixo são as que o `CLAUDE.md` registra como já tendo
 * custado bug.
 *
 * O que se prova aqui é que `z.output<typeof schema>` É o plano: o formulário não tem adaptador na
 * frente, e trocar um campo de `Plan` quebra a compilação deste arquivo.
 */
const base = {
  label: 'Monitor',
  cash: 3000,
  financedTotal: 0,
  installments: 2,
  payment: null,
  categoryId: 'compras',
  month: null,
  groupId: null,
  status: 'considering' as const,
}

describe('a saída do formulário de plano', () => {
  it('a ausência sai como undefined, não como null nem string vazia', () => {
    // Os campos opcionais querem dizer "ainda não decidi". `null` é o que os controles guardam
    // (input não sabe dizer undefined); o PLANO usa `undefined`, e a conversão é do schema.
    const plan = planFormSchema.parse(base)
    assert.equal(plan.payment, undefined)
    assert.equal(plan.month, undefined)
    assert.equal(plan.groupId, undefined)
    assert.equal(plan.financed, undefined, 'sem preço parcelado, o bloco inteiro some')
    assert.deepEqual(Object.keys(plan).sort(), ['cash', 'categoryId', 'financed', 'groupId', 'label', 'month', 'payment', 'status'])
  })

  it('o par de preços vira o bloco financed quando os DOIS existem', () => {
    assert.deepEqual(planFormSchema.parse({ ...base, financedTotal: 3400, installments: 10 }).financed, { total: 3400, installments: 10 })
    // Preço parcelado sem contagem válida não forma bloco: 1× não é parcelamento.
    assert.equal(planFormSchema.safeParse({ ...base, financedTotal: 3400, installments: 1 }).success, false)
  })

  it('parcelado exige 2 a 99 vezes — mas só quando há preço parcelado', () => {
    // O bloco é opcional inteiro: exigir a faixa de quem deixou tudo em branco transformaria a
    // opção numa obrigação.
    assert.equal(planFormSchema.safeParse({ ...base, financedTotal: 0, installments: 0 }).success, true)
    for (const installments of [1, 100, 2.5]) {
      const r = planFormSchema.safeParse({ ...base, financedTotal: 900, installments })
      assert.equal(r.success, false, `${installments} devia ser recusado`)
      if (!r.success) assert.match(r.error.issues[0].message, /2 a 99/)
    }
  })

  /**
   * Este é o caso que o `CLAUDE.md` registra como bug corrigido, e é a razão de o teste existir.
   *
   * Escolher parcelado e depois apagar o preço deixa um estado que não se pode desenhar. Ele recua
   * para NÃO DECIDIDO — e não para "à vista", que inventaria uma decisão que ninguém tomou.
   */
  it('parcelado SEM preço parcelado recua para não decidido, nunca para à vista', () => {
    const plan = planFormSchema.parse({ ...base, payment: 'financed', financedTotal: 0 })
    assert.equal(plan.payment, undefined)
    assert.notEqual(plan.payment, 'cash')
  })

  it('com preço parcelado, a escolha "parcelado" sobrevive', () => {
    const plan = planFormSchema.parse({ ...base, payment: 'financed', financedTotal: 3400, installments: 10 })
    assert.equal(plan.payment, 'financed')
  })

  it('recusa nome vazio, preço à vista ausente e mês malformado', () => {
    assert.equal(planFormSchema.safeParse({ ...base, label: '   ' }).success, false)
    assert.equal(planFormSchema.safeParse({ ...base, cash: 0 }).success, false, 'à vista é o preço obrigatório')
    assert.equal(planFormSchema.safeParse({ ...base, month: '2026-1' }).success, false)
    assert.equal(planFormSchema.safeParse({ ...base, month: '2026-01' }).success, true)
  })

  it('o nome é aparado', () => {
    assert.equal(planFormSchema.parse({ ...base, label: '  Monitor  ' }).label, 'Monitor')
  })
})
