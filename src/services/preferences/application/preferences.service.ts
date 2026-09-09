import type { Period, Scope } from '@/lib/finance'
import { InvalidPeriodError } from '../domain/errors'
import type { Preferences, PreferencesRepository, Theme } from '../domain/ports/preferences-repository'

/**
 * Os casos de uso da preferência de visualização.
 *
 * O serviço NÃO calcula o período padrão nem lê o tema do sistema (§5): o primeiro depende do
 * último mês com dados e o segundo do `prefers-color-scheme`. Ele guarda o que foi ESCOLHIDO,
 * e devolve `null` quando não houve escolha — quem monta a tela aplica o padrão.
 *
 * O piso do período entra por dependência (`floorMonth`) em vez de ser importado: ele sai de
 * `META.months[0]`, que é dataset, e um contexto não alcança as entranhas de outro (§4).
 */
export interface PreferencesServiceDeps {
  repository: PreferencesRepository
  /** O primeiro mês com lançamentos. Antes dele não há barra para desenhar. */
  floorMonth: () => string
}

export interface PreferencesService {
  load(): Promise<Preferences>
  setScope(scope: Scope): Promise<Preferences>
  setPeriod(period: Period): Promise<Preferences>
  setTheme(theme: Theme): Promise<Preferences>
  clear(): Promise<Preferences>
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export function makePreferencesService({ repository, floorMonth }: PreferencesServiceDeps): PreferencesService {
  /**
   * Aplica o piso e recusa janela invertida.
   *
   * **Piso sim, teto não** — a mesma assimetria do `clampPeriod` da tela: antes do primeiro
   * lançamento não existe barra para desenhar, mas o futuro é aberto de propósito, porque
   * parcela e plano caem em qualquer mês à frente.
   */
  function normalize(period: Period): Period {
    if (!MONTH.test(period.from) || !MONTH.test(period.to)) throw new InvalidPeriodError('O período deve usar meses no formato AAAA-MM.')
    if (period.to < period.from) throw new InvalidPeriodError('O período termina antes de começar.')
    const floor = floorMonth()
    return { from: period.from < floor ? floor : period.from, to: period.to < floor ? floor : period.to }
  }

  async function patch(change: Partial<Preferences>): Promise<Preferences> {
    const next = { ...(await repository.find()), ...change }
    await repository.save(next)
    return next
  }

  return {
    load: () => repository.find(),
    setScope: (scope) => patch({ scope }),
    setTheme: (theme) => patch({ theme }),
    // `async` não é enfeite: `normalize` lança, e numa arrow direta ele lançaria de forma
    // SÍNCRONA, antes de existir promessa. Quem chamasse `setPeriod(p).catch(...)` levaria uma
    // exceção não capturada em vez de uma rejeição — API assíncrona que às vezes explode de
    // forma síncrona é a pior das duas. O teste do período invertido é quem prova isto.
    async setPeriod(period) {
      return patch({ period: normalize(period) })
    },
    async clear() {
      const empty: Preferences = { scope: null, period: null, theme: null }
      await repository.save(empty)
      return empty
    },
  }
}
