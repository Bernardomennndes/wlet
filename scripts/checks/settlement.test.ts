import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { settleAll, type SettleableTransaction, type SettlementRule } from '../../src/lib/settlement.ts'

const HOJE = '2026-09-06'

function pago(id: string, date: string, amount: number, ruleId: string): SettleableTransaction {
  return { id, amount, date, month: date.slice(0, 7), merchant: 'Fulano', ruleId }
}

const mensal: SettlementRule = { id: 'aluguel', amount: 1000, dueOn: { kind: 'day', day: 25 }, recurrence: 'monthly', startMonth: '2026-07' }
const parcelada: SettlementRule = { id: 'viagem', amount: 500, dueOn: { kind: 'day', day: 10 }, recurrence: 'installments', startMonth: '2026-07', count: 6 }

describe('mensal: cada mês é uma obrigação própria', () => {
  it('sobra de um mês NÃO cobre o seguinte', () => {
    // Pagou o dobro em julho e nada em agosto: agosto continua em aberto.
    const out = settleAll([mensal], [pago('t1', '2026-07-20', 2000, 'aluguel')], '2026-09', HOJE)
    const julho = out.find((o) => o.month === '2026-07')!
    const agosto = out.find((o) => o.month === '2026-08')!
    assert.equal(julho.status, 'settled')
    assert.equal(julho.actual, 2000)
    assert.equal(agosto.actual, 0)
    assert.equal(agosto.status, 'overdue', 'venceu em 25/08, antes do corte')
  })

  it('parcial quando entra menos que o esperado', () => {
    const out = settleAll([mensal], [pago('t1', '2026-07-20', 400, 'aluguel')], '2026-07', HOJE)
    assert.equal(out[0].status, 'partial')
    assert.equal(out[0].actual, 400)
  })

  it('em aberto, e não em atraso, quando o vencimento ainda não chegou', () => {
    const out = settleAll([mensal], [], '2026-09', HOJE)
    // Setembro vence em 25/09, depois do corte de 06/09.
    assert.equal(out.find((o) => o.month === '2026-09')!.status, 'open')
  })
})

describe('parcelada: uma dívida em N vezes', () => {
  it('pagamento adiantado cobre as parcelas seguintes', () => {
    // Três parcelas quitadas num agosto só — um pagamento adiantado.
    const out = settleAll([parcelada], [pago('t1', '2026-08-05', 500, 'viagem'), pago('t2', '2026-08-16', 1000, 'viagem')], '2026-09', HOJE)
    const porMes = Object.fromEntries(out.map((o) => [o.month, o.status]))
    assert.equal(porMes['2026-07'], 'settled')
    assert.equal(porMes['2026-08'], 'settled')
    assert.equal(porMes['2026-09'], 'settled', 'coberta pelo adiantamento, não em aberto')
    assert.equal(porMes['2026-10'], 'open')
  })

  it('a janela vai até o fim da contagem, mesmo no futuro', () => {
    const out = settleAll([parcelada], [], '2026-08', HOJE)
    const meses = out.map((o) => o.month).sort()
    assert.deepEqual(meses, ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'])
  })

  it('o resto de um pagamento escorre para a parcela seguinte', () => {
    const out = settleAll([parcelada], [pago('t1', '2026-07-10', 700, 'viagem')], '2026-08', HOJE)
    const julho = out.find((o) => o.month === '2026-07')!
    const agosto = out.find((o) => o.month === '2026-08')!
    assert.equal(julho.actual, 500, 'a parcela não recebe mais do que vale')
    assert.equal(agosto.actual, 200, 'os 200 que sobraram')
    assert.equal(agosto.status, 'partial')
  })
})

describe('regra sem dia de vencimento', () => {
  it('nunca fica em atraso — sem dia não há prazo a vencer', () => {
    const semDia: SettlementRule = { id: 'x', amount: 100, recurrence: 'monthly', startMonth: '2026-07' }
    for (const o of settleAll([semDia], [], '2026-09', HOJE)) {
      assert.equal(o.status, 'open', o.month)
      assert.equal(o.dueDate, null)
    }
  })
})

describe('exceções de valor', () => {
  it('o mês declarado na exceção usa o valor dela', () => {
    const comExcecao: SettlementRule = { ...mensal, exceptions: { '2026-08': 300 } }
    const out = settleAll([comExcecao], [pago('t1', '2026-08-20', 300, 'aluguel')], '2026-08', HOJE)
    const agosto = out.find((o) => o.month === '2026-08')!
    assert.equal(agosto.expected, 300)
    assert.equal(agosto.status, 'settled')
  })
})

describe('quem cumpriu', () => {
  it('registra o pagador de cada ocorrência', () => {
    const familiar: SettleableTransaction = { id: 't2', amount: 1000, date: '2026-08-20', month: '2026-08', merchant: 'Familiar', ruleId: 'aluguel' }
    const out = settleAll([mensal], [pago('t1', '2026-07-20', 1000, 'aluguel'), familiar], '2026-08', HOJE)
    assert.deepEqual(out.find((o) => o.month === '2026-08')!.counterparts, ['Familiar'])
    assert.deepEqual(out.find((o) => o.month === '2026-07')!.counterparts, ['Fulano'])
  })
})
