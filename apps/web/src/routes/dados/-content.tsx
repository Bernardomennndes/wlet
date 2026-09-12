import { ArrowClockwise, ArrowsClockwise, CheckCircle, DownloadSimple, FolderOpen, UploadSimple, Warning } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@wlet/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wlet/ui/components/card'
import { useDocumentTitle } from '@/hooks/use-document-title'
import type { SourceFile } from '@wlet/ingest/io'
import type { IngestReport } from '@wlet/ingest/pipeline'
import { preloaded } from '@/providers/preloaded'
import { exportState, importState, inspectPackage, type ImportSummary, type PackageContents, type PackagePart } from '@wlet/services/backup'
import { ImportDialog } from './-components/import-dialog'
import { services } from '@/services'

/**
 * De onde vêm os dados, e como trocá-los — sem terminal.
 *
 * Esta tela existe porque a ingestão saiu do `pnpm ingest` e passou a caber no navegador. Ela
 * carrega o que o terminal fazia: escolher os arquivos, rodar o pipeline e MOSTRAR O RELATÓRIO.
 * O relatório não é detalhe — duplicado descartado, fatura recusada, transferência sem
 * contraparte e conta criada sozinha são exatamente o que explica um número estranho, e um
 * ingest de navegador sem ele seria mais silencioso que o do terminal.
 *
 * **O que os arquivos atravessam mudou.** Eles eram lidos e processados aqui, e o conjunto ficava
 * no IndexedDB; agora sobem para o servidor, que roda o mesmo pipeline e publica o resultado. O
 * relatório continua chegando inteiro — é a única coisa que explica um número estranho, e perdê-lo
 * na travessia seria trocar um ingest silencioso por outro.
 */
type State = { kind: 'idle' } | { kind: 'running'; files: number } | { kind: 'done'; report: IngestReport } | { kind: 'failed'; message: string }

export function DadosPageContent() {
  useDocumentTitle('Meus dados')
  const origin = preloaded().datasetOrigin
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [stored, setStored] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const backupInput = useRef<HTMLInputElement>(null)
  const [backup, setBackup] = useState<{ kind: 'idle' } | { kind: 'done'; summary: ImportSummary } | { kind: 'failed'; message: string }>({ kind: 'idle' })
  // O arquivo lido fica em espera enquanto o diálogo pergunta o que trazer. Importar direto e
  // depois avisar seria o oposto do que se quer num app cujo armazenamento é a única cópia.
  const [pending, setPending] = useState<{ contents: PackageContents; payload: Parameters<typeof importState>[0]; key: number } | null>(null)

  const refreshStorage = useCallback(() => {
    void services().dataset.storedSources().then(setStored)
  }, [])

  // Uma leitura na montagem: quantos arquivos estão guardados decide se o botão de reprocessar
  // faz sentido, e sem isso ele apareceria prometendo algo que ainda não existe.
  useEffect(refreshStorage, [refreshStorage])

  // Sem mapeamento: a configuração JÁ É a forma que o pipeline recebe. Enquanto eram dois
  // tipos, esta função traduzia um no outro — e era ali que os dois podiam divergir.
  const readConfig = useCallback(() => services().config.load(), [])

  const reprocess = useCallback(async () => {
    setState({ kind: 'running', files: stored ?? 0 })
    try {
      const { report } = await services().dataset.reingest(await readConfig(), new Date().toISOString())
      setState({ kind: 'done', report })
      refreshStorage()
    } catch (cause) {
      setState({ kind: 'failed', message: cause instanceof Error ? cause.message : String(cause) })
    }
  }, [readConfig, refreshStorage, stored])

  const onPick = useCallback(
    async (list: FileList | null) => {
      if (!list?.length) return
      setState({ kind: 'running', files: list.length })
      try {
        // O CAMINHO relativo é a identidade do arquivo para o pipeline: ele distingue
        // `fatura/xp/` de `extrato/xp/` e é assim que o cartão não vira conta corrente.
        // `webkitRelativePath` só existe quando se escolhe uma PASTA — por isso o botão pede a
        // pasta, e não arquivos soltos.
        const sources: SourceFile[] = await Promise.all(
          [...list].map(async (file) => ({
            path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
            bytes: new Uint8Array(await file.arrayBuffer()),
          })),
        )
        const { report } = await services().dataset.ingest(sources, await readConfig(), new Date().toISOString())
        setState({ kind: 'done', report })
        refreshStorage()
      } catch (cause) {
        setState({ kind: 'failed', message: cause instanceof Error ? cause.message : String(cause) })
      }
    },
    [readConfig, refreshStorage],
  )

  /**
   * Baixa o arquivo sem passar por servidor nenhum.
   *
   * `URL.createObjectURL` e um clique sintético. O pacote é MONTADO aqui, a partir do que os
   * cinco serviços devolvem, e por isso não existe rota de exportação: uma rota teria de montar
   * o mesmo arquivo de novo, do outro lado, e as duas versões divergiriam na primeira parte nova.
   * O objeto é revogado logo depois, senão o blob fica preso na memória da aba até ela fechar.
   */
  const download = useCallback(async () => {
    const json = await exportState(services())
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `wlet-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  /**
   * Lê o arquivo e ABRE o diálogo — não importa nada ainda.
   *
   * A inspeção é separada da escrita porque a pessoa precisa ver o que vai substituir antes de
   * substituir: a importação SOBRESCREVE o que está no servidor, e "importar e ver no que dá"
   * não é uma opção quando a parte substituída não tem para onde voltar.
   */
  const inspect = useCallback(async (file: File | null | undefined) => {
    if (!file) return
    try {
      const read = inspectPackage(await file.text())
      if (!read) {
        setBackup({ kind: 'failed', message: 'Este arquivo não é uma cópia do WLET.' })
        return
      }
      setPending({ contents: read.contents, payload: read.payload, key: Date.now() })
    } catch (cause) {
      setBackup({ kind: 'failed', message: cause instanceof Error ? cause.message : String(cause) })
    }
  }, [])

  const confirmImport = useCallback(
    async (parts: PackagePart[]) => {
      if (!pending) return
      const payload = pending.payload
      setPending(null)
      try {
        setBackup({ kind: 'done', summary: await importState(payload, parts, services()) })
        refreshStorage()
      } catch (cause) {
        setBackup({ kind: 'failed', message: cause instanceof Error ? cause.message : String(cause) })
      }
    },
    [pending, refreshStorage],
  )

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Meus dados</h1>
          <p className="text-muted-foreground text-xs">Os extratos vão para o seu servidor, que lê e guarda.</p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Conjunto em uso</CardTitle>
          <CardDescription>
            {origin === 'stored'
              ? 'Os seus dados, guardados no servidor.'
              : origin === 'seed'
                ? 'A cópia de demonstração que veio no aplicativo — nenhum extrato seu foi lido ainda.'
                : 'Não há conjunto nenhum: nem os seus dados, nem a demonstração. É daqui que se sai do zero.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <dl className="grid grid-cols-2 gap-2">
            <div>
              <dt className="text-muted-foreground">Origem</dt>
              <dd className="font-mono">{origin === 'stored' ? 'servidor' : origin === 'seed' ? 'aplicativo' : 'vazio'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Arquivos guardados</dt>
              <dd className="font-mono">{stored === null ? '—' : stored === 0 ? 'nenhum' : String(stored)}</dd>
            </div>
          </dl>
          {/* A medição de espaço e o pedido de persistência saíram com o armazenamento do
              navegador: os dois falavam da cota do IndexedDB, e o navegador não guarda mais nada
              que o app leia. Quem cuida de espaço e de cópia agora é quem opera o servidor. */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={refreshStorage}>
              <ArrowClockwise /> Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Ler extratos e faturas</CardTitle>
          <CardDescription>Escolha a pasta com os arquivos. Eles sobem para o servidor, que roda o pipeline e publica o resultado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <input
            ref={input}
            type="file"
            multiple
            // `webkitdirectory` é o que faz o navegador entregar o CAMINHO de cada arquivo, e
            // sem caminho o pipeline não distingue fatura de extrato do mesmo banco.
            // A propriedade não existe no tipo do React, daí o atributo cru.
            {...{ webkitdirectory: '' }}
            className="hidden"
            onChange={(e) => void onPick(e.target.files)}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => input.current?.click()} disabled={state.kind === 'running'}>
              <FolderOpen /> {state.kind === 'running' ? `Lendo ${state.files} arquivos…` : 'Escolher a pasta docs/'}
            </Button>
            {/* Só aparece com arquivo guardado: um botão permanentemente desabilitado ocupa o
                mesmo espaço para dizer que não serve, e antes da primeira leitura ele nem
                descreve uma ação possível. */}
            {stored !== null && stored > 0 && (
              <Button size="sm" variant="outline" onClick={() => void reprocess()} disabled={state.kind === 'running'}>
                <ArrowsClockwise /> Reprocessar os {stored} arquivos
              </Button>
            )}
          </div>
          <p className="text-muted-foreground">
            Os arquivos ficam guardados no servidor depois da primeira leitura. Mudou um perfil de conta ou uma regra de categoria? Reprocessar aplica a mudança sem escolher a pasta de novo — as duas
            agem na LEITURA do arquivo, então nada muda sem passar pelo pipeline outra vez.
          </p>

          {state.kind === 'failed' && (
            <p className="text-destructive flex items-start gap-2">
              <Warning className="mt-0.5 shrink-0" /> {state.message}
            </p>
          )}

          {state.kind === 'done' && <Report report={state.report} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Exportar e importar</CardTitle>
          <CardDescription>
            Tudo o que existe na sua conta, num arquivo só — lançamentos, declarações, planos, ajustes e os extratos originais. Na importação você escolhe o que trazer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <input ref={backupInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void inspect(e.target.files?.[0])} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void download()}>
              <DownloadSimple /> Exportar
            </Button>
            <Button size="sm" variant="outline" onClick={() => backupInput.current?.click()}>
              <UploadSimple /> Importar
            </Button>
          </div>
          {backup.kind === 'failed' && (
            <p className="text-destructive flex items-start gap-2">
              <Warning className="mt-0.5 shrink-0" /> {backup.message}
            </p>
          )}
          {backup.kind === 'done' && (
            <p className="flex items-start gap-2">
              <CheckCircle className="mt-0.5 shrink-0" />
              <span>
                Importado: {backup.summary.imported.length} {backup.summary.imported.length === 1 ? 'parte' : 'partes'}.{' '}
                <button type="button" className="underline" onClick={() => window.location.reload()}>
                  Recarregue a página
                </button>{' '}
                para as telas passarem a usar.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* A `key` recria o estado das caixinhas a cada arquivo: sem ela, a escolha do arquivo
          anterior sobreviveria para um arquivo com partes diferentes. */}
      {pending && <ImportDialog key={pending.key} contents={pending.contents} open onOpenChange={() => setPending(null)} onConfirm={(parts) => void confirmImport(parts)} />}
    </div>
  )
}

/**
 * O relatório do terminal, na tela.
 *
 * Cada bloco só aparece quando tem conteúdo: uma lista de "0 problemas" ocupa espaço para
 * dizer que não há nada, e o que se procura aqui é justamente o que destoa.
 */
function Report({ report }: { report: IngestReport }) {
  const blocks: [string, string[]][] = [
    ['Faturas em PDF recusadas', report.pdfProblems],
    ['Contas criadas automaticamente', report.unknownAccounts],
    ['Problemas nas regras de previsão', report.plannedProblems],
    ['Problemas nas cobranças', report.receivableProblems],
    ['Problemas nas metas', report.goalProblems],
    ['Problemas no razão da corretora', report.brokerageProblems],
    ['Problemas nos investimentos', report.investmentProblems],
    ['Arquivos ignorados como duplicados', report.skipped],
  ]
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2">
        <CheckCircle className="text-[var(--status-ok,currentColor)]" />
        {report.filesRead} arquivos lidos · {report.unmatchedTransfers.length} transferências sem contraparte · {report.uncategorized.length} sem categoria específica
      </p>
      {report.duplicated.length > 0 && <p className="text-muted-foreground">Lançamentos repetidos descartados (períodos sobrepostos): {report.duplicated.reduce((s, d) => s + d.count, 0)}</p>}
      {blocks.map(([title, items]) =>
        items.length === 0 ? null : (
          <div key={title}>
            <p className="font-medium">
              {title}: {items.length}
            </p>
            <ul className="text-muted-foreground list-inside list-disc">
              {items.slice(0, 12).map((item) => (
                <li key={item} className="truncate">
                  {item}
                </li>
              ))}
            </ul>
            {items.length > 12 && <p className="text-muted-foreground">… e mais {items.length - 12}</p>}
          </div>
        ),
      )}
      <p className="flex items-center gap-2 pt-1">
        <DownloadSimple />
        <span>
          O conjunto foi gravado.{' '}
          <button type="button" className="underline" onClick={() => window.location.reload()}>
            Recarregue a página
          </button>{' '}
          para as telas passarem a lê-lo.
        </span>
      </p>
    </div>
  )
}
