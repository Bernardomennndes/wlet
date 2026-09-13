import { Warning } from '@phosphor-icons/react'
import { useRef } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Button } from '@wlet/ui/components/button'
import { Checkbox } from '@wlet/ui/components/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@wlet/ui/components/dialog'
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet, FieldTitle } from '@wlet/ui/components/field'
import { PACKAGE_PARTS, type PackageContents, type PackagePart } from '@wlet/services/backup'
import { importFormSchema as schema, type ImportFormValues as FormValues } from './import-dialog-schema'

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
  const present = contents ? PACKAGE_PARTS.filter((p) => describe(p, contents) !== null) : []
  const formRef = useRef<HTMLFormElement>(null)
  // Tudo o que o arquivo tem vem MARCADO: quem exportou tudo e importa em outra máquina quer
  // tudo, e desmarcar é a exceção. O formulário nasce com esses valores em vez de ser corrigido
  // por um efeito depois — a `key` no chamador o remonta a cada arquivo.
  const { control, handleSubmit } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { parts: present } })
  const parts = useWatch({ control, name: 'parts' })

  /**
   * O aviso que só a análise do id explica.
   *
   * O identificador de cada lançamento embute o `profile.id` do perfil de conta. Trazer o
   * conjunto sem as declarações que o produziram deixa os dois em desacordo — e o estrago não
   * aparece na hora: ele aparece no próximo reprocessamento, que gera ids diferentes e apaga
   * todo ajuste manual de categoria sem dizer nada.
   *
   * É AVISO, não impedimento: importar só os lançamentos é uma escolha legítima de quem sabe o
   * que está fazendo, então ele não vira erro do schema — sai como descrição do campo.
   */
  const idsAtRisk = parts.includes('dataset') && contents?.declarations !== null && !parts.includes('declarations')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar dados</DialogTitle>
          <DialogDescription>Escolha o que trazer. Cada parte marcada SUBSTITUI o que existe hoje neste navegador — nada é mesclado.</DialogDescription>
        </DialogHeader>

        {/* O botão de confirmar vive no rodapé, FORA do `<form>`, e submete pelo `formRef` —
            é a §4 da `forms.md`. */}
        <form ref={formRef} onSubmit={handleSubmit((values) => onConfirm(values.parts))} className="text-xs">
          <Controller
            control={control}
            name="parts"
            render={({ field, fieldState }) => (
              <FieldSet>
                <FieldLegend variant="label">O que trazer do arquivo</FieldLegend>
                {contents &&
                  present.map((part) => {
                    const info = describe(part, contents)
                    if (!info) return null
                    return (
                      <FieldLabel key={part} htmlFor={`parte-${part}`}>
                        <Field orientation="horizontal">
                          <Checkbox
                            id={`parte-${part}`}
                            checked={field.value.includes(part)}
                            onCheckedChange={() => {
                              // A ordem de `PACKAGE_PARTS` é preservada em vez da ordem de
                              // clique: a lista que sai daqui é a mesma que a importação lê, e
                              // depender de quem foi marcado primeiro seria diferença invisível
                              // entre duas execuções idênticas.
                              field.onChange(field.value.includes(part) ? field.value.filter((p) => p !== part) : PACKAGE_PARTS.filter((p) => p === part || field.value.includes(p)))
                            }}
                          />
                          <FieldContent>
                            <FieldTitle>{info.label}</FieldTitle>
                            <FieldDescription>{info.detail}</FieldDescription>
                          </FieldContent>
                        </Field>
                      </FieldLabel>
                    )
                  })}
                {present.length === 0 && <FieldDescription>Este arquivo não tem nenhuma parte reconhecível.</FieldDescription>}

                {idsAtRisk && (
                  <FieldDescription className="text-destructive flex items-start gap-2">
                    <Warning className="mt-0.5 shrink-0" />
                    <span>
                      Trazer os lançamentos sem as declarações deixa os dois em desacordo: o identificador de cada lançamento depende do perfil de conta, e o próximo reprocessamento mudaria todos,
                      apagando os ajustes manuais de categoria.
                    </span>
                  </FieldDescription>
                )}

                <FieldError errors={[fieldState.error]} />
              </FieldSet>
            )}
          />
        </form>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {/* Só o arquivo sem parte alguma desabilita o botão — a escolha vazia é recusada pelo
              schema, com mensagem, e não por um botão que não responde. */}
          <Button size="sm" disabled={present.length === 0} onClick={() => formRef.current?.requestSubmit()}>
            Importar {parts.length} {parts.length === 1 ? 'parte' : 'partes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
