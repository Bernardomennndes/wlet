import { oc } from '@orpc/contract'
import { z } from 'zod'
import { dataset, ingestReport, sourceFileUpload, sourcePath, storedSource, storedSourceContent } from './shape'

/**
 * O conjunto ingerido.
 *
 * `GET /dataset` é a leitura que o boot faz. As outras são escrita, e a diferença entre
 * `ingest` e `reingest` é o que a arquitetura já documentava: perfil de conta e regra de
 * categoria agem durante a LEITURA do arquivo, então mudá-las não altera nada sem o arquivo
 * passar de novo pelo pipeline — e os arquivos ficam guardados justamente para isso.
 *
 * **As três rotas de IMPORTAÇÃO (`replace`, `writeSources`, `sourceContent`) existem porque
 * importar um pacote não é ingerir.** Um pacote traz o conjunto já medido e os arquivos que o
 * produziram; passá-los pelo pipeline de novo recalcularia todo `transaction.id` — que é
 * `sha1` de sete campos, incluindo o `profile.id` do perfil de conta — e todo ajuste manual de
 * categoria, chaveado por esse id, sumiria em silêncio. Sem elas o caminho remoto não tinha
 * onde pousar: o repositório e o armazenamento de arquivos ficavam com `save` vazio, a
 * importação descartava tudo e a tela dizia "Importado".
 */
export const datasetRoutes = {
  get: oc.route({ method: 'GET', path: '/dataset' }).output(dataset.nullable()),

  /**
   * Grava um conjunto PRONTO, sem rodar o pipeline — o caminho da importação de um pacote.
   *
   * O corpo é o conjunto inteiro (3,3 MB medidos) e não pagina: ele é publicado numa
   * transação só, porque meio conjunto gravado é pior que nenhum, e paginar a escrita abriria
   * exatamente a janela que a transação fecha.
   */
  replace: oc
    .route({ method: 'PUT', path: '/dataset' })
    .input(dataset)
    .output(z.object({ ok: z.literal(true) })),

  ingest: oc
    .route({ method: 'POST', path: '/dataset/ingest' })
    .input(z.object({ sources: z.array(sourceFileUpload) }))
    .output(z.object({ dataset, report: ingestReport })),

  /** Reprocessa o que já está guardado, com a configuração de agora. */
  reingest: oc.route({ method: 'POST', path: '/dataset/reingest' }).output(z.object({ dataset, report: ingestReport })),

  reset: oc.route({ method: 'DELETE', path: '/dataset' }).output(z.object({ ok: z.literal(true) })),

  /**
   * O que está guardado, em METADADO — caminho, tamanho e quando subiu.
   *
   * O conteúdo fica de fora e a razão é o tamanho: são ~15 MB em base64 (os +33% sobre 11,4 MB
   * de PDF e xlsx já comprimidos, medidos em `@wlet/services/backup`). Uma listagem que o
   * trouxesse junto obrigaria toda tela que só quer contar arquivos a baixar tudo. Quem precisa
   * do conteúdo pede arquivo a arquivo, por `sourceContent`.
   */
  sources: oc.route({ method: 'GET', path: '/dataset/sources' }).output(z.array(storedSource)),

  /**
   * O conteúdo de UM arquivo guardado. É esta rota que permite EXPORTAR um pacote completo.
   *
   * **Uma rota por arquivo, e não uma página de N.** A unidade natural é o arquivo: base64 não
   * se corta ao meio, então uma página teria de ser "k arquivos inteiros" e o tamanho da
   * resposta continuaria mandado pelo maior deles — um xlsx de 4 MB vira 5,3 MB na mesma
   * resposta, pagine-se ou não. Por arquivo, o teto da resposta é o maior arquivo e não a
   * soma; o cliente já tem a lista de `sources` para saber o que pedir, e pode parar no meio
   * sem ter baixado o resto.
   *
   * Devolve `null` quando o caminho não está guardado, em vez de erro: a listagem e a busca são
   * duas requisições, e um arquivo apagado entre uma e outra é estado previsto — não falha.
   */
  sourceContent: oc
    .route({ method: 'GET', path: '/dataset/sources/content' })
    .input(z.object({ path: sourcePath }))
    .output(storedSourceContent.nullable()),

  /**
   * Repõe os arquivos guardados SEM rodar o pipeline — a outra metade da importação.
   *
   * Hoje os arquivos só chegavam ao servidor como efeito colateral de `ingest`, então importar
   * um pacote deixava a pessoa com o conjunto certo e sem os originais: o primeiro `reingest`
   * seguinte falharia por não ter fonte nenhuma. A pasta SUBSTITUI a anterior, pela mesma razão
   * que em `ingest` — um extrato que a pessoa apagou não pode continuar produzindo lançamentos.
   */
  writeSources: oc
    .route({ method: 'PUT', path: '/dataset/sources' })
    .input(z.object({ sources: z.array(sourceFileUpload) }))
    .output(z.object({ ok: z.literal(true) })),
}
