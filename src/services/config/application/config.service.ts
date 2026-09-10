import type { Budget, Goal, PlannedEntry, Receivable } from '@/data/types'
import { InvalidConfigError } from '../domain/errors'
import type { ConfigData, ConfigRepository, ConfigSeed } from '../domain/ports/config-repository'

/**
 * Os casos de uso da configuração declarada.
 *
 * O serviço NÃO calcula previsão (§5): `buildForecast` vive em `src/lib/forecast.ts` e é lido
 * pela Visão geral e pela tela de Previsão. O que este contexto faz é guardar e validar a
 * ENTRADA daquele cálculo — misturar os dois produziria um segundo número para o mesmo mês,
 * que é precisamente o erro que o `CLAUDE.md` documenta ter cometido uma vez.
 */
export interface ConfigServiceDeps {
  repository: ConfigRepository
  seed: ConfigSeed
}

export interface ConfigService {
  load(): Promise<ConfigData>
  savePlanned(entries: PlannedEntry[]): Promise<ConfigData>
  saveBudget(budget: Budget): Promise<ConfigData>
  saveReceivables(receivables: Receivable[]): Promise<ConfigData>
  saveGoals(goals: Goal[]): Promise<ConfigData>
  /** Volta ao que a semente declara, descartando o que foi editado no navegador. */
  reset(): Promise<ConfigData>
  /**
   * Substitui a configuração INTEIRA — o caminho da importação de um arquivo exportado.
   *
   * Passa pela mesma validação das gravações parciais: vir de um export não torna um arquivo
   * confiável, porque ele pode ter sido editado à mão entre a exportação e a importação.
   */
  replace(next: ConfigData): Promise<ConfigData>
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

function assertPlanned(entries: PlannedEntry[]): void {
  for (const entry of entries) {
    if (!entry.id?.trim()) throw new InvalidConfigError('Todo lançamento previsto precisa de um id.')
    if (!MONTH.test(entry.startMonth ?? '')) throw new InvalidConfigError(`O lançamento "${entry.label}" precisa de um mês inicial no formato AAAA-MM.`)
    if (entry.recurrence === 'installments' && !(entry.count && entry.count > 0)) {
      // Parcelada sem contagem não tem fim, e a janela dela iria ao infinito na projeção.
      throw new InvalidConfigError(`A regra parcelada "${entry.label}" precisa do número de parcelas.`)
    }
  }
  const ids = entries.map((e) => e.id)
  if (new Set(ids).size !== ids.length) throw new InvalidConfigError('Há lançamentos previstos com o mesmo id.')
}

function assertBudget(budget: Budget): void {
  if (!(budget.monthlyLimit >= 0)) throw new InvalidConfigError('O teto de gastos não pode ser negativo.')
  if (!(budget.warnAt > 0 && budget.warnAt <= 1)) throw new InvalidConfigError('O aviso do teto deve ser uma fração entre 0 e 1.')
  for (const rubrica of budget.byCategory ?? []) {
    if (!(rubrica.amount >= 0)) throw new InvalidConfigError(`A rubrica de "${rubrica.categoryId}" não pode ser negativa.`)
  }
}

/**
 * A configuração de quem ainda não declarou nada.
 *
 * Ela existe porque a semente é OPCIONAL: ela vem de `src/generated/`, que `pnpm ingest`
 * escreve e o repositório não versiona, então um clone novo não a tem. Antes a ausência era
 * tratada como erro de montagem e derrubava o boot — o app não abria por falta de um arquivo
 * que ele mesmo promete não precisar.
 *
 * Todo campo é vazio, e nenhum é inventado. O teto em zero é lido como "não há teto"
 * (`budgetState`, em `src/lib/budget.ts`), não como "você estourou": um limite de gastos que
 * ninguém declarou não pode acusar estouro. O `warnAt` é o único com valor, porque a validação
 * exige uma fração entre 0 e 1 e ele só passa a significar algo depois que houver teto.
 */
export function emptyConfig(): ConfigData {
  return { planned: [], receivables: [], budget: { monthlyLimit: 0, warnAt: 0.75, byCategory: [] }, goals: [], accounts: [], rules: [], selfNamePatterns: [] }
}

export function makeConfigService({ repository, seed }: ConfigServiceDeps): ConfigService {
  async function current(): Promise<ConfigData> {
    const saved = await repository.find()
    if (saved) return saved
    return (await seed.read()) ?? emptyConfig()
  }

  /** Único caminho de escrita: valida o agregado INTEIRO e grava de uma vez (§3, §10). */
  async function commit(next: ConfigData): Promise<ConfigData> {
    assertPlanned(next.planned)
    assertBudget(next.budget)
    await repository.save(next)
    return next
  }

  return {
    load: current,
    savePlanned: async (planned) => commit({ ...(await current()), planned }),
    saveBudget: async (budget) => commit({ ...(await current()), budget }),
    saveReceivables: async (receivables) => commit({ ...(await current()), receivables }),
    saveGoals: async (goals) => commit({ ...(await current()), goals }),

    replace: (next) => commit(next),

    async reset() {
      // Sem semente, voltar ao início é voltar ao branco — que é onde este app começa.
      return commit((await seed.read()) ?? emptyConfig())
    },
  }
}
