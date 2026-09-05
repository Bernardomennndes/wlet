import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { AccountType } from '../src/data/types.ts'
import { SELF_NAME_PATTERNS } from './accounts.config.ts'

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

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function readText(path: string): string {
  const buffer = readFileSync(path)
  // Arquivos declarados como CP1252 mas que na prática são ASCII/UTF-8.
  const utf8 = buffer.toString('utf8')
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '')
  return buffer.toString('latin1')
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

export function parseOfx(path: string): ParsedFile {
  const text = readText(path)
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
  const dueMatch = basename(path).match(/(\d{4}-\d{2}-\d{2})/)

  return {
    path,
    canonicalName: canonicalName(path),
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
 */
export function parseXpInvoiceCsv(path: string): ParsedFile {
  const text = readText(path)
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
    const isSelf = holder ? SELF_NAME_PATTERNS.some((pattern) => pattern.test(holder)) : false
    const holderNote = holder && !isSelf ? ` (${holder.trim()})` : ''
    transactions.push({
      postedDate: posted,
      amount: -parsed,
      description: `${merchant?.trim() ?? ''}${holderNote}`,
      fitId: null,
      installment: inst && Number(inst[2]) > 1 ? { current: Number(inst[1]), total: Number(inst[2]) } : null,
    })
  }
  const due = basename(path).match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
  return {
    path,
    canonicalName: canonicalName(path),
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
