import { type createDb, eq, goals, plannedEntries, receivables, settings } from '@wlet/db'
import { os } from '../shared/context'
import { readDeclarationsWire } from '../shared/declarations'
import { toMoney } from '../shared/wire'

/**
 * A configuração declarada — as SETE partes, lidas e gravadas como UM agregado.
 *
 * A leitura junta quatro tabelas e uma linha de `settings`, e a escrita substitui o conjunto
 * numa transação. Não é falta de granularidade: a validação é do CONJUNTO (ids repetidos, regra
 * parcelada sem contagem), e gravar em pedaços abriria a janela para um estado que nenhuma das
 * partes sozinha recusa — é a §3 da arquitetura de serviços.
 */
export function configRouter(db: ReturnType<typeof createDb>) {
  const ler = (userId: string) => readDeclarationsWire(db, userId)

  return {
    get: os.config.get.handler(({ context }) => ler(context.userId)),

    replace: os.config.replace.handler(async ({ context, input }) => {
      const userId = context.userId
      await db.transaction(async (tx) => {
        await tx
          .insert(settings)
          .values({
            userId,
            budget: input.budget,
            accountProfiles: input.accounts,
            rules: input.rules.map((r) => ({ ...r, test: r.test })),
            selfNamePatterns: input.selfNamePatterns,
            // Nulo é "nunca escolheu", e é o que o contrato declara — `{}` não tem os campos.
            preferences: { scope: null, period: null, theme: null },
          })
          .onConflictDoUpdate({
            target: settings.userId,
            set: { budget: input.budget, accountProfiles: input.accounts, rules: input.rules, selfNamePatterns: input.selfNamePatterns },
          })

        // Substituir e não reconciliar: a lista chega inteira, e um `diff` aqui inventaria uma
        // semântica de merge que o contrato não declara.
        await tx.delete(plannedEntries).where(eq(plannedEntries.userId, userId))
        if (input.planned.length) {
          await tx.insert(plannedEntries).values(
            input.planned.map((e) => ({
              userId,
              id: e.id,
              kind: e.kind,
              label: e.label,
              amount: toMoney(e.amount),
              categoryId: e.categoryId,
              entity: e.entity,
              recurrence: e.recurrence,
              startMonth: e.startMonth,
              endMonth: e.endMonth ?? null,
              count: e.count !== undefined ? String(e.count) : null,
              dueOn: e.dueOn ?? null,
              exceptions: e.exceptions ?? null,
              match: e.match ?? null,
            })),
          )
        }

        await tx.delete(receivables).where(eq(receivables.userId, userId))
        if (input.receivables.length) {
          await tx.insert(receivables).values(
            input.receivables.map((r) => ({
              userId,
              id: r.id,
              label: r.label,
              debtor: r.debtor,
              amount: toMoney(r.amount),
              recurrence: r.recurrence,
              startMonth: r.startMonth,
              endMonth: r.endMonth ?? null,
              count: r.count !== undefined ? String(r.count) : null,
              dueOn: r.dueOn,
              match: r.match,
              offsetsCategoryId: r.offsetsCategoryId,
            })),
          )
        }

        await tx.delete(goals).where(eq(goals.userId, userId))
        if (input.goals.length) {
          await tx
            .insert(goals)
            .values(input.goals.map((g) => ({ userId, id: g.id, label: g.label, target: toMoney(g.target), saved: toMoney(g.saved), slot: String(g.slot), targetMonth: g.targetMonth })))
        }
      })
      return ler(userId)
    }),
  }
}
