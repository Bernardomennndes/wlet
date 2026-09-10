import { Warning } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '@wlet/ui/components/button'
import { Checkbox } from '@wlet/ui/components/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@wlet/ui/components/dialog'
import { PACKAGE_PARTS, type PackageContents, type PackagePart } from '@wlet/services/backup'

/**
 * O que cada parte contém, em português, para a escolha ser informada.
 *
 * A descrição sai do CONTEÚDO do arquivo, não de um rótulo fixo: "5.694 lançamentos" diz o que
 * vai ser substituído; "Conjunto de dados" não diz nada que ajude a decidir.
 */
function describe(part: PackagePart, contents: PackageContents): { label: string; detail: string } | null {
  switch (part) {
    case 'dataset':
      return contents.dataset ? { label: 'Lançamentos', detail: `${contents.dataset.transactions.toLocaleString('pt-BR')} lançamentos em ${contents.dataset.accounts} contas` } : null
    case 'declarations':
      return contents.declarations
        ? {
            label: 'Declarações',
            detail: [
              `${contents.declarations.planned} previstos`,
              `${contents.declarations.receivables} cobranças`,
              `${contents.declarations.goals} metas`,
              `${contents.declarations.rules} regras`,
              `${contents.declarations.accounts} perfis de conta`,
            ].join(' · '),
          }
        : null
    case 'plans':
      return contents.plans === null ? null : { label: 'Planos', detail: `${contents.plans} ${contents.plans === 1 ? 'plano' : 'planos'} de compra` }
    case 'overrides':
      return contents.overrides === null ? null : { label: 'Ajustes de categoria', detail: `${contents.overrides} ${contents.overrides === 1 ? 'ajuste manual' : 'ajustes manuais'}` }
    case 'preferences':
      return contents.preferences ? { label: 'Preferências', detail: 'Recorte, período e tema' } : null
    case 'sources':
      return contents.sources === null ? null : { label: 'Arquivos originais', detail: `${contents.sources} extratos e faturas — é o que permite reprocessar depois` }
  }
}

export function ImportDialog({
  contents,
  open,
  onOpenChange,
  onConfirm,
}: {
  contents: PackageContents | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (parts: PackagePart[]) => void
}) {
  // Tudo o que o arquivo tem vem MARCADO: quem exportou tudo e importa em outra máquina quer
  // tudo, e desmarcar é a exceção. O estado é recriado a cada arquivo pela `key` no chamador.
  const present = contents ? PACKAGE_PARTS.filter((p) => describe(p, contents) !== null) : []
  const [selected, setSelected] = useState<Set<PackagePart>>(() => new Set(present))

  const toggle = (part: PackagePart) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(part)) next.delete(part)
      else next.add(part)
      return next
    })
  }

  /**
   * O aviso que só a análise do id explica.
   *
   * O identificador de cada lançamento embute o `profile.id` do perfil de conta. Trazer o
   * conjunto sem as declarações que o produziram deixa os dois em desacordo — e o estrago não
   * aparece na hora: ele aparece no próximo reprocessamento, que gera ids diferentes e apaga
   * todo ajuste manual de categoria sem dizer nada.
   */
  const idsAtRisk = selected.has('dataset') && contents?.declarations !== null && !selected.has('declarations')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar dados</DialogTitle>
          <DialogDescription>Escolha o que trazer. Cada parte marcada SUBSTITUI o que existe hoje neste navegador — nada é mesclado.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          {contents &&
            present.map((part) => {
              const info = describe(part, contents)
              if (!info) return null
              return (
                <label key={part} className="flex cursor-pointer items-start gap-2">
                  <Checkbox checked={selected.has(part)} onCheckedChange={() => toggle(part)} className="mt-0.5" />
                  <span>
                    <span className="font-medium">{info.label}</span>
                    <span className="text-muted-foreground block">{info.detail}</span>
                  </span>
                </label>
              )
            })}
          {present.length === 0 && <p className="text-muted-foreground">Este arquivo não tem nenhuma parte reconhecível.</p>}

          {idsAtRisk && (
            <p className="text-destructive flex items-start gap-2">
              <Warning className="mt-0.5 shrink-0" />
              Trazer os lançamentos sem as declarações deixa os dois em desacordo: o identificador de cada lançamento depende do perfil de conta, e o próximo reprocessamento mudaria todos, apagando os
              ajustes manuais de categoria.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" disabled={selected.size === 0} onClick={() => onConfirm([...selected])}>
            Importar {selected.size} {selected.size === 1 ? 'parte' : 'partes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
