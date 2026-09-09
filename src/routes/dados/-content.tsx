import { ArrowClockwise, ArrowsClockwise, CheckCircle, DownloadSimple, FolderOpen, UploadSimple, Warning } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDocumentTitle } from '@/hooks/use-document-title'
import type { SourceFile } from '@/lib/ingest/io'
import type { IngestReport } from '@/lib/ingest/pipeline'
import { preloaded } from '@/providers/preloaded'
import { exportState, importState, inspectPackage, type ImportSummary, type PackageContents, type PackagePart } from '@/services/backup'
import { ImportDialog } from './-components/import-dialog'
import { services } from '@/services'
import { requestPersistence, storageEstimate } from '@/lib/db'

/**
 * De onde vêm os dados, e como trocá-los — sem terminal.
 *
 * Esta tela existe porque a ingestão saiu do `pnpm ingest` e passou a caber no navegador. Ela
 * carrega o que o terminal fazia: escolher os arquivos, rodar o pipeline e MOSTRAR O RELATÓRIO.
 * O relatório não é detalhe — duplicado descartado, fatura recusada, transferência sem
 * contraparte e conta criada sozinha são exatamente o que explica um número estranho, e um
 * ingest de navegador sem ele seria mais silencioso que o do terminal.
 */
function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

type State = { kind: 'idle' } | { kind: 'running'; files: number } | { kind: 'done'; report: IngestReport } | { kind: 'failed'; message: string }

export function DadosPageContent() {
  useDocumentTitle('Meus dados')
  const origin = preloaded().datasetOrigin
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [stored, setStored] = useState<number | null>(null)
  const [persistent, setPersistent] = useState<boolean | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const backupInput = useRef<HTMLInputElement>(null)
  const [backup, setBackup] = useState<{ kind: 'idle' } | { kind: 'done'; summary: ImportSummary } | { kind: 'failed'; message: string }>({ kind: 'idle' })
  // O arquivo lido fica em espera enquanto o diálogo pergunta o que trazer. Importar direto e
  // depois avisar seria o oposto do que se quer num app cujo armazenamento é a única cópia.
  const [pending, setPending] = useState<{ contents: PackageContents; payload: Parameters<typeof importState>[0]; key: number } | null>(null)

  const refreshStorage = useCallback(() => {
    void storageEstimate().then(setStorage)
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
   * `URL.createObjectURL` e um clique sintético: é o único caminho que mantém o dado no
   * navegador — um endpoint de download exigiria enviar para fora justamente o que este app
   * existe para não enviar. O objeto é revogado logo depois, senão o blob fica preso na
   * memória da aba até ela fechar.
   */
  const download = useCallback(async () => {
    const json = await exportState()
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
   * substituir. "Importar e ver no que dá" não é uma opção quando o armazenamento do navegador
   * é a única cópia.
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
        setBackup({ kind: 'done', summary: await importState(payload, parts) })
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
          <p className="text-muted-foreground text-xs">Os extratos são lidos no seu navegador e nunca saem dele.</p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Conjunto em uso</CardTitle>
          <CardDescription>
            {origin === 'indexeddb' ? 'Os seus dados, guardados neste navegador.' : 'A cópia de demonstração que veio no aplicativo — nenhum extrato seu foi lido ainda.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Origem</dt>
              <dd className="font-mono">{origin === 'indexeddb' ? 'IndexedDB' : 'aplicativo'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Espaço usado</dt>
              <dd className="font-mono">{storage ? `${bytes(storage.usage)} de ${bytes(storage.quota)}` : '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Arquivos guardados</dt>
              <dd className="font-mono">{stored === null ? '—' : stored === 0 ? 'nenhum' : String(stored)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Proteção contra limpeza</dt>
              <dd className="font-mono">{persistent === null ? '—' : persistent ? 'ativa' : 'não concedida'}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={refreshStorage}>
              <ArrowClockwise /> Medir espaço
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void requestPersistence().then(setPersistent)
              }}
            >
              <CheckCircle /> Pedir para não apagar
            </Button>
          </div>
          <p className="text-muted-foreground">
            O navegador pode limpar o armazenamento sob pressão de disco, e com ele vão os seus dados. Peça a proteção e mantenha uma cópia exportada — o preço de o app não ter servidor.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Ler extratos e faturas</CardTitle>
          <CardDescription>Escolha a pasta com os arquivos. Ela é lida aqui mesmo: nada é enviado para lugar nenhum.</CardDescription>
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
            Os arquivos ficam guardados aqui depois da primeira leitura. Mudou um perfil de conta ou uma regra de categoria? Reprocessar aplica a mudança sem escolher a pasta de novo — as duas agem na
            LEITURA do arquivo, então nada muda sem passar pelo pipeline outra vez.
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
            Tudo o que existe neste navegador, num arquivo só — lançamentos, declarações, planos, ajustes e os extratos originais. Na importação você escolhe o que trazer.
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
