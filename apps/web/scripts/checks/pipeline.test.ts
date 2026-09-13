import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Budget } from '@wlet/domain'
import { browserEnv, type SourceFile } from '@wlet/ingest/io'
import { type AccountProfile, type IngestInput, pickBestFormat, runIngest } from '@wlet/ingest/pipeline'
import { buildRules } from '@wlet/ingest/rules'

/**
 * O pipeline de ponta a ponta, sobre um extrato SINTÉTICO.
 *
 * `packages/ingest` era o maior vão da suíte, e a razão registrada era "testá-los exige fixture de
 * extrato real, e extrato real é dado bancário". A premissa estava errada pela metade: o que os
 * leitores precisam é de um arquivo no FORMATO, não de um arquivo de verdade. Um OFX escrito aqui
 * dentro tem dez linhas, não contém dado de ninguém, e exercita `pipeline` + `parsers` + `rules` +
 * `matching` juntos — que é o caminho que produz todo número do app.
 *
 * O núcleo é testável porque foi desenhado assim, e os docblocks dizem por quê: `env` entra por
 * injeção (`IngestEnv`, em `io.ts`) e `now` também, "para o mesmo `docs/` não produzir dois JSON
 * diferentes". As duas decisões estavam escritas e nunca tinham sido cobradas.
 */
const OFX = (transactions: string, over: { acctId?: string; bankId?: string } = {}) => `
OFXHEADER:100
<OFX>
  <SIGNONMSGSRSV1><SONRS><FI><ORG>BANCO EXEMPLO</ORG><FID>001</FID></FI></SONRS></SIGNONMSGSRSV1>
  <BANKMSGSRSV1><STMTTRNRS><STMTRS>
    <BANKACCTFROM><BANKID>${over.bankId ?? '001'}</BANKID><ACCTID>${over.acctId ?? '12345-6'}</ACCTID></BANKACCTFROM>
    <BANKTRANLIST><DTSTART>20260101</DTSTART><DTEND>20260131</DTEND>
${transactions}
    </BANKTRANLIST>
    <LEDGERBAL><BALAMT>1000.00</BALAMT><DTASOF>20260131</DTASOF></LEDGERBAL>
  </STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`

const TRN = (date: string, amount: string, memo: string, fitId = `${date}-${amount}`) =>
  `      <STMTTRN><TRNTYPE>${Number(amount) > 0 ? 'CREDIT' : 'DEBIT'}</TRNTYPE><DTPOSTED>${date}</DTPOSTED><TRNAMT>${amount}</TRNAMT><FITID>${fitId}</FITID><MEMO>${memo}</MEMO></STMTTRN>`

const file = (path: string, text: string): SourceFile => ({ path, bytes: new TextEncoder().encode(text) })

const PROFILE: AccountProfile = {
  id: 'conta-exemplo',
  name: 'Conta Exemplo',
  bank: 'Banco Exemplo',
  bankCode: '001',
  type: 'checking',
  entity: 'PF',
  holder: 'Fulano',
  match: { bankCode: '001' },
}

const budget: Budget = { monthlyLimit: 9000, warnAt: 0.75, byCategory: [] }

const input = (sources: SourceFile[], over: Partial<IngestInput> = {}): IngestInput => ({
  sources,
  accounts: [PROFILE],
  selfNamePatterns: [],
  rules: buildRules(),
  planned: [],
  receivables: [],
  budget,
  goals: [],
  now: '2026-02-01T00:00:00.000Z',
  env: browserEnv,
  ...over,
})

describe('o pipeline lê um extrato e produz lançamentos', () => {
  it('data, valor, conta e categoria atravessam', async () => {
    const ofx = OFX([TRN('20260105', '-120.50', 'DROGARIA SAO PAULO'), TRN('20260110', '5000.00', 'PIX RECEBIDO DE CLIENTE')].join('\n'))
    const result = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', ofx)]))

    assert.equal(result.transactions.length, 2)
    const outflow = result.transactions.find((t) => t.amount < 0)
    assert.ok(outflow)
    assert.equal(outflow.date, '2026-01-05')
    assert.equal(outflow.amount, -120.5)
    assert.equal(outflow.accountId, 'conta-exemplo', 'a conta saiu do perfil declarado, pelo código do banco')
    assert.equal(outflow.categoryId, 'saude', 'a regra de drogaria pegou')
  })

  it('o mesmo arquivo, duas vezes, NÃO duplica lançamento', async () => {
    // A pessoa baixa o extrato de novo e joga na pasta. Sem a deduplicação por id, janeiro
    // apareceria com o dobro do gasto — e nada indicaria que foi o download repetido.
    const ofx = OFX(TRN('20260105', '-120.50', 'DROGARIA SAO PAULO'))
    const { transactions, report } = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', ofx), file('docs/extrato/exemplo/janeiro (1).ofx', ofx)]))

    assert.equal(transactions.length, 1, 'um lançamento, não dois')
    assert.ok(report.duplicated.length >= 1 || report.skipped.length >= 1, 'o relatório registra o que foi descartado')
  })

  it('o id é DETERMINÍSTICO: duas rodadas do mesmo arquivo dão o mesmo id', async () => {
    // É o que sustenta o ajuste manual de categoria: `overrides` é chaveado pelo id do
    // lançamento. Um id que mudasse a cada ingestão apagaria todo ajuste em silêncio.
    const ofx = OFX(TRN('20260105', '-120.50', 'DROGARIA SAO PAULO'))
    const um = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', ofx)]))
    const dois = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', ofx)]))
    assert.equal(um.transactions[0].id, dois.transactions[0].id)
  })

  it('`now` é INJETADO, então o mesmo `docs/` produz o mesmo resultado', async () => {
    // O docblock de `IngestInput` diz que `generatedAt` saía de `new Date()` e tornava a saída
    // incomparável entre rodadas. A injeção é o que torna executável a conferência "mesmo docs,
    // mesmo resultado" — e sem teste ela era só uma promessa.
    const ofx = OFX(TRN('20260105', '-120.50', 'DROGARIA SAO PAULO'))
    const { meta } = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', ofx)], { now: '2026-03-09T12:00:00.000Z' }))
    assert.equal(meta.generatedAt, '2026-03-09T12:00:00.000Z')
  })

  it('conta que nenhum perfil reconhece é CRIADA, e o relatório a nomeia', async () => {
    // Escrevi este teste esperando que o lançamento fosse DESCARTADO, e ele não é — o pipeline
    // fabrica a conta a partir dos metadados do próprio OFX. O comportamento real é melhor do que
    // o que eu supus: descartar faria o dinheiro sumir da soma sem nada dizer, e quem lê um total
    // menor não tem como saber que faltou um extrato. Criar mantém o número certo e empurra a
    // decisão para quem lê o relatório, que é onde ela pertence.
    //
    // Fica preso aqui porque é exatamente o tipo de coisa que alguém "conserta" para descartar.
    const ofx = OFX(TRN('20260105', '-80.00', 'PADARIA'), { bankId: '999', acctId: '77' })
    const { transactions, accounts, report } = await runIngest(input([file('docs/extrato/desconhecido/janeiro.ofx', ofx)], { accounts: [] }))

    assert.equal(transactions.length, 1, 'o lançamento entra')
    assert.equal(accounts.length, 1, 'com uma conta fabricada para ele')
    assert.equal(transactions[0].accountId, accounts[0].id, 'e apontando para ela — nenhum lançamento fica sem conta')
    assert.deepEqual(report.unknownAccounts, [accounts[0].id], 'o relatório diz qual conta nasceu sozinha')
  })
})

describe('pickBestFormat', () => {
  it('o mesmo extrato em dois formatos entra UMA vez', async () => {
    // Bancos oferecem o mesmo mês em OFX e CSV. Ler os dois duplicaria o mês inteiro.
    const picked = pickBestFormat([file('docs/extrato/exemplo/janeiro.ofx', ''), file('docs/extrato/exemplo/janeiro.csv', '')])
    assert.equal(picked.length, 1)
    assert.match(picked[0].path, /\.ofx$/, 'o OFX ganha: ele traz identificador de lançamento e saldo')
  })

  it('meses diferentes continuam entrando os dois', () => {
    const picked = pickBestFormat([file('docs/extrato/exemplo/janeiro.ofx', ''), file('docs/extrato/exemplo/fevereiro.ofx', '')])
    assert.equal(picked.length, 2)
  })
})
