import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Budget } from '@wlet/domain'
import { browserEnv, type SourceFile } from '@wlet/ingest/io'
import { type AccountProfile, type IngestInput, runIngest } from '@wlet/ingest/pipeline'
import { buildRules } from '@wlet/ingest/rules'

/**
 * QUAL CONTA é a dona do arquivo — a decisão de que todo o resto do app depende.
 *
 * O recorte PF/PJ sai da conta, o saldo sai da conta, e o que a tela mostra num recorte sai de
 * quais contas pertencem a ele. Um extrato reconhecido como a conta errada não estoura nada: os
 * lançamentos aparecem, somam, e estão do lado errado da separação entre pessoa física e empresa.
 *
 * Um extrato NÃO reconhecido é menos ruim e mais visível: o pipeline fabrica uma conta a partir dos
 * metadados do arquivo e AVISA no relatório. É o comportamento certo — perder o extrato seria pior
 * — mas só funciona enquanto alguém lê o relatório.
 */
const OFX = (acctId: string, bankId: string, tipo: 'bank' | 'card' = 'bank') => {
  const block = tipo === 'card' ? 'CREDITCARDMSGSRSV1' : 'BANKMSGSRSV1'
  const acct = tipo === 'card' ? `<CCACCTFROM><ACCTID>${acctId}</ACCTID></CCACCTFROM>` : `<BANKACCTFROM><BANKID>${bankId}</BANKID><ACCTID>${acctId}</ACCTID></BANKACCTFROM>`
  return `OFXHEADER:100
<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>BANCO</ORG><FID>${bankId}</FID></FI></SONRS></SIGNONMSGSRSV1>
<${block}><STMTTRNRS><STMTRS>${acct}
<BANKTRANLIST><DTSTART>20260101</DTSTART><DTEND>20260131</DTEND>
<STMTTRN><DTPOSTED>20260105</DTPOSTED><TRNAMT>-10.00</TRNAMT><FITID>a</FITID><MEMO>MERCADO</MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></${block}></OFX>`
}

const budget: Budget = { monthlyLimit: 9000, warnAt: 0.75, byCategory: [] }

const profile = (over: Partial<AccountProfile>): AccountProfile =>
  ({ id: 'minha-conta', name: 'Minha', bank: 'Banco', bankCode: '001', type: 'checking', entity: 'PF', holder: 'Fulano', match: {}, ...over }) as AccountProfile

const run = (path: string, ofx: string, accounts: AccountProfile[]) =>
  runIngest({
    sources: [{ path, bytes: new TextEncoder().encode(ofx) } as SourceFile],
    accounts,
    selfNamePatterns: [],
    rules: buildRules(),
    planned: [],
    receivables: [],
    budget,
    goals: [],
    now: '2026-02-01T00:00:00.000Z',
    env: browserEnv,
  } as IngestInput)

/** Em que conta o lançamento caiu — e se o pipeline reclamou. */
const landedIn = async (path: string, ofx: string, accounts: AccountProfile[]) => {
  const result = await run(path, ofx, accounts)
  return { account: result.transactions[0]?.accountId, warned: result.report.unknownAccounts.length > 0 }
}

describe('o CÓDIGO DO BANCO e o TIPO separam as contas', () => {
  it('o perfil que casa o banco leva o arquivo', async () => {
    assert.deepEqual(await landedIn('docs/extrato/a.ofx', OFX('111', '001'), [profile({ match: { bankCode: '001' } })]), { account: 'minha-conta', warned: false })
  })

  it('banco diferente NÃO leva — e o pipeline avisa em vez de perder o extrato', async () => {
    // Fabricar a conta é o certo: perder o extrato seria pior, e o aviso põe o problema no
    // relatório em vez de num total que ninguém sabe explicar.
    const { account, warned } = await landedIn('docs/extrato/a.ofx', OFX('111', '999'), [profile({ match: { bankCode: '001' } })])
    assert.notEqual(account, 'minha-conta')
    assert.equal(warned, true)
  })

  it('e o TIPO separa a conta corrente do cartão do mesmo banco', async () => {
    // Sem isto, a fatura do cartão entraria na conta corrente do mesmo banco: o saldo passaria a
    // incluir dívida, e o gasto do cartão apareceria duas vezes quando a fatura fosse paga.
    const corrente = profile({ id: 'corrente', match: { bankCode: '001', accountType: 'checking' } })
    const { account } = await landedIn('docs/fatura/a.ofx', OFX('333', '001', 'card'), [corrente])
    assert.notEqual(account, 'corrente')
  })
})

describe('o NÚMERO da conta, exato ou por expressão', () => {
  it('o número exato precisa bater', async () => {
    assert.equal((await landedIn('docs/extrato/a.ofx', OFX('111', '001'), [profile({ match: { externalId: '111' } })])).account, 'minha-conta')
    assert.notEqual((await landedIn('docs/extrato/a.ofx', OFX('112', '001'), [profile({ match: { externalId: '111' } })])).account, 'minha-conta')
    // O caso que separa IGUALDADE de "contém", e que meu primeiro fixture não tinha: a conta
    // `1111` contém `111`. Com uma comparação frouxa, os dois extratos cairiam na mesma conta e
    // o saldo de uma apareceria somado ao da outra.
    assert.notEqual((await landedIn('docs/extrato/d.ofx', OFX('1111', '001'), [profile({ match: { externalId: '111' } })])).account, 'minha-conta')
  })

  it('a expressão existe para o ZERO À ESQUERDA que o banco às vezes põe', async () => {
    // O mesmo número aparece como `123` num arquivo e `000123` noutro. Com o número exato, metade
    // dos extratos da mesma conta viraria conta desconhecida.
    const comRegex = [profile({ match: { externalId: /^0*123$/ } })]
    assert.equal((await landedIn('docs/extrato/a.ofx', OFX('123', '001'), comRegex)).account, 'minha-conta')
    assert.equal((await landedIn('docs/extrato/b.ofx', OFX('000123', '001'), comRegex)).account, 'minha-conta')
    assert.notEqual((await landedIn('docs/extrato/c.ofx', OFX('1234', '001'), comRegex)).account, 'minha-conta')
  })
})

describe('o arquivo que não diz o número da conta', () => {
  const semNumero = OFX('', '001')

  it('com número exigido e sem CAMINHO declarado, não casa', async () => {
    // Uma fatura em PDF não traz `ACCTID`. Deixar passar faria o primeiro perfil com número
    // adotar qualquer arquivo mudo do mesmo banco.
    const { account } = await landedIn('docs/fatura/qualquer.ofx', semNumero, [profile({ match: { externalId: '111' } })])
    assert.notEqual(account, 'minha-conta')
  })

  it('mas o CAMINHO resgata: é assim que a fatura sem número acha a conta dela', async () => {
    // É a válvula que torna as faturas utilizáveis — o dono se declara pela pasta.
    const { account } = await landedIn('docs/fatura/nubank/2026-01.ofx', semNumero, [profile({ match: { externalId: '111', pathIncludes: 'fatura/nubank' } })])
    assert.equal(account, 'minha-conta')
  })

  it('e o caminho declarado tem de ESTAR no caminho do arquivo', async () => {
    const { account } = await landedIn('docs/fatura/xp/2026-01.ofx', semNumero, [profile({ match: { externalId: '111', pathIncludes: 'fatura/nubank' } })])
    assert.notEqual(account, 'minha-conta')
  })
})

describe('o arquivo que o pipeline não sabe ler', () => {
  it('CSV fora da pasta da fatura da XP é ignorado', async () => {
    // O formato é escolhido pela extensão MAIS o caminho: um CSV solto não tem colunas
    // conhecidas, e adivinhar produziria lançamentos inventados.
    // O CSV é COMPLETO de propósito — cinco colunas, como a XP escreve. Com um incompleto, o
    // parser descartaria a linha sozinho e o teste passaria mesmo com o caminho ignorado: seria
    // a igualdade entre nada e nada de novo.
    const completo = 'Data;Estabelecimento;Portador;Valor;Parcela\n05/01/2026;MERCADO X;FULANO;10,00;-'
    const result = await run('docs/extrato/estranho.csv', completo, [profile({ match: { bankCode: '001' } })])
    assert.equal(result.transactions.length, 0, 'fora da pasta da XP, o CSV não é lido')
  })

  it('e a extensão desconhecida também', async () => {
    const result = await run('docs/extrato/leiame.txt', 'nada aqui', [profile({ match: { bankCode: '001' } })])
    assert.equal(result.transactions.length, 0)
  })
})
