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

/**
 * Os seis ramos que o medidor apontou — `settlement.ts` tinha 99,4% de LINHAS e 84,9% de RAMOS.
 *
 * A diferença entre os dois números é o assunto daqui: cada linha abaixo já rodava, mas sempre pelo
 * mesmo lado do `?`. Num módulo que decide qual dinheiro paga qual obrigação, o lado que nunca roda
 * é o que produz tela errada com extrato certo.
 */
describe('o vencimento em DIA ÚTIL — o outro lado do `dueOn`', () => {
  it('"5º dia útil" não é "dia 5", e a diferença decide se você está em atraso', () => {
    // Novembro de 2026: o 5º dia útil cai em 09, e o dia 5 do calendário é 05. Salário e aluguel
    // costumam vencer assim, e é a forma mais fácil de o número certo virar cor errada — nada
    // estoura, a pessoa pagou no prazo, e a tela diz que ela está devendo.
    const porDiaUtil: SettlementRule = { id: 'salario', amount: 5000, dueOn: { kind: 'business-day', nth: 5 }, recurrence: 'monthly', startMonth: '2026-11' }
    const [ocorrencia] = settleAll([porDiaUtil], [], '2026-11', '2026-11-06')

    assert.equal(ocorrencia.dueDate, '2026-11-09')
    assert.equal(ocorrencia.status, 'open', 'em 06/11 o prazo ainda não chegou')
    // O contraste é o teste: a MESMA data de corte, lida pelo calendário, já teria vencido.
    const porDia: SettlementRule = { ...porDiaUtil, dueOn: { kind: 'day', day: 5 } }
    assert.equal(settleAll([porDia], [], '2026-11', '2026-11-06')[0].status, 'overdue')
  })
})

describe('a JANELA de uma regra — onde ela começa e onde para', () => {
  it('`once` incide num mês SÓ, e não em todos até o último com dado', () => {
    // O IPVA, o seguro anual, a matrícula: obrigação única. Se ela caísse no caminho da mensal, a
    // janela iria até o último mês com dado e a tela mostraria a MESMA dívida repetida em cada mês,
    // todas em atraso — dívida fabricada, com o extrato intacto.
    const unica: SettlementRule = { id: 'ipva', amount: 1200, dueOn: { kind: 'day', day: 10 }, recurrence: 'once', startMonth: '2026-07' }
    const meses = settleAll([unica], [], '2026-12', HOJE).map((o) => o.month)
    assert.deepEqual(meses, ['2026-07'])
  })

  it('a mensal com `endMonth` PARA nele, em vez de ir até o último mês com dado', () => {
    // A assinatura cancelada em agosto. Sem este ramo, setembro a dezembro apareceriam em atraso —
    // e o valor total "em aberto" da tela cresceria por conta de uma obrigação que não existe mais.
    //
    // **Este ramo e o do `limit` logo abaixo se PROTEGEM, e a falsificação mostrou isso.** Tirar só
    // o `rule.endMonth ??` deixa `end` ir até o último mês com dado, mas o `limit` da linha seguinte
    // trunca em agosto do mesmo jeito; tirar só o `limit` é pego pelo caso da parcelada, onde a
    // contagem termina DEPOIS do fim declarado. Cada um sozinho é inalcançável pelo teste — só os
    // dois juntos ficam vermelhos. Fica escrito porque a leitura fácil é "há dois lugares fazendo a
    // mesma coisa, apague um": o de cima é o único que atende a mensal SEM `endMonth`, que é o caso
    // comum, e o de baixo é o único que trunca a parcelada.
    const comFim: SettlementRule = { ...mensal, endMonth: '2026-08' }
    assert.deepEqual(
      settleAll([comFim], [], '2026-12', HOJE).map((o) => o.month),
      ['2026-08', '2026-07'],
      'do mais recente para o mais antigo, e nada depois de agosto',
    )
  })

  it('e `endMonth` também TRUNCA uma parcelada que terminaria depois', () => {
    // O plano de 6× quitado adiantado no segundo mês: o acordo acabou, e as quatro parcelas
    // restantes não podem seguir cobrando. É o ramo em que os dois fins existem e o MENOR vence.
    const truncada: SettlementRule = { ...parcelada, endMonth: '2026-08' }
    assert.deepEqual(
      settleAll([truncada], [], '2026-12', HOJE).map((o) => o.month),
      ['2026-08', '2026-07'],
      'a contagem diria dezembro; o fim declarado diz agosto',
    )
  })
})

describe('os DESEMPATES — o que torna a conciliação determinística', () => {
  it('dois pagamentos no MESMO dia produzem a mesma alocação, venham na ordem que vierem', () => {
    // Este é o pior dos seis, porque não produz tela errada: produz tela DIFERENTE a cada leitura.
    // Sem o desempate por id, a ordem de `own` seria a ordem de chegada, e a repartição do
    // pagamento entre as parcelas mudaria com ela — o mesmo extrato, importado duas vezes, mostraria
    // parcelas cobertas por lançamentos distintos, e o caminho de volta ao extrato apontaria para
    // outro lugar. Nada acusa: as duas leituras são internamente coerentes.
    const primeiro = pago('t1', '2026-07-15', 700, 'viagem')
    const segundo = pago('t2', '2026-07-15', 300, 'viagem')
    const emOrdem = settleAll([parcelada], [primeiro, segundo], '2026-08', HOJE)
    const invertido = settleAll([parcelada], [segundo, primeiro], '2026-08', HOJE)

    assert.deepEqual(invertido, emOrdem, 'a ordem de chegada não pode mudar o resultado')
    // E o resultado é o que o id ordena: a primeira parcela sai inteira de `t1`.
    assert.deepEqual(emOrdem.find((o) => o.month === '2026-07')!.transactionIds, ['t1'])
    assert.deepEqual(emOrdem.find((o) => o.month === '2026-08')!.transactionIds, ['t1', 't2'], 'o resto de t1, completado por t2')
  })

  it('duas regras no mesmo mês saem na ordem da REGRA, não na de chegada', () => {
    // O mês é o primeiro critério e ordena do mais recente para o mais antigo; dentro dele, o
    // desempate existe para a lista não dançar entre dois carregamentos da mesma tela.
    //
    // Duas regras `once` no MESMO mês, para a saída ter exatamente duas linhas: com a parcelada a
    // janela dela seguiria até a sexta parcela e o mês seria o primeiro critério a separar quase
    // tudo — o desempate ficaria escondido atrás do que já estava ordenado. Foi o que aconteceu na
    // primeira versão deste teste, que falhou por eu ter olhado a lista inteira.
    const viagem: SettlementRule = { id: 'viagem', amount: 500, dueOn: { kind: 'day', day: 10 }, recurrence: 'once', startMonth: '2026-07' }
    const aluguel: SettlementRule = { id: 'aluguel', amount: 1000, dueOn: { kind: 'day', day: 25 }, recurrence: 'once', startMonth: '2026-07' }
    const output = settleAll([viagem, aluguel], [], '2026-07', HOJE)
    assert.deepEqual(
      output.map((o) => o.ruleId),
      ['aluguel', 'viagem'],
      'passei viagem primeiro; sai aluguel primeiro',
    )
  })
})
