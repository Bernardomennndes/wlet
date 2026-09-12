import type { Period, Scope } from '@wlet/domain'

export type Theme = 'light' | 'dark'

/**
 * Como a pessoa está OLHANDO para os dados: recorte, período e tema.
 *
 * Os três num agregado só porque a §3 exige: o contexto grava de uma vez ou não grava. Três
 * escritas separadas, disparadas por dois providers, não têm como sobreviver juntas a uma
 * requisição que falha no meio — e meia preferência gravada é pior que nenhuma.
 *
 * `null` significa NÃO ESCOLHIDO, e não um valor padrão. A diferença importa: o tema padrão
 * vem do sistema operacional e o período padrão vem do último mês com dados — os dois são
 * calculados por quem chama, com informação que este contexto não tem. Gravar um padrão aqui
 * afirmaria uma escolha que ninguém fez, que é a mesma regra do `payment` de um plano.
 */
export interface Preferences {
  scope: Scope | null
  period: Period | null
  theme: Theme | null
}

export interface PreferencesRepository {
  find(): Promise<Preferences>
  save(preferences: Preferences): Promise<void>
}
