import { useId, useState } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import { AppCombobox } from '@wlet/ui/components/app-combobox'
import { Button } from '@wlet/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wlet/ui/components/card'
import { FieldError } from '@wlet/ui/components/field'
import { Input } from '@wlet/ui/components/input'
import { newId, CATEGORIES } from '@wlet/domain'
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

/**
 * Uma regra, com o padrão em RASCUNHO enquanto ele ainda não compila.
 *
 * Gravar só o que compila continua certo: um padrão torto viraria uma regra que nunca casa e
 * não se explica. O que estava errado era desenhar SEMPRE o gravado — como o campo é controlado
 * pelo `test` já guardado, a tecla recusada simplesmente não aparecia, e escrever `MERCADO \(`
 * ficava impossível: a barra invertida sozinha não compila, então o campo parecia travado, sem
 * uma palavra de explicação.
 *
 * O rascunho segura o texto intermediário e a mensagem diz por que ele ainda não valeu. `null`
 * é "nada pendente": assim que o texto compila ele é gravado e o campo volta a desenhar o que
 * está guardado, sem duas fontes de verdade convivendo.
 */
function RuleRow({ rule, disabled, onPatch, onRemove }: { rule: Rule; disabled: boolean; onPatch: (change: Partial<Rule>) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const errorId = useId()
  /** Só existe rascunho quando o texto NÃO compila — então ele próprio é o sinal de recusa. */
  const broken = draft !== null
  const source = draft ?? safeSource(rule.test)

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="space-y-1">
        <span className="text-muted-foreground block">Identificador</span>
        <Input value={rule.id} disabled={disabled} className="w-40" onChange={(e) => onPatch({ id: e.target.value })} />
      </label>
      <label className="space-y-1">
        <span className="text-muted-foreground block">Casa com</span>
        <Input
          value={source}
          disabled={disabled}
          className="w-64 font-mono"
          aria-invalid={broken}
          aria-describedby={broken ? errorId : undefined}
          onChange={(e) => {
            const next = compile(e.target.value)
            if (next) {
              setDraft(null)
              onPatch({ test: next })
            } else {
              setDraft(e.target.value)
            }
          }}
        />
        {broken && (
          <FieldError id={errorId} className="w-64">
            Expressão inválida — esta versão do padrão ainda não foi gravada. Vale a última que compilou.
          </FieldError>
        )}
      </label>
      <label className="space-y-1">
        <span className="text-muted-foreground block">Categoria</span>
        <AppCombobox items={CATEGORY_ITEMS} value={rule.category} onValueChange={(v) => onPatch({ category: v })} aria-label="Categoria da regra" className="w-52" />
      </label>
      <label className="space-y-1">
        <span className="text-muted-foreground block">Renomeia para</span>
        <Input value={rule.merchant ?? ''} disabled={disabled} className="w-40" onChange={(e) => onPatch({ merchant: e.target.value || undefined })} />
      </label>
      <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`Remover a regra ${rule.id}`} onClick={onRemove}>
        <Trash />
      </Button>
    </div>
  )
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
        {rules.map((rule, index) => (
          <RuleRow key={rule.id} rule={rule} disabled={disabled} onPatch={(change) => patch(index, change)} onRemove={() => onChange(rules.filter((_, i) => i !== index))} />
        ))}
        {rules.length === 0 && <p className="text-muted-foreground">Nenhuma regra sua. Valem as genéricas, que já estão no código.</p>}
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => onChange([...rules, { id: newId('regra'), test: /NOME DO ESTABELECIMENTO/i, category: 'outros' }])}>
          <Plus /> Adicionar regra
        </Button>
      </CardContent>
    </Card>
  )
}
