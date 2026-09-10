import type { Period, Scope } from '@wlet/domain'
import type { EnvelopeSpec } from '../../shared/envelope'
import { browserStorage, makeLocalStorageDriver, type StorageLike, volatileStorage } from '../../shared/infrastructure/local-storage.driver'
import type { Preferences, PreferencesRepository, Theme } from '../domain/ports/preferences-repository'

/**
 * A preferência de visualização em `localStorage`, num envelope só.
 *
 * **A migração é o ponto delicado deste adapter.** Hoje o app grava TRÊS chaves cruas e sem
 * versão — `wlet.scope`, `wlet.period` e `wlet.theme` —, escritas por dois providers
 * diferentes. Ler só a chave nova faria o app abrir, no navegador de quem já usa, no recorte
 * errado, no período errado e com o tema piscando para o do sistema. Nada disso daria erro:
 * ausência de chave é indistinguível de "nunca escolheu".
 *
 * Então a leitura tem duas pontas — envelope novo primeiro, chaves antigas depois — e a
 * conversão acontece na primeira GRAVAÇÃO. As antigas não são apagadas: mantê-las custa alguns
 * bytes e torna a volta para uma versão anterior do app inofensiva, exatamente o que
 * `src/lib/storage.ts` já faz com o prefixo `wallet`.
 */
const SCOPES: Scope[] = ['all', 'PF', 'PJ']
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

function asScope(v: unknown): Scope | null {
  return typeof v === 'string' && (SCOPES as string[]).includes(v) ? (v as Scope) : null
}
function asTheme(v: unknown): Theme | null {
  return v === 'light' || v === 'dark' ? v : null
}
function asPeriod(v: unknown): Period | null {
  if (!v || typeof v !== 'object') return null
  const p = v as Partial<Period>
  if (typeof p.from !== 'string' || typeof p.to !== 'string') return null
  if (!MONTH.test(p.from) || !MONTH.test(p.to) || p.to < p.from) return null
  return { from: p.from, to: p.to }
}

const spec: EnvelopeSpec<Preferences> = {
  version: 1,
  empty: () => ({ scope: null, period: null, theme: null }),
  parse: (raw) => {
    if (!raw || typeof raw !== 'object') return null
    const p = raw as Partial<Preferences>
    return { scope: asScope(p.scope), period: asPeriod(p.period), theme: asTheme(p.theme) }
  },
}

const KEY = 'preferences'
/** As três chaves antigas, em ambos os prefixos — a renomeação da marca não pode custar a preferência. */
const LEGACY = ['scope', 'period', 'theme'] as const

export function makeLocalStoragePreferencesRepository(storage: StorageLike = browserStorage() ?? volatileStorage()): PreferencesRepository {
  const driver = makeLocalStorageDriver(storage, KEY, spec)

  function legacy(): Preferences {
    const read = (name: (typeof LEGACY)[number]): unknown => {
      try {
        const raw = storage.getItem(`wlet.${name}`) ?? storage.getItem(`wallet.${name}`)
        return raw === null || raw === undefined ? null : (JSON.parse(raw) as unknown)
      } catch {
        return null
      }
    }
    return { scope: asScope(read('scope')), period: asPeriod(read('period')), theme: asTheme(read('theme')) }
  }

  return {
    async find() {
      const current = await driver.read()
      // Se o envelope novo não disse NADA, as chaves antigas ainda podem ter dito tudo.
      if (current.scope !== null || current.period !== null || current.theme !== null) return current
      return legacy()
    },
    save: (preferences) => driver.write(preferences),
  }
}
