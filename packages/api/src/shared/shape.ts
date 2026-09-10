import { z } from 'zod'

/**
 * As formas que atravessam o fio.
 *
 * Elas descrevem o JSON, não o domínio — e a diferença tem um caso concreto: `RegExp` não
 * existe em JSON. As regras de categoria carregam dezenas delas (é a razão de `config` viver em
 * IndexedDB e não em `localStorage`, onde `JSON.stringify(/x/i)` devolve `{}`), então no fio
 * elas viajam como `{ source, flags }` e são remontadas dos dois lados.
 */
export const regexWire = z.object({ source: z.string(), flags: z.string() })

/** AAAA-MM. O app inteiro fala em mês, não em data, quando o assunto é competência. */
export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

/** AAAA-MM-DD, sem fuso: a data de um lançamento é um dia do calendário, não um instante. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const entity = z.enum(['PF', 'PJ'])
export const scope = z.enum(['all', 'PF', 'PJ'])

/**
 * O envelope de erro do domínio.
 *
 * Os serviços já lançam erros nomeados (`IncompleteDatasetError`, `InvalidConfigError`,
 * `NoSourcesError`) e o `code` os preserva através do fio — sem ele, o cliente receberia "500"
 * e teria de adivinhar pela mensagem, que é texto para humano e muda.
 */
export const domainError = z.object({
  code: z.enum(['INCOMPLETE_DATASET', 'INVALID_CONFIG', 'NO_SOURCES', 'NOT_FOUND', 'UNAUTHORIZED']),
  message: z.string(),
})
