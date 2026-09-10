import type { Period, Scope } from '@wlet/domain'

export type Theme = 'light' | 'dark'

/**
 * Como a pessoa está OLHANDO para os dados: recorte, período e tema.
 *
 * Os três num agregado só porque a §3 exige: `localStorage` não tem transação, então um
 * contexto grava um envelope numa chave. Hoje eles moram em três chaves separadas, escritas
 * por dois providers, e nada garante que as três sobrevivam juntas a uma aba fechando.
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
