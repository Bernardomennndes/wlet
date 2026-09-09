import type { IncomeMonth } from '@/data/types'
import type { IngestEnv, SourceFile } from './io'
import { readSheet, serialDate } from './xlsx'

/**
 * O razão de CAIXA da corretora — a terceira fonte, e a que fecha a conta.
 *
 * O extrato do banco mostra o dinheiro saindo da conta corrente; o relatório da B3 mostra o
 * que virou papel. Nenhum dos dois mostra o caixa da corretora, e é exatamente ali que o
 * dinheiro fica entre uma coisa e outra — junto com taxa, IR retido na fonte e o que volta
 * para o banco. Sem esta fonte, o aporte líquido é um chute.
 *
 * O que ela corrigiu, medido: R$ 12.400,00 de resgates que voltaram para a conta corrente
 * descritos como "TED recebida de <titular>" — dinheiro do próprio titular, que nenhuma
 * regra de texto sobre "conta investimento" alcançava. Contados como aporte ainda aplicado,
 * eles produziam um rendimento negativo de R$ 8 mil onde havia +16%.
 *
 * A conferência é aritmética e não depende de ordem: a soma de TODO lançamento desde o
 * primeiro é igual ao saldo declarado hoje. Se não for, o `problems` avisa e o número não
 * deve ser publicado.
 */

/**
 * A que o lançamento se refere. `bank` é o único que atravessa a fronteira da corretora —
 * os outros movem dinheiro dentro dela.
 */
export type BrokerageKind = 'bank' | 'asset' | 'income' | 'tax' | 'other'

export interface BrokerageEntry {
  date: string
  description: string
  /** Com sinal: positivo entra no caixa da corretora, negativo sai. */
  value: number
  kind: BrokerageKind
}

export interface BrokerageLedger {
  entries: BrokerageEntry[]
  /** Saldo em caixa hoje, pela soma conferida contra o saldo declarado no extrato. */
  cash: number
  source: string[]
  problems: string[]
}

/**
 * Movimento com a conta do PRÓPRIO titular, nas cinco formas que a XP usa.
 *
 * As duas famílias existem porque a corretora registra a mesma transferência de dois jeitos
 * conforme o canal: "conta digital" quando é movimentação interna, e TED nominal quando
 * passa pelo SPB. Reconhecer só a primeira foi o que escondeu R$ 11.800 de aporte e
 * R$ 12.400,00 de resgate.
 *
 * `TED TER` (TED para TERCEIRO) fica de fora de propósito — é dinheiro saindo para outra
 * titularidade, não para o seu banco.
 */
const OWN_BANK = /conta digital|(?<!TER )\bTED BCO \d+\b.*-\s*(RETIRADA EM C\/C|RECEBIMENTO DE TED)/i
// `APLICAÇÃO FUNDOS` não ancora no começo: ela chega como "TED TER BCO 17 … - TED APLICAÇÃO
// FUNDOS", porque um fundo é custodiado no administrador e o dinheiro sai por TED nominal.
const ASSET = /^(COMPRA|APLICA|RESGATE|VENCIMENTO)|OPERA[ÇC][ÕO]ES EM BOLSA|APLICA[ÇC][ÃA]O FUNDOS|^CAMBIO|^Cambio/i
const TAX = /^(IR|IRRF|IOF)\b/i
const INCOME = /JUROS S\/ CAPITAL|DIVIDENDOS DE|RENDIMENTOS DE|^Investback/i

function classify(description: string): BrokerageKind {
  if (OWN_BANK.test(description)) return 'bank'
  if (TAX.test(description)) return 'tax'
  if (ASSET.test(description)) return 'asset'
  if (INCOME.test(description)) return 'income'
  return 'other'
}

function num(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * O saldo que o extrato declara no cabeçalho ("Saldo total projetado"). Todo arquivo carrega
 * o saldo do dia da EXPORTAÇÃO, não o do fim do período — então qualquer um serve, e é por
 * isso que ele pode conferir a soma do razão inteiro.
 */
function declaredBalance(rows: Record<string, string>[]): number | null {
  for (const row of rows.slice(0, 20)) if (row.B?.startsWith('Saldo total projetado')) return num(row.C)
  return null
}

/**
 * O nome do arquivo dentro do caminho.
 *
 * No Node isto era o `readdirSync`, que já devolve só o nome; aqui o `SourceFile` carrega o
 * caminho relativo inteiro, e é o NOME que o filtro e a ordenação leem — ordenar por caminho
 * completo mudaria a ordem se um dia os arquivos vierem de pastas diferentes, e `source`
 * ficaria mais longo do que o relatório do terminal sempre mostrou.
 */
function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * Os arquivos são os de `docs/investimentos/` — quem chama passa a lista, e o filtro por
 * nome é o mesmo do original (`extrato_de_*.xlsx`), que é o que separa o razão da corretora
 * dos relatórios de posição e movimentação da B3 na mesma pasta.
 */
export async function readBrokerageLedger(sources: SourceFile[], env: IngestEnv): Promise<BrokerageLedger | null> {
  const files = sources
    .filter((f) => {
      const name = basename(f.path)
      return name.startsWith('extrato_de_') && name.toLowerCase().endsWith('.xlsx')
    })
    // Ordem de UNIDADE DE CÓDIGO, como o `.sort()` do original — nunca `localeCompare`.
    // `localeCompare` sem locale usa o padrão do RUNTIME, que no navegador é o de quem abre a
    // tela: a ordem dos arquivos viraria propriedade da máquina do usuário. E ela não é
    // cosmética — `declared` fica com o saldo do PRIMEIRO arquivo da lista, e é ele que decide
    // o `cash` e a trava aritmética. Medido: hífen e sublinhado invertem entre os dois
    // comparadores, e maiúscula/minúscula também.
    .sort((a, b) => {
      const x = basename(a.path)
      const y = basename(b.path)
      return x < y ? -1 : x > y ? 1 : 0
    })
  if (!files.length) return null

  const problems: string[] = []
  const seen = new Set<string>()
  const entries: BrokerageEntry[] = []
  let declared: number | null = null

  for (const file of files) {
    const rows = await readSheet(file, env, 1)
    declared ??= declaredBalance(rows)
    for (const row of rows) {
      const serial = num(row.B)
      // A coluna do valor alterna entre E e F conforme o arquivo, nunca as duas.
      const value = num(row.E) ?? num(row.F)
      // O cabeçalho e o rodapé também têm texto na coluna B; só linha com data serial
      // plausível (>40000 é 2009 em diante) e valor é lançamento.
      if (serial === null || serial < 40_000 || value === null || !row.D) continue
      const date = serialDate(serial)
      const description = row.D.trim()
      // Os períodos se sobrepõem em um dia entre arquivos. O saldo corrente entra na chave
      // porque dois lançamentos iguais no mesmo dia são legítimos e têm saldos diferentes.
      const key = `${date}|${description}|${value}|${row.G ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({ date, description, value, kind: classify(description) })
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description))
  const cash = Math.round(entries.reduce((sum, e) => sum + e.value, 0) * 100) / 100

  if (declared === null) problems.push('extrato da corretora sem "Saldo total projetado" — a soma do razão não pôde ser conferida.')
  else if (Math.abs(declared - cash) > 0.02)
    problems.push(`o razão da corretora não fecha: soma dos lançamentos ${cash.toFixed(2)}, saldo declarado ${declared.toFixed(2)}. Falta arquivo em docs/investimentos/.`)

  const unknown = entries.filter((e) => e.kind === 'other')
  if (unknown.length) problems.push(`${unknown.length} lançamento(s) da corretora sem classificação: ${[...new Set(unknown.map((e) => e.description.slice(0, 40)))].join('; ')}`)

  return { entries, cash: declared ?? cash, source: files.map((f) => basename(f.path)), problems }
}

/**
 * O aporte LÍQUIDO por data: o que entrou vindo do seu banco menos o que voltou para ele.
 *
 * Só `kind: 'bank'` conta. Compra de papel, imposto e provento movem dinheiro DENTRO da
 * corretora — somá-los aqui contaria o mesmo real duas vezes.
 */
export function contributionsByDate(ledger: BrokerageLedger): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of ledger.entries) {
    if (e.kind !== 'bank') continue
    out.set(e.date, (out.get(e.date) ?? 0) + e.value)
  }
  return out
}

/**
 * O caixa da corretora no fim de uma data.
 *
 * É a soma corrida de tudo até ali — e a soma não depende da ordem dentro do dia, que é
 * justamente o que o extrato não define (vários lançamentos com a mesma data e saldos que
 * só fazem sentido numa sequência que o arquivo não declara).
 */
export function cashAt(ledger: BrokerageLedger, date: string): number {
  let total = 0
  for (const e of ledger.entries) if (e.date <= date) total += e.value
  return Math.round(total * 100) / 100
}

/**
 * Os proventos mês a mês, separados pelas três naturezas que a corretora distingue.
 *
 * São coisas diferentes com tributação diferente, e é por isso que valem separadas: dividendo
 * é isento na pessoa física, JCP tem 15% retido na fonte, e rendimento de renda fixa segue a
 * tabela regressiva. Somá-los num número só esconde qual parte da renda é líquida.
 *
 * `Investback` (o cashback da corretora) entra em rendimento: não é provento de papel, mas é
 * dinheiro que apareceu no caixa sem aporte, e deixá-lo de fora faria a soma dos três não
 * bater com o que entrou.
 */

const DIVIDEND = /DIVIDENDOS DE/i
const JCP = /JUROS S\/ CAPITAL/i

export function incomeByMonth(ledger: BrokerageLedger): IncomeMonth[] {
  const by = new Map<string, IncomeMonth>()
  for (const e of ledger.entries) {
    if (e.kind !== 'income') continue
    const month = e.date.slice(0, 7)
    const row = by.get(month) ?? { month, dividends: 0, jcp: 0, yields: 0, total: 0 }
    if (DIVIDEND.test(e.description)) row.dividends += e.value
    else if (JCP.test(e.description)) row.jcp += e.value
    else row.yields += e.value
    row.total += e.value
    by.set(month, row)
  }
  const round = (n: number) => Math.round(n * 100) / 100
  return [...by.values()]
    .map((r) => ({ month: r.month, dividends: round(r.dividends), jcp: round(r.jcp), yields: round(r.yields), total: round(r.total) }))
    .sort((a, b) => a.month.localeCompare(b.month))
}
