import { type Db, eq, goals, plannedEntries, receivables, settings } from '@wlet/db'
import type { GoalSlot } from '@wlet/domain'
import type { AccountProfile } from '@wlet/ingest/pipeline'

/** O perfil como o JSONB o guarda: a `RegExp` do `externalId` vira `{source, flags}` no fio. */
type StoredProfile = Omit<AccountProfile, 'match'> & {
  match: { bankCode?: string; externalId?: string | RegexWire; accountType?: AccountProfile['match']['accountType']; pathIncludes?: string }
}
import { fromRegexWire, money, toRegexWire, type RegexWire } from './wire'

/**
 * A configuração declarada, montada de quatro tabelas e uma linha de `settings`.
 *
 * Vive fora do router porque tem DOIS consumidores que não podem divergir: o `GET /config`, que
 * a devolve para a tela, e o pipeline, que a recebe para categorizar e casar. Se o segundo
 * remontasse a sua própria versão, uma regra nova passaria a valer numa e não na outra.
 *
 * As `RegExp` voltam a ser `RegExp` AQUI, e não na tela: quem consome é o pipeline, e ele espera
 * o tipo do domínio, não o do fio.
 */
export async function readDeclarations(db: Db, userId: string) {
  const [conf, previstos, cobrancas, metas] = await Promise.all([
    db
      .select()
      .from(settings)
      .where(eq(settings.userId, userId))
      .then((r) => r[0]),
    db.select().from(plannedEntries).where(eq(plannedEntries.userId, userId)),
    db.select().from(receivables).where(eq(receivables.userId, userId)),
    db.select().from(goals).where(eq(goals.userId, userId)),
  ])

  return {
    // O `match` é montado campo a campo, e não por spread: com spread condicional o TypeScript
    // mantém `RegexWire` na união e o objeto deixa de ser um `AccountProfile`.
    accounts: ((conf?.accountProfiles as StoredProfile[]) ?? []).map((a): AccountProfile => {
      const match: AccountProfile['match'] = {}
      if (a.match.bankCode !== undefined) match.bankCode = a.match.bankCode
      if (a.match.accountType !== undefined) match.accountType = a.match.accountType
      if (a.match.pathIncludes !== undefined) match.pathIncludes = a.match.pathIncludes
      if (a.match.externalId !== undefined) match.externalId = typeof a.match.externalId === 'string' ? a.match.externalId : fromRegexWire(a.match.externalId)
      return { ...a, match }
    }),
    // As `RegExp` voltam a ser `RegExp` aqui, e não na tela: quem consome é o pipeline, e ele
    // espera o tipo do domínio, não o do fio.
    selfNamePatterns: ((conf?.selfNamePatterns as RegexWire[]) ?? []).map(fromRegexWire),
    rules: ((conf?.rules as { id: string; test: RegexWire; category: string; merchant?: string }[]) ?? []).map((r) => ({ ...r, test: fromRegexWire(r.test) })),
    planned: previstos.map((e) => ({
      id: e.id,
      kind: e.kind as 'income' | 'expense',
      label: e.label,
      amount: money(e.amount),
      categoryId: e.categoryId,
      entity: e.entity as 'PF' | 'PJ',
      recurrence: e.recurrence as 'monthly' | 'once' | 'installments',
      startMonth: e.startMonth,
      // Os opcionais SOMEM quando não se aplicam, em vez de irem como nulo: é a ausência de
      // `match` que mantém uma regra como mera projeção, e um `match: null` explícito não
      // diria a mesma coisa para quem lê.
      ...(e.endMonth ? { endMonth: e.endMonth } : {}),
      ...(e.count ? { count: Number(e.count) } : {}),
      ...(e.dueOn ? { dueOn: e.dueOn as never } : {}),
      ...(e.exceptions ? { exceptions: e.exceptions as Record<string, number> } : {}),
      ...(e.match ? { match: e.match as never } : {}),
    })),
    receivables: cobrancas.map((r) => ({
      id: r.id,
      label: r.label,
      debtor: r.debtor,
      amount: money(r.amount),
      entity: r.entity as 'PF' | 'PJ',
      recurrence: r.recurrence as 'monthly' | 'once' | 'installments',
      startMonth: r.startMonth,
      dueOn: r.dueOn as never,
      match: r.match as never,
      offsetsCategoryId: r.offsetsCategoryId,
      ...(r.endMonth ? { endMonth: r.endMonth } : {}),
      ...(r.count ? { count: Number(r.count) } : {}),
      ...(r.accountId ? { accountId: r.accountId } : {}),
    })),
    budget: (conf?.budget as { monthlyLimit: number; warnAt: number }) ?? { monthlyLimit: 0, warnAt: 0.75, byCategory: [] },
    goals: metas.map((g) => ({
      id: g.id,
      label: g.label,
      saved: money(g.saved),
      target: money(g.target),
      targetMonth: g.targetMonth, // `slot` é um dos OITO da paleta, não um número livre: a cor da barra é declarada por
      // meta e não escolhida por posição na lista.
      slot: Number(g.slot) as GoalSlot,
    })),
  }
}

/**
 * A mesma configuração, na forma do FIO.
 *
 * A diferença é uma só e é a razão de haver duas funções: `RegExp` não existe em JSON. O
 * pipeline quer o tipo do domínio; o `GET /config` quer o que atravessa. Converter na fronteira,
 * uma vez, é o que impede um `{}` silencioso do outro lado.
 */
export async function readDeclarationsWire(db: Db, userId: string) {
  const d = await readDeclarations(db, userId)
  return {
    ...d,
    selfNamePatterns: d.selfNamePatterns.map(toRegexWire),
    rules: d.rules.map((r) => ({ ...r, test: toRegexWire(r.test) })),
    // `match.externalId` aceita `RegExp` e string, e só o primeiro precisa de travessia. O
    // objeto é montado campo a campo em vez de espalhado: com spread condicional o TypeScript
    // mantém `RegExp` na união e o contrato deixa de casar.
    accounts: d.accounts.map((a) => ({
      ...a,
      match: {
        ...(a.match.bankCode !== undefined ? { bankCode: a.match.bankCode } : {}),
        ...(a.match.accountType !== undefined ? { accountType: a.match.accountType } : {}),
        ...(a.match.pathIncludes !== undefined ? { pathIncludes: a.match.pathIncludes } : {}),
        ...(a.match.externalId === undefined ? {} : { externalId: a.match.externalId instanceof RegExp ? toRegexWire(a.match.externalId) : a.match.externalId }),
      },
    })),
  }
}
