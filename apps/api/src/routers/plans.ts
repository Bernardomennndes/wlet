import { and, createDb, eq, planGroups, plans } from '@wlet/db'
import { os } from '../shared/context'
import { money, toMoney } from '../shared/wire'

type Row = typeof plans.$inferSelect

/** Do banco para o fio: os dois preços voltam a ser número, e `financed` some quando não há. */
function toPlan(r: Row) {
  return {
    id: r.id,
    label: r.label,
    categoryId: r.categoryId,
    cash: money(r.cash),
    ...(r.financedTotal !== null ? { financed: { total: money(r.financedTotal), installments: Number(r.financedInstallments ?? 2) } } : {}),
    ...(r.payment ? { payment: r.payment as 'cash' | 'financed' } : {}),
    ...(r.month ? { month: r.month } : {}),
    ...(r.groupId ? { groupId: r.groupId } : {}),
    status: r.status as 'decided' | 'considering' | 'discarded',
  }
}

export function plansRouter(db: ReturnType<typeof createDb>) {
  const listar = async (userId: string) => {
    const [grupos, itens] = await Promise.all([db.select().from(planGroups).where(eq(planGroups.userId, userId)), db.select().from(plans).where(eq(plans.userId, userId))])
    return { groups: grupos.map((g) => ({ id: g.id, label: g.label })), items: itens.map(toPlan) }
  }

  const valores = (userId: string, id: string, p: Partial<ReturnType<typeof toPlan>>) => ({
    userId,
    id,
    label: p.label ?? '',
    categoryId: p.categoryId ?? 'outros',
    cash: toMoney(p.cash ?? 0),
    financedTotal: p.financed ? toMoney(p.financed.total) : null,
    financedInstallments: p.financed ? String(p.financed.installments) : null,
    payment: p.payment ?? null,
    month: p.month ?? null,
    groupId: p.groupId ?? null,
    status: p.status ?? 'considering',
  })

  return {
    list: os.plans.list.handler(({ context }) => listar(context.userId)),

    add: os.plans.add.handler(async ({ context, input }) => {
      await db.insert(plans).values(valores(context.userId, `plan-${Date.now().toString(36)}`, input))
      return listar(context.userId)
    }),

    update: os.plans.update.handler(async ({ context, input }) => {
      const [atual] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.userId, context.userId), eq(plans.id, input.id)))
      if (!atual) return listar(context.userId)
      // O patch é aplicado sobre o que ESTÁ gravado, não sobre o que o cliente acha que está:
      // duas edições seguidas na mesma linha não podem uma desfazer a outra.
      await db
        .update(plans)
        .set(valores(context.userId, input.id, { ...toPlan(atual), ...input.patch }))
        .where(and(eq(plans.userId, context.userId), eq(plans.id, input.id)))
      return listar(context.userId)
    }),

    remove: os.plans.remove.handler(async ({ context, input }) => {
      await db.delete(plans).where(and(eq(plans.userId, context.userId), eq(plans.id, input.id)))
      return listar(context.userId)
    }),

    addGroup: os.plans.addGroup.handler(async ({ context, input }) => {
      await db.insert(planGroups).values({ userId: context.userId, id: `group-${Date.now().toString(36)}`, label: input.label })
      return listar(context.userId)
    }),

    removeGroup: os.plans.removeGroup.handler(async ({ context, input }) => {
      // Apagar o grupo NÃO apaga os planos dele: eles perdem o grupo e continuam na lista. É a
      // regra que o serviço do navegador já tinha, e ela vale igual aqui.
      await db
        .update(plans)
        .set({ groupId: null })
        .where(and(eq(plans.userId, context.userId), eq(plans.groupId, input.id)))
      await db.delete(planGroups).where(and(eq(planGroups.userId, context.userId), eq(planGroups.id, input.id)))
      return listar(context.userId)
    }),

    replaceAll: os.plans.replaceAll.handler(async ({ context, input }) => {
      // Substituição inteira é o caminho da importação de um pacote. Numa transação: metade
      // gravada é pior que nada gravado.
      await db.transaction(async (tx) => {
        await tx.delete(plans).where(eq(plans.userId, context.userId))
        await tx.delete(planGroups).where(eq(planGroups.userId, context.userId))
        if (input.groups.length) await tx.insert(planGroups).values(input.groups.map((g) => ({ userId: context.userId, id: g.id, label: g.label })))
        if (input.items.length) await tx.insert(plans).values(input.items.map((p) => valores(context.userId, p.id, p)))
      })
      return listar(context.userId)
    }),
  }
}
