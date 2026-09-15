import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { SourceFile } from '@wlet/ingest/io'
import { parseOfx, parseXpInvoiceCsv } from '@wlet/ingest/parsers'

/**
 * A CODIFICAÇÃO do arquivo — o ramo que todo fixture de teste evitava.
 *
 * Os extratos vêm em duas codificações, e o leitor escolhe uma: tenta UTF-8, e cai para latin1
 * quando aparece o caractere de substituição. Até agora nenhum teste mandou um byte que não fosse
 * ASCII, então o ramo de queda — e a razão de ele existir — nunca rodava.
 *
 * A razão está escrita no módulo e é fina: `TextDecoder('latin1')` NÃO é latin1. O rótulo resolve
 * para windows-1252, que difere justamente na faixa 0x80–0x9F. Por isso o módulo decodifica byte a
 * byte à mão. Um extrato com um byte nessa faixa decodificado como windows-1252 muda o nome do
 * estabelecimento — e nome mudado é regra de categoria que não casa mais: o gasto cai em "Outros"
 * com o valor certo e a categoria errada, que é o modo de falha mais caro deste projeto.
 */
const bytes = (...parts: (string | number[])[]): Uint8Array => {
  const out: number[] = []
  for (const part of parts) {
    if (typeof part === 'string') out.push(...new TextEncoder().encode(part))
    else out.push(...part)
  }
  return new Uint8Array(out)
}

const ofx = (memo: Uint8Array): SourceFile => ({
  path: 'docs/extrato/inter/2026-01.ofx',
  bytes: bytes(
    'OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>077</BANKID><ACCTID>1</ACCTID></BANKACCTFROM><BANKTRANLIST>',
    '<STMTTRN><DTPOSTED>20260105</DTPOSTED><TRNAMT>-10.00</TRNAMT><MEMO>',
    [...memo],
    '</MEMO><FITID>x</FITID></STMTTRN>',
    '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
  ),
})

const memoDe = (file: SourceFile) => parseOfx(file).transactions[0].description

describe('o arquivo em latin1 é lido como latin1', () => {
  it('um extrato com `ç` e `ã` crus volta legível', () => {
    // `MERCADO SÃO JOÃO` em latin1: `Ã` é 0xC3 seguido de `O` (0x4F), que não é byte de
    // continuação — o UTF-8 falha, e a queda acontece. Sem ela, a descrição vem com o losango de
    // substituição no meio e nenhuma regra de categoria a reconhece.
    assert.equal(memoDe(ofx(bytes('MERCADO S', [0xc3], 'O JO', [0xc3], 'O'))), 'MERCADO SÃO JOÃO')
    // 0xC7 é `Ç` e 0xE7 é `ç` — escrevi o minúsculo esperando o maiúsculo, e o módulo estava certo.
    assert.equal(memoDe(ofx(bytes('PADARIA A', [0xc7], 'UCARADA'))), 'PADARIA AÇUCARADA')
    assert.equal(memoDe(ofx(bytes('a', [0xe7], 'ai'))), 'açai')
  })

  it('e a faixa 0x80–0x9F prova que NÃO é windows-1252', () => {
    // A diferença que o módulo documenta, afirmada. O byte 0x93 é um controle em latin1 e uma
    // ASPA CURVA em windows-1252. Se alguém "simplificar" o decodificador para
    // `TextDecoder('latin1')`, este byte passa a virar `“` — e o nome do estabelecimento muda
    // sem que nada acuse.
    assert.equal(memoDe(ofx(bytes('LOJA', [0x93], 'X'))).charCodeAt(4), 0x93)
  })

  it('arquivo GRANDE atravessa inteiro — a decodificação é em fatias', () => {
    // O decodificador espalha os bytes em blocos de 8192 porque espalhar um arquivo inteiro
    // estoura o limite de argumentos. Um erro no laço trunca o extrato, e o mês perde
    // lançamentos sem nada dizer.
    const longo = bytes('A'.repeat(30_000), [0xe7])
    const lido = memoDe(ofx(longo))
    assert.equal(lido.length, 30_001)
    assert.equal(lido.at(-1), 'ç')
  })
})

describe('o arquivo em UTF-8 continua em UTF-8', () => {
  it('acento válido não passa pela queda', () => {
    // A queda é exceção, não regra: um UTF-8 bem formado tem de sair idêntico. Decodificá-lo como
    // latin1 produziria `MERCADO SÃƒO` — o mojibake clássico, e o inverso do defeito acima.
    assert.equal(memoDe(ofx(bytes('MERCADO SÃO JOÃO'))), 'MERCADO SÃO JOÃO')
  })

  it('arquivo com MARCA DE ORDEM é lido igual a um sem ela', () => {
    // O BOM abre muitos arquivos exportados no Windows, e o leitor o corta.
    //
    // Fica dito o que a mutação mediu: hoje esse corte NÃO É OBSERVÁVEL. Nenhum leitor ancora no
    // começo do texto — `ofxTag` procura a etiqueta em qualquer posição, e a linha de cabeçalho do
    // CSV, com BOM, deixa de casar `^Data;` mas cai fora do mesmo jeito por não ter data válida.
    // Removido o `replace`, nenhum teste muda de cor. Ele é guarda contra o próximo leitor que
    // ancore — e este teste prende o que dá para afirmar: o arquivo com BOM lê igual.
    const comBom: SourceFile = { path: 'docs/extrato/x.ofx', bytes: bytes([0xef, 0xbb, 0xbf], 'OFXHEADER:100\n<OFX><ORG>Banco Inter</ORG></OFX>') }
    const semBom: SourceFile = { path: 'docs/extrato/x.ofx', bytes: bytes('OFXHEADER:100\n<OFX><ORG>Banco Inter</ORG></OFX>') }
    assert.equal(parseOfx(comBom).bankName, 'Banco Inter')
    assert.deepEqual(parseOfx(comBom), parseOfx(semBom))
  })
})

describe('o CSV da fatura segue a mesma régua', () => {
  it('estabelecimento em latin1 chega legível à descrição', () => {
    const csv: SourceFile = {
      path: 'docs/fatura/xp/2026-02-10.csv',
      bytes: bytes('Data;Estabelecimento;Portador;Valor;Parcela\n05/01/2026;PADARIA A', [0xc7], 'UCARADA;FULANO;10,00;-'),
    }
    assert.equal(parseXpInvoiceCsv(csv, [/FULANO/i]).transactions[0].description, 'PADARIA AÇUCARADA')
  })
})
