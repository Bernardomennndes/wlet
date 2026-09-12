import type { AccountProfile } from '@wlet/ingest/pipeline'
import { fromRegexWire, remote, toRegexWire, type RegexWire, type RemoteDeps } from '../../shared/infrastructure/orpc'
import type { ConfigData, ConfigRepository } from '../domain/ports/config-repository'

/** O perfil como ele atravessa: a `RegExp` do `externalId` vira `{source, flags}`. */
type WireProfile = Omit<AccountProfile, 'match'> & {
  match: { bankCode?: string; externalId?: string | RegexWire; accountType?: AccountProfile['match']['accountType']; pathIncludes?: string }
}

/**
 * A configuração declarada, no servidor.
 *
 * As DUAS travessias de `RegExp` acontecem aqui — as regras de categoria e o `externalId` do
 * perfil de conta. É a mesma conversão que o servidor faz do outro lado, e o fato de o contrato
 * ser um só é o que impede as duas de divergirem: `JSON.stringify(/x/i)` devolve `{}` sem erro
 * nenhum, e um lado que esquecesse a conversão entregaria regra vazia em silêncio.
 *
 * O `match` é montado campo a campo, e não por spread condicional: com spread o TypeScript
 * mantém as duas formas na união e o objeto deixa de ser o do domínio.
 */
export function makeOrpcConfigRepository({ client }: RemoteDeps): ConfigRepository {
  return {
    async find() {
      const d = await remote(() => client.config.get())
      return {
        ...d,
        selfNamePatterns: d.selfNamePatterns.map(fromRegexWire),
        rules: d.rules.map((r) => ({ ...r, test: fromRegexWire(r.test) })),
        accounts: (d.accounts as WireProfile[]).map((a): AccountProfile => {
          const match: AccountProfile['match'] = {}
          if (a.match.bankCode !== undefined) match.bankCode = a.match.bankCode
          if (a.match.accountType !== undefined) match.accountType = a.match.accountType
          if (a.match.pathIncludes !== undefined) match.pathIncludes = a.match.pathIncludes
          if (a.match.externalId !== undefined) match.externalId = typeof a.match.externalId === 'string' ? a.match.externalId : fromRegexWire(a.match.externalId)
          return { ...a, match }
        }),
      } as ConfigData
    },

    async save(data) {
      await remote(() =>
        client.config.replace({
          ...data,
          selfNamePatterns: data.selfNamePatterns.map(toRegexWire),
          rules: data.rules.map((r) => ({ ...r, test: toRegexWire(r.test) })),
          accounts: data.accounts.map((a) => ({
            ...a,
            match: {
              ...(a.match.bankCode !== undefined ? { bankCode: a.match.bankCode } : {}),
              ...(a.match.accountType !== undefined ? { accountType: a.match.accountType } : {}),
              ...(a.match.pathIncludes !== undefined ? { pathIncludes: a.match.pathIncludes } : {}),
              ...(a.match.externalId === undefined ? {} : { externalId: a.match.externalId instanceof RegExp ? toRegexWire(a.match.externalId) : a.match.externalId }),
            },
          })),
        } as never),
      )
    },
  }
}
