/**
 * O pipeline de ingestão: de extrato e fatura crus ao conjunto de dados.
 *
 * Ele é UM só e roda nos dois ambientes — a casca de Node (`pnpm ingest`) e o Web Worker do
 * navegador. Não é organização: sem isso existiriam duas implementações do mesmo casamento e da
 * mesma categorização, e elas divergiriam no primeiro ajuste.
 *
 * O pacote não busca nada e não conhece disco: recebe os arquivos já lidos, a configuração e um
 * `IngestEnv` com `inflate`/`inflateRaw`/`shortId`, e devolve o conjunto pronto mais um
 * relatório. É essa injeção que o torna testável e portável — e `meta.generatedAt` entra pelo
 * mesmo caminho, para "mesmo `docs/`, mesmo resultado" ser conferência executável.
 *
 * `sha1` e `inflate` vivem aqui porque só ele os usa: o primeiro produz o id determinístico de
 * cada transação, e uma divergência de um byte apagaria em silêncio todo ajuste manual de
 * categoria; o segundo é o que permite ler xlsx sem dependência.
 */
export * from './pipeline'
export * from './io'
export * from './rules'
export * from './matching'
export { sha1 } from './sha1'
export { inflate, inflateRaw } from './inflate'
