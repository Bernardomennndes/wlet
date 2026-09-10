import { and, createDb, eq, overrides } from '@wlet/db'
import { os } from '../shared/context'

/**
 * Os ajustes manuais de categoria.
 *
 * Ao contrário das preferências, aqui é TABELA: são milhares de linhas em potencial (uma por
 * transação ajustada), consultadas por id, e o mapa inteiro é lido no boot. Um JSONB cresceria
 * sem teto num campo só, e cada ajuste reescreveria o documento inteiro.
 */
export function overridesRouter(db: ReturnType<typeof createDb>) {
  const listar = async (userId: string) => {
    const rows = await db.select().from(overrides).where(eq(overrides.userId, userId))
    return Object.fromEntries(rows.map((r) => [r.transactionId, r.categoryId]))
  }

  return {
    list: os.overrides.list.handler(({ context }) => listar(context.userId)),

    set: os.overrides.set.handler(async ({ context, input }) => {
      // `null` REMOVE o ajuste — é "volte ao que o ingest decidiu", que é diferente de gravar
      // uma categoria vazia.
      if (input.categoryId === null) {
        await db.delete(overrides).where(and(eq(overrides.userId, context.userId), eq(overrides.transactionId, input.transactionId)))
      } else {
        await db
          .insert(overrides)
          .values({ userId: context.userId, transactionId: input.transactionId, categoryId: input.categoryId })
          .onConflictDoUpdate({ target: [overrides.userId, overrides.transactionId], set: { categoryId: input.categoryId } })
      }
      return listar(context.userId)
    }),

    clear: os.overrides.clear.handler(async ({ context }) => {
      await db.delete(overrides).where(eq(overrides.userId, context.userId))
      return { ok: true as const }
    }),
  }
}
