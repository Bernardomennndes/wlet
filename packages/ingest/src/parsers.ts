import type { AccountType } from '@wlet/domain'
import type { IngestEnv, SourceFile } from './io'

/**
 * Os leitores de arquivo de banco: OFX (extrato e fatura), CSV da fatura XP e PDF da fatura
 * do Nubank. Porte de `scripts/parsers.ts` para rodar no navegador.
 *
 * A LÓGICA é a mesma, linha a linha — o que mudou é de onde vem o conteúdo. O original abria
 * o caminho com `readFileSync`; aqui cada função recebe o `SourceFile` (caminho + bytes),
 * porque no navegador não há sistema de arquivos e o caminho continua sendo a IDENTIDADE do
 * arquivo (é dele que sai o `canonicalName`, o vencimento da fatura e o casamento de conta).
 *
 * Duas dependências que o original importava de módulo passaram a ser PARÂMETRO, pela mesma
 * razão do `IngestEnv`: quem monta o pipeline é que sabe resolvê-las.
 *
 * - `SELF_NAME_PATTERNS` vinha de `scripts/accounts.config.ts`, que é dado pessoal e não
 *   existe no navegador como módulo; vira parâmetro de `parseXpInvoiceCsv`.
 * - `readPdfLines` precisa de `inflate` (o FlateDecode do PDF), que é do ambiente; vira
 *   parâmetro de `parseNubankInvoicePdf`, e por isso essa é a única função assíncrona daqui.
 */

export interface RawTransaction {
  postedDate: string // AAAA-MM-DD
  amount: number
  description: string
  fitId: string | null
  installment: { current: number; total: number } | null
}

export interface ParsedFile {
  path: string
  /** Nome canônico (sem sufixo " (1)") usado para detectar downloads repetidos. */
  canonicalName: string
  bankCode: string | null
  bankName: string | null
  externalId: string | null
  accountType: AccountType
  kind: 'statement' | 'invoice'
  period: { from: string; to: string } | null
  balance: { amount: number; asOf: string } | null
  /** Para faturas: vencimento inferido do nome do arquivo. */
  invoiceDueDate: string | null
  transactions: RawTransaction[]
}

/**
 * As linhas de texto de um PDF, injetadas.
 *
 * Só o que este módulo consome está declarado (`text`), então o leitor pode devolver a linha
 * completa — com página e posição — sem que o tipo precise saber disso. A forma é a de
 * `readPdfLines` de `@wlet/ingest/pdf`, para o `readPdfLines` de lá entrar aqui direto,
 * sem invólucro.
 */
export type PdfLineReader = (file: SourceFile, env: IngestEnv) => Promise<{ text: string }[]>

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * Cada byte vira o ponto de código de mesmo valor, que é o `latin1` do Node.
 *
 * O `TextDecoder` não serve aqui: o rótulo 'latin1' do padrão do navegador resolve para
 * windows-1252, que difere justamente na faixa 0x80–0x9F. Como o original escolhe esta
 * codificação só quando o UTF-8 falhou, trocá-la mudaria silenciosamente o texto de um
 * arquivo cru — a fatia dos dados em que ninguém está olhando.
 */
function decodeLatin1(bytes: Uint8Array): string {
  let out = ''
  // Em fatias, porque o espalhamento de um arquivo inteiro estoura o limite de argumentos.
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return out
}

function readText(bytes: Uint8Array): string {
  // Arquivos declarados como CP1252 mas que na prática são ASCII/UTF-8.
  const utf8 = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '')
  return decodeLatin1(bytes)
}

/** O último segmento do caminho — o `basename` do Node, sem `node:path`. */
function basename(path: string): string {
  const at = path.lastIndexOf('/')
  return at < 0 ? path : path.slice(at + 1)
}

function ofxTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'))
  return match ? decodeEntities(match[1].trim()) : null
}

function ofxDate(value: string | null): string | null {
  if (!value) return null
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export function canonicalName(path: string): string {
  return basename(path).replace(/\s*\(\d+\)(?=\.[a-z]+$)/i, '')
}

export function parseOfx(file: SourceFile): ParsedFile {
  const text = readText(file.bytes)
  const isCard = /<CREDITCARDMSGSRSV1>/i.test(text)
  const accountBlock = text.match(/<(BANKACCTFROM|CCACCTFROM)>([\s\S]*?)<\/\1>/i)?.[2] ?? ''
  const bankCode = ofxTag(text, 'FID') ?? ofxTag(accountBlock, 'BANKID')
  const bankName = ofxTag(text, 'ORG')
  const externalId = ofxTag(accountBlock, 'ACCTID')

  const transactions: RawTransaction[] = []
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? []
  for (const block of blocks) {
    const posted = ofxDate(ofxTag(block, 'DTPOSTED'))
    const amount = Number.parseFloat(ofxTag(block, 'TRNAMT') ?? '0')
    const memo = ofxTag(block, 'MEMO') ?? ofxTag(block, 'NAME') ?? ''
    if (!posted || Number.isNaN(amount)) continue
    transactions.push({
      postedDate: posted,
      amount,
      description: memo,
      fitId: ofxTag(block, 'FITID'),
      installment: null,
    })
  }

  const from = ofxDate(ofxTag(text, 'DTSTART'))
  const to = ofxDate(ofxTag(text, 'DTEND'))
  const balAmt = ofxTag(text, 'BALAMT')
  const balDate = ofxDate(ofxTag(text, 'DTASOF'))
  const dueMatch = basename(file.path).match(/(\d{4}-\d{2}-\d{2})/)

  return {
    path: file.path,
    canonicalName: canonicalName(file.path),
    bankCode: bankCode ? bankCode.replace(/^0+(?=\d{3}$)/, '') : null,
    bankName,
    externalId,
    accountType: isCard ? 'credit-card' : 'checking',
    kind: isCard ? 'invoice' : 'statement',
    period: from && to ? { from, to } : null,
    balance: balAmt && balDate && !isCard ? { amount: Number.parseFloat(balAmt), asOf: balDate } : null,
    invoiceDueDate: isCard && dueMatch ? dueMatch[1] : null,
    transactions,
  }
}

function parseBrlNumber(value: string): number {
  const cleaned = value.replace(/R\$/i, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  return Number.parseFloat(cleaned)
}

function brDate(value: string): string | null {
  const m = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/**
 * Fatura XP em CSV: `Data;Estabelecimento;Portador;Valor;Parcela`.
 * Valores positivos são compras (saída); "Pagamento de fatura" vem negativo.
 *
 * `selfNamePatterns` é o `SELF_NAME_PATTERNS` da configuração de contas, recebido em vez de
 * importado: ele é dado pessoal e não versionado, e quem monta o pipeline é que o tem.
 */
export function parseXpInvoiceCsv(file: SourceFile, selfNamePatterns: readonly RegExp[]): ParsedFile {
  const text = readText(file.bytes)
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const transactions: RawTransaction[] = []
  for (const line of lines) {
    if (/^Data;/i.test(line)) continue
    const [date, merchant, holder, value, installment] = line.split(';')
    const posted = brDate(date ?? '')
    if (!posted || value === undefined) continue
    const parsed = parseBrlNumber(value)
    if (Number.isNaN(parsed)) continue
    const inst = installment?.match(/(\d+)\s+de\s+(\d+)/)
    // O CSV da XP traz o portador de cada compra. Só vale anotar quando não é o titular —
    // é o que distingue a compra do cartão adicional. Quem é o titular vem da config, não
    // de um nome escrito aqui.
    const isSelf = holder ? selfNamePatterns.some((pattern) => pattern.test(holder)) : false
    const holderNote = holder && !isSelf ? ` (${holder.trim()})` : ''
    transactions.push({
      postedDate: posted,
      amount: -parsed,
      description: `${merchant?.trim() ?? ''}${holderNote}`,
      fitId: null,
      installment: inst && Number(inst[2]) > 1 ? { current: Number(inst[1]), total: Number(inst[2]) } : null,
    })
  }
  const due = basename(file.path).match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
  return {
    path: file.path,
    canonicalName: canonicalName(file.path),
    bankCode: '348',
    bankName: 'Banco XP S.A.',
    externalId: null,
    accountType: 'credit-card',
    kind: 'invoice',
    period: null,
    balance: null,
    invoiceDueDate: due,
    transactions,
  }
}

const MESES: Record<string, number> = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 }

/**
 * Fatura do Nubank em PDF.
 *
 * Existe porque o Nubank não publica OFX nem CSV para faturas anteriores a 2024 — são três
 * anos de histórico que só existem neste formato. É a ÚNICA fonte deste projeto que não é
 * texto estruturado, e por isso ela se confere: `problem` traz a divergência entre a soma dos
 * lançamentos e o total que a própria fatura declara. Quem chama decide o que fazer com isso;
 * o ingest recusa o arquivo que não fecha.
 *
 * A linha é `DD MMM  Descrição  1.234,56`, com a parcela no sufixo (` - 8/10`). O ANO não
 * está na linha: vem do vencimento, e um mês MAIOR que o do vencimento é do ano anterior —
 * a fatura de janeiro lista compras de dezembro.
 *
 * É assíncrona porque o leitor de PDF depende do `inflate` do ambiente (o FlateDecode dos
 * fluxos). Ele chega por parâmetro, e não por import, para o adaptador Node poder entregar o
 * `inflateSync` e o do navegador o `DecompressionStream`.
 */
export async function parseNubankInvoicePdf(file: SourceFile, env: IngestEnv, readPdfLines: PdfLineReader): Promise<ParsedFile & { problem: string | null }> {
  const due = basename(file.path).match(/(\d{4})-(\d{2})-(\d{2})/)
  const dueYear = due ? Number(due[1]) : new Date().getFullYear()
  const dueMonth = due ? Number(due[2]) : 12

  const lines = (await readPdfLines(file, env)).map((l) => l.text)
  const transactions: RawTransaction[] = []
  for (const line of lines) {
    const m = /^(\d{2})\s+([A-Z]{3})\s+(.+?)\s+([\d.]+,\d{2})$/i.exec(line)
    if (!m) continue
    const month = MESES[m[2].toUpperCase()]
    if (!month) continue
    const year = month > dueMonth ? dueYear - 1 : dueYear
    const value = parseBrlNumber(m[4])
    if (Number.isNaN(value)) continue

    let description = m[3].trim()
    const inst = /^(.*?)\s+-\s+(\d+)\/(\d+)$/.exec(description)
    const installment = inst && Number(inst[3]) > 1 ? { current: Number(inst[2]), total: Number(inst[3]) } : null
    if (inst) description = inst[1].trim()

    // Entram POSITIVO: quitação da fatura anterior, estorno, e crédito.
    //
    // "Crédito de Confiança" é o provisório que o Nubank lança enquanto uma compra é
    // contestada, e a "Reversão do Crédito de Confiança" o desfaz — essa reversão é DÉBITO e
    // fica de fora daqui. Tratar os quatro passos do ciclo como compra inflava a fatura de
    // novembro/2021 em 2 × 21,40, que foi exatamente a diferença que a trava acusou.
    const isCredit = /^(pagamento em|estorno de|cr[ée]dito de)\b/i.test(description) && !/^revers/i.test(description)
    transactions.push({
      postedDate: `${year}-${String(month).padStart(2, '0')}-${m[1]}`,
      amount: isCredit ? value : -value,
      fitId: null,
      description,
      installment,
    })
  }

  // A trava, e ela é sobre a MESMA grandeza que o parser produz.
  //
  // A primeira versão comparava com o "Total a pagar" e passou em dezembro/2023 por
  // coincidência: aquela fatura tinha um pagamento só, igual à fatura anterior, e os termos se
  // cancelaram. A identidade real é `anterior + compras + outros − pagamentos = total a pagar`,
  // e em abril/2022 — três pagamentos no meio do ciclo — a comparação errada acusou R$ 980
  // de diferença numa leitura que estava certa.
  //
  // "Total de compras" mais "Outros lançamentos" é o que corresponde exatamente à soma das
  // linhas de gasto, sem depender de pagamento nem de saldo anterior.
  const value = (re: RegExp) => {
    const line = lines.find((l) => re.test(l))
    const m = line ? /([\d.]+,\d{2})/.exec(line.replace(/^.*?(?=[\d.]+,\d{2})/, '')) : null
    return m ? parseBrlNumber(m[1]) : null
  }
  const purchases = value(/Total de compras/i)
  const others = value(/Outros lan[çc]amentos/i) ?? 0
  const spent = transactions.filter((t) => t.amount < 0).reduce((sum, t) => sum - t.amount, 0)
  let problem: string | null = null
  if (purchases === null) problem = 'sem "Total de compras" na fatura — não foi possível conferir a soma'
  else if (Math.abs(purchases + others - spent) > 0.02) problem = `a soma dos lançamentos (${spent.toFixed(2)}) não bate com o declarado (${(purchases + others).toFixed(2)})`

  return {
    path: file.path,
    canonicalName: canonicalName(file.path),
    bankCode: '260',
    bankName: 'Nu Pagamentos S.A.',
    externalId: null,
    accountType: 'credit-card',
    kind: 'invoice',
    period: null,
    balance: null,
    invoiceDueDate: due ? `${due[1]}-${due[2]}-${due[3]}` : null,
    transactions,
    problem,
  }
}
