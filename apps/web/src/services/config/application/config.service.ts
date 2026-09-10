import type { Budget, Goal, PlannedEntry, Receivable } from '@wlet/domain'
import { rubricAmount } from '@/lib/rubric'
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
    for (const item of rubrica.items ?? []) {
      // Só o que é IMPOSSÍVEL é recusado — valor negativo, que quebraria a soma. Nome em
      // branco e quantidade zero são recusados por NINGUÉM, e a versão anterior errava aqui:
      // um item recém-adicionado é necessariamente incompleto, então exigir nome e quantidade
      // fazia a lista recusar a própria adição. Foi o que me levou a inventar um rótulo
      // "Novo item" e uma quantidade 1 — afirmando por quem não tinha digitado nada, contra a
      // regra que este projeto aplica ao plano sem mês e à célula vazia. E como a tela grava a
      // cada tecla, apagar o nome para trocá-lo acendia um erro vermelho no meio da digitação.
      //
      // Item incompleto não some da lista nem estraga a conta: `quantity × unitAmount` com
      // zero de um lado dá zero, que é exatamente o que um item ainda não preenchido vale.
      if (item.quantity < 0) throw new InvalidConfigError(`A quantidade de "${item.label || 'um item'}" não pode ser negativa.`)
      if (item.unitAmount < 0) throw new InvalidConfigError(`O valor unitário de "${item.label || 'um item'}" não pode ser negativo.`)
    }
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
/**
 * Deixa o `amount` de toda rubrica composta igual à soma dos itens ANTES de gravar.
 *
 * A leitura já ignora o `amount` quando há composição (`rubricAmount`), então isto não é o que
 * mantém as contas certas — é o que impede o dado GRAVADO de carregar um total obsoleto. Sem
 * isso, um pacote exportado levaria um número que ninguém lê e que contradiz a lista ao lado
 * dele, e a primeira pessoa a abrir o JSON acreditaria no errado.
 */
function normalizeBudget(config: ConfigData): ConfigData {
  const byCategory = config.budget.byCategory?.map((rubrica) => (rubrica.items?.length ? { ...rubrica, amount: rubricAmount(rubrica) } : rubrica))
  return { ...config, budget: { ...config.budget, byCategory } }
}

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
    const normalized = normalizeBudget(next)
    await repository.save(normalized)
    return normalized
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
