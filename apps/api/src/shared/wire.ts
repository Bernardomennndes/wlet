/**
 * A travessia entre o que o banco guarda e o que o contrato declara.
 *
 * Duas conversões existem porque JSON não tem os tipos que o domínio usa:
 *
 * 1. **`RegExp`** — as regras de categoria carregam dezenas. É a razão de `config` nunca ter
 *    cabido em `localStorage` (`JSON.stringify(/x/i)` devolve `{}`), e no fio elas viajam como
 *    `{source, flags}`.
 * 2. **Dinheiro** — o Postgres devolve `numeric` como STRING, de propósito: um `double` não
 *    representa centavo exatamente, e este app já foi mordido por isso (fev/26 tinha entradas
 *    12973.399999999999 contra saídas 12973.400000000001, iguais nos centavos, e o mês era
 *    pintado de vermelho por um `>` que comparava float). A conversão acontece na fronteira,
 *    uma vez, e o domínio segue falando em número.
 */
export interface RegexWire {
  source: string
  flags: string
}

export const toRegexWire = (re: RegExp): RegexWire => ({ source: re.source, flags: re.flags })
export const fromRegexWire = ({ source, flags }: RegexWire): RegExp => new RegExp(source, flags)

/** `numeric` do Postgres chega como string. Converter aqui é converter num lugar só. */
export const money = (value: string | number | null): number => (value === null ? 0 : typeof value === 'number' ? value : Number(value))

/** E volta como string, para o driver não arredondar no caminho. */
export const toMoney = (value: number): string => value.toFixed(2)
