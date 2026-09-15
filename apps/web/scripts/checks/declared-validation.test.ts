import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Budget, Goal, PlannedEntry, Receivable } from '@wlet/domain'
import { browserEnv, type SourceFile } from '@wlet/ingest/io'
import { type AccountProfile, type IngestInput, runIngest } from '@wlet/ingest/pipeline'
import { buildRules } from '@wlet/ingest/rules'

/**
 * A VALIDAÇÃO do que você declarou — o segundo maior bloco sem teste do pipeline.
 *
 * Achado pela mesma medição do ciclo passado. E o que ele protege é sutil: nenhuma dessas
 * conferências LANÇA. Todas empurram uma frase para o relatório do ingest, porque o erro tem de
 * aparecer como texto legível e não como número estranho num gráfico três telas adiante.
 *
 * O preço disso é que a validação é INVISÍVEL se estiver errada: uma regra torta que deixa de ser
 * acusada não quebra nada — ela entra na previsão e projeta dinheiro que não existe, ou deixa de
 * projetar o que existe. O relatório fica limpo, que é justamente o sinal de que estaria tudo bem.
 */
const CONTA: AccountProfile = { id: 'corrente', name: 'Corrente', bank: 'Banco', bankCode: '001', type: 'checking', entity: 'PF', holder: 'Fulano', match: { bankCode: '001' } }

const OFX = `OFXHEADER:100
<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>B</ORG><FID>001</FID></FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>001</BANKID><ACCTID>1</ACCTID></BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260101</DTSTART><DTEND>20260131</DTEND>
<STMTTRN><DTPOSTED>20260105</DTPOSTED><TRNAMT>-10.00</TRNAMT><FITID>a</FITID><MEMO>MERCADO</MEMO></STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>10.00</BALAMT><DTASOF>20260131</DTASOF></LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

const budget: Budget = { monthlyLimit: 9000, warnAt: 0.75, byCategory: [] }
const source: SourceFile = { path: 'docs/extrato/a/janeiro.ofx', bytes: new TextEncoder().encode(OFX) }

const rule = (over: Partial<PlannedEntry>): PlannedEntry =>
  ({ id: 'p1', kind: 'expense', label: 'Aluguel', amount: 1500, categoryId: 'moradia', entity: 'PF', recurrence: 'monthly', startMonth: '2026-01', ...over }) as PlannedEntry

const charge = (over: Partial<Receivable>): Receivable =>
  ({
    id: 'r1',
    debtor: 'Alguém',
    label: 'Rateio',
    amount: 700,
    dueOn: { kind: 'day', day: 10 },
    recurrence: 'monthly',
    startMonth: '2026-01',
    match: { merchants: ['ALGUEM'] },
    offsetsCategoryId: 'moradia',
    ...over,
  }) as Receivable

const goal = (over: Partial<Goal>): Goal => ({ id: 'g1', label: 'Reserva', saved: 100, target: 1000, targetMonth: '2027-12', slot: 3, ...over }) as Goal

const ingest = (over: Partial<IngestInput>) =>
  runIngest({
    sources: [source],
    accounts: [CONTA],
    selfNamePatterns: [],
    rules: buildRules(),
    planned: [],
    receivables: [],
    budget,
    goals: [],
    now: '2026-02-01T00:00:00.000Z',
    env: browserEnv,
    ...over,
  } as IngestInput)

const problems = async (over: Partial<IngestInput>) => {
  const report = (await ingest(over)).report
  return [...report.plannedProblems, ...report.receivableProblems, ...report.goalProblems]
}

describe('a regra declarada é conferida antes de virar previsão', () => {
  it('categoria que não existe é acusada', async () => {
    // Sem isto, a regra projeta num id sem rótulo: o total do mês fica certo e a categoria some
    // do empilhado, porque nenhuma fatia sabe desenhá-la.
    const found = await problems({ planned: [rule({ categoryId: 'moradiaa' })] })
    assert.ok(
      found.some((p) => p.includes('moradiaa')),
      found.join(' | '),
    )
  })

  it('e categoria da ESPÉCIE errada também', async () => {
    // Uma regra de entrada apontando para categoria de despesa põe receita no lado do gasto — e o
    // mês fica com a saída inflada e a entrada faltando, os dois pela mesma quantia.
    const found = await problems({ planned: [rule({ kind: 'income', categoryId: 'moradia' })] })
    assert.ok(
      found.some((p) => p.includes('é de expense')),
      found.join(' | '),
    )
  })

  it('valor não positivo é acusado', async () => {
    // O sinal vem do `kind`, não do valor. Um valor negativo aqui viraria uma despesa que SOMA
    // ao saldo previsto.
    assert.ok((await problems({ planned: [rule({ amount: -100 })] })).some((p) => p.includes('maior que zero')))
  })

  it('id repetido é acusado', async () => {
    // A conciliação atribui pagamento por id. Com dois iguais, o dinheiro de um quita o outro e
    // uma das duas contas aparece paga sem ter sido.
    assert.ok((await problems({ planned: [rule({}), rule({ label: 'Outra' })] })).some((p) => p.includes('id repetido')))
  })

  it('mês fora do formato AAAA-MM é acusado', async () => {
    // A comparação de mês é de STRING: `'2026-1'` é menor que `'2026-01'` em ordem de texto, e a
    // regra passaria a incidir em meses que não deveria.
    assert.ok((await problems({ planned: [rule({ startMonth: '2026-1' })] })).some((p) => p.includes('não é AAAA-MM')))
  })

  it('dia fora de 1..31 é acusado', async () => {
    assert.ok((await problems({ planned: [rule({ dueOn: { kind: 'day', day: 32 } })] })).some((p) => p.includes('dueOn.day')))
  })

  it('e o n-ésimo dia útil acima de 18 também — nenhum mês tem tantos', async () => {
    // O contrato clampa no mesmo número. Um `nth` de 23 nunca resolveria uma data, e a ocorrência
    // sumiria da previsão sem nada avisar.
    assert.ok((await problems({ planned: [rule({ dueOn: { kind: 'business-day', nth: 23 } })] })).some((p) => p.includes('dueOn.nth')))
  })

  it('regra COM credor precisa de dia', async () => {
    // Conciliar sem dia deixa "atrasado" indistinguível de "ainda vai vencer" — a tela de
    // Pagamentos não teria como ordenar nem cobrar nada.
    const found = await problems({ planned: [rule({ match: { merchants: ['IMOBILIARIA'] } as never })] })
    assert.ok(
      found.some((p) => p.includes('precisa de dueOn')),
      found.join(' | '),
    )
  })

  it('e conta que não existe no conjunto é acusada', async () => {
    const found = await problems({ planned: [rule({ dueOn: { kind: 'day', day: 5 }, match: { merchants: ['X'], accountId: 'conta-fantasma' } as never })] })
    assert.ok(found.some((p) => p.includes('conta-fantasma')))
  })
})

describe('a cobrança abate DESPESA — nunca entrada', () => {
  it('categoria de entrada é acusada', async () => {
    // A regra que mais importa aqui. Uma cobrança que abatesse "Renda PF" não reduziria despesa
    // nenhuma: o rateio recebido sumiria do cálculo e o aluguel continuaria cheio na previsão.
    const found = await problems({ receivables: [charge({ offsetsCategoryId: 'renda-pf' })] })
    assert.ok(
      found.some((p) => p.includes('abate DESPESA')),
      found.join(' | '),
    )
  })

  it('e categoria inexistente também', async () => {
    assert.ok((await problems({ receivables: [charge({ offsetsCategoryId: 'nao-existe' })] })).some((p) => p.includes('nao-existe')))
  })

  it('devedor em branco é acusado', async () => {
    // O nome do devedor é o que a tela mostra e o que o casamento usa para dizer quem pagou.
    assert.ok((await problems({ receivables: [charge({ debtor: '  ' })] })).some((p) => p.includes('sem devedor')))
  })

  it('fim antes do começo é acusado', async () => {
    assert.ok((await problems({ receivables: [charge({ endMonth: '2025-12' })] })).some((p) => p.includes('endMonth antes')))
  })
})

describe('a meta também é conferida', () => {
  it('uma declaração sã não gera problema nenhum', async () => {
    // O contraponto que impede o teste de passar por vacuidade: se a validação começar a acusar
    // tudo, este fica vermelho.
    assert.deepEqual(await problems({ planned: [rule({ dueOn: { kind: 'day', day: 10 } })], receivables: [charge({})], goals: [goal({})] }), [])
  })
})
