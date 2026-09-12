import type { SourceFile } from '@wlet/ingest/io'

/**
 * Os arquivos crus que produziram o conjunto — extratos, faturas, planilhas da B3.
 *
 * Existe por um motivo que só aparece quando a configuração passa a ser editável: mudar um
 * perfil de conta ou uma regra de categoria não altera nada sozinho, porque as duas coisas
 * agem durante a LEITURA dos arquivos. Sem guardá-los, cada ajuste exigiria escolher a pasta
 * de novo, e "editar a configuração pela tela" seria uma promessa pela metade.
 *
 * São ~12 MB medidos, e eles sobem UMA vez: quem grava é `save`, e o reprocessamento parte do
 * que já está lá.
 */
export interface SourceStore {
  save(sources: SourceFile[]): Promise<void>
  load(): Promise<SourceFile[]>
  count(): Promise<number>
  clear(): Promise<void>
}
