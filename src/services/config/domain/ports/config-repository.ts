import type { Declarations } from '@/lib/ingest/pipeline'

/**
 * A configuração declarada: o que o ingest lê para identificar, categorizar, projetar e cobrar.
 *
 * É EXATAMENTE a forma que o pipeline recebe (`Declarations`, no kernel), e a identidade não é
 * conveniência: enquanto eram dois tipos, o app carregava uma cópia de cada e editar a
 * configuração não mudava tela nenhuma. Um tipo só é o que impede as duas de divergirem.
 *
 * São os SETE, e é `rules`/`selfNamePatterns` que obrigam este contexto a viver em IndexedDB e
 * não em `localStorage` (§7): eles carregam dezenas de `RegExp`, e `JSON.stringify(/x/i)`
 * devolve `{}` sem erro nenhum.
 */
export type ConfigData = Declarations

export interface ConfigRepository {
  find(): Promise<ConfigData | null>
  save(data: ConfigData): Promise<void>
}

/**
 * De onde sai a configuração na primeira abertura.
 *
 * É PORTA, e não import do contexto de dataset, por causa da §4: o `config` não pode conhecer
 * as classes internas de quem gerou o JSON. Quem monta o serviço decide se a semente vem do
 * bundle, de um arquivo importado ou de nada.
 */
export interface ConfigSeed {
  read(): Promise<ConfigData | null>
}
