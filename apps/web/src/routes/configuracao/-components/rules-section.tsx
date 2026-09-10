import { Plus, Trash } from '@phosphor-icons/react'
import { AppCombobox } from '@wlet/ui/components/app-combobox'
import { Button } from '@wlet/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wlet/ui/components/card'
import { Input } from '@wlet/ui/components/input'
import { CATEGORIES } from '@wlet/domain'
import type { Rule } from '@wlet/ingest/rules'

const CATEGORY_ITEMS = CATEGORIES.map((c) => ({ value: c.id, label: c.label, description: c.description }))

/**
 * As SUAS regras de categorização — o comércio do bairro, os clientes, a cidade.
 *
 * Elas rodam ANTES das genéricas, e é essa ordem que permite `MERCADO DO SEU JOÃO` ganhar do
 * genérico `MERCADO `. Regra específica primeiro; nunca o contrário.
 *
 * **O padrão é digitado como texto e vira `RegExp`.** Um campo de expressão regular numa tela
 * assusta, mas o alternativo — uma lista de palavras — não expressaria alternativa (`A|B`) nem
 * âncora (`^IFD`), que é justamente o que as regras reais precisam. O que a tela faz é avisar
 * quando o texto não compila, em vez de gravar uma regra que nunca casa.
 */
function safeSource(pattern: RegExp | undefined): string {
  return pattern instanceof RegExp ? pattern.source : ''
}

function compile(text: string): RegExp | null {
  try {
    return new RegExp(text, 'i')
  } catch {
    return null
  }
}

export function RulesSection({ rules, onChange, disabled }: { rules: Rule[]; onChange: (next: Rule[]) => void; disabled: boolean }) {
  const patch = (index: number, change: Partial<Rule>) => onChange(rules.map((r, i) => (i === index ? { ...r, ...change } : r)))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Regras de categoria</CardTitle>
        <CardDescription>Rodam antes das genéricas — é essa ordem que faz o mercado do seu bairro ganhar da palavra “mercado”. Mudá-las exige reprocessar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {rules.map((rule, index) => {
          const source = safeSource(rule.test)
          const broken = compile(source) === null
          return (
            <div key={rule.id} className="flex flex-wrap items-end gap-2">
              <label className="space-y-1">
                <span className="text-muted-foreground block">Identificador</span>
                <Input value={rule.id} disabled={disabled} className="w-40" onChange={(e) => patch(index, { id: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground block">Casa com</span>
                <Input
                  value={source}
                  disabled={disabled}
                  className="w-64 font-mono"
                  aria-invalid={broken}
                  onChange={(e) => {
                    const next = compile(e.target.value)
                    // Só grava quando COMPILA. Guardar um padrão torto criaria uma regra que
                    // nunca casa e não se explica — pior que recusar a edição.
                    if (next) patch(index, { test: next })
                  }}
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground block">Categoria</span>
                <AppCombobox items={CATEGORY_ITEMS} value={rule.category} onValueChange={(v) => patch(index, { category: v })} aria-label="Categoria da regra" className="w-52" />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground block">Renomeia para</span>
                <Input value={rule.merchant ?? ''} disabled={disabled} className="w-40" onChange={(e) => patch(index, { merchant: e.target.value || undefined })} />
              </label>
              <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`Remover a regra ${rule.id}`} onClick={() => onChange(rules.filter((_, i) => i !== index))}>
                <Trash />
              </Button>
            </div>
          )
        })}
        {rules.length === 0 && <p className="text-muted-foreground">Nenhuma regra sua. Valem as genéricas, que já estão no código.</p>}
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => onChange([...rules, { id: `regra-${rules.length + 1}`, test: /NOME DO ESTABELECIMENTO/i, category: 'outros' }])}>
          <Plus /> Adicionar regra
        </Button>
      </CardContent>
    </Card>
  )
}
