import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pgTableColumns, zodObjectFields } from './support/source-fields'

/**
 * O ÚLTIMO elo: o que o contrato aceita tem de ter onde ser gravado.
 *
 * A cadeia de um dado é formulário → domínio → contrato → banco, e cada emenda perde valor em
 * silêncio de um jeito próprio. O `wire-shape.test.ts` cobre a do meio; esta é a do fim, e é a
 * mais traiçoeira: o Zod ACEITA o campo, a requisição responde 200, e o `insert` simplesmente não
 * o menciona. Nada erra. A pessoa vê "salvo" e o valor não existe mais.
 *
 * É a forma que a perda dos grupos de plano teria tomado se estivesse um passo adiante — lá o
 * contrato é que não descreve `from`, `to` e `note`; aqui seria o contrário, e nenhum teste de
 * handler veria, porque eles conferem o que VOLTA da mesma consulta que não gravou.
 */
const CONFIG = 'packages/api/src/domains/config/shape.ts'
const PLANS = 'packages/api/src/domains/plans/shape.ts'
const DATASET = 'packages/api/src/domains/dataset/shape.ts'
const DECLARATIONS_DB = 'packages/db/src/schema/declarations.ts'
const DATASET_DB = 'packages/db/src/schema/dataset.ts'

const PERSISTED: [wire: string, wireFile: string, table: string, tableFile: string][] = [
  ['plannedEntry', CONFIG, 'plannedEntries', DECLARATIONS_DB],
  ['receivable', CONFIG, 'receivables', DECLARATIONS_DB],
  ['goal', CONFIG, 'goals', DECLARATIONS_DB],
  ['plan', PLANS, 'plans', DECLARATIONS_DB],
  ['planGroup', PLANS, 'planGroups', DECLARATIONS_DB],
  ['transaction', DATASET, 'transactions', DATASET_DB],
  ['account', DATASET, 'accounts', DATASET_DB],
  ['transfer', DATASET, 'transfers', DATASET_DB],
]

/**
 * Campo do contrato que vira MAIS DE UMA coluna, e quais.
 *
 * Um objeto de duas partes cabe em duas colunas em vez de um JSONB, e é a escolha certa quando as
 * partes são escalares: elas ficam consultáveis, tipadas e indexáveis. O preço é esta tabela — o
 * nome deixa de bater sozinho, e sem declarar o achatamento o sensor acusaria os três como perda.
 */
const FLATTENED: Record<string, string[]> = {
  'plan.financed': ['financedTotal', 'financedInstallments'],
  'transaction.installment': ['installmentCurrent', 'installmentTotal'],
  'account.coverage': ['coverageFrom', 'coverageTo'],
}

/** Coluna que não vem do contrato porque é do ARMAZENAMENTO, não do dado. */
const HOUSEKEEPING = new Set(['userId', 'createdAt', 'updatedAt'])

describe('tudo que o contrato aceita tem onde ser gravado', () => {
  it('o leitor está achando os dois lados', () => {
    let total = 0
    for (const [wire, wireFile, table, tableFile] of PERSISTED) {
      assert.ok(zodObjectFields(wireFile, wire).length >= 2, `${wire}: campos de menos`)
      assert.ok(pgTableColumns(tableFile, table).length >= 3, `${table}: colunas de menos`)
      total += zodObjectFields(wireFile, wire).length + pgTableColumns(tableFile, table).length
    }
    assert.ok(total >= 120, `só ${total} campos e colunas lidos no total`)
  })

  for (const [wire, wireFile, table, tableFile] of PERSISTED) {
    it(`\`${wire}\` cabe inteiro em \`${table}\``, () => {
      const columns = new Set(pgTableColumns(tableFile, table))
      const homeless: string[] = []
      for (const field of zodObjectFields(wireFile, wire)) {
        const flattened = FLATTENED[`${wire}.${field}`]
        if (flattened) {
          for (const column of flattened) if (!columns.has(column)) homeless.push(`${wire}.${field} → ${column} (coluna declarada que não existe)`)
          continue
        }
        if (!columns.has(field)) homeless.push(`${wire}.${field}`)
      }
      assert.deepEqual(homeless, [], 'campo que o contrato aceita e o banco não guarda — grava 200 e perde o valor')
    })

    it(`e \`${table}\` não guarda coluna que o contrato não sabe devolver`, () => {
      // A direção oposta é menos grave e ainda assim custa: coluna que o contrato não expressa é
      // dado que entra e nunca mais sai pela API — só por consulta ao banco.
      const fields = new Set(zodObjectFields(wireFile, wire))
      const flattened = new Set(Object.entries(FLATTENED).flatMap(([key, columns]) => (key.startsWith(`${wire}.`) ? columns : [])))
      const unreachable = pgTableColumns(tableFile, table).filter((column) => !fields.has(column) && !flattened.has(column) && !HOUSEKEEPING.has(column))
      assert.deepEqual(unreachable, [])
    })
  }

  it('e nenhum achatamento declarado sobrevive ao campo que ele descreve', () => {
    // Anistia que ninguém revisita vira sedimento — a mesma regra das outras allowlists.
    const orphans = Object.keys(FLATTENED).filter((key) => {
      const [wire, field] = key.split('.')
      const entry = PERSISTED.find(([name]) => name === wire)
      return !entry || !zodObjectFields(entry[1], wire).includes(field)
    })
    assert.deepEqual(orphans, [])
  })
})
