import type { ComponentType, ReactNode } from 'react'
import { Calculator, Info, Lightbulb, Target } from '@phosphor-icons/react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { cn } from '@/lib/utils'

/**
 * A explicação do cálculo de um KPI. É campo obrigatório nos shells de `@/components/kpi`
 * porque o tipo é o que impede um número de destaque chegar à tela sem dizer de onde veio —
 * a pergunta "o que significa essa porcentagem?" é o sintoma de um KPI sem definição.
 */
export interface MetricDefinition {
  /** O nome da métrica, para o cabeçalho do painel e para o `aria-label` do gatilho. */
  title: string
  /** O que o número mede, em uma ou duas frases. */
  whatItIs: string
  /** O cálculo REAL, lido de quem produz o número. Não parafrasear o rótulo. */
  howItIsCalculated: string
  /**
   * Para que o número serve — e, sobretudo, COMO ELE PODE ENGANAR. É aqui que se registra a
   * leitura errada previsível: o recorte que ele não cobre, a amostra pequena que o torna
   * instável, o vizinho de quem ele depende para significar alguma coisa.
   */
  whatItIsFor: string
  /** Obrigatório quando o cálculo não é uma soma óbvia. Notação linear: + − × ÷ =. */
  formula?: string
  /** `scenario` nomeia os números; `calculation` é a cadeia de linhas, a última o resultado. */
  example?: { scenario: string; calculation: string[] }
}

function SectionTitle({ icon: Icon, children }: { icon: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon className="size-3 text-muted-foreground" />
      <span className="font-semibold text-[9px] text-muted-foreground uppercase tracking-[0.1em]">{children}</span>
    </span>
  )
}

/** O ⓘ ao lado do rótulo, e o painel que ele abre. */
export function MetricInfoPopover({ definition, className }: { definition: MetricDefinition; className?: string }) {
  const { title, whatItIs, howItIsCalculated, whatItIsFor, formula, example } = definition

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <button
            type="button"
            aria-label={`Mais informações sobre ${title}`}
            className={cn(
              'inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
              className,
            )}
          />
        }
      >
        <Info className="size-4" />
      </HoverCardTrigger>

      <HoverCardContent side="top" align="end" className="w-88 space-y-4 p-0">
        <span className="flex flex-col gap-1 px-4 pt-4">
          <span className="font-semibold text-sm leading-tight tracking-tight">{title}</span>
          <span className="text-[11px] text-muted-foreground leading-relaxed">{whatItIs}</span>
        </span>

        <span className="flex flex-col gap-2 border-t px-4 py-3">
          <SectionTitle icon={Calculator}>Como é calculado</SectionTitle>
          <span className="text-[11px] text-muted-foreground leading-relaxed">{howItIsCalculated}</span>
          {formula ? <code className="mt-1 overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-[11px] text-foreground">{formula}</code> : null}
        </span>

        {example ? (
          <span className="flex flex-col gap-2 border-t px-4 py-3">
            <SectionTitle icon={Lightbulb}>Exemplo</SectionTitle>
            <span className="text-[11px] text-muted-foreground leading-relaxed">{example.scenario}</span>
            <span className="flex flex-col overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-[11px] text-foreground leading-relaxed">
              {example.calculation.map((line, index) => (
                <span key={line} className={cn('whitespace-pre', index === example.calculation.length - 1 && 'font-semibold')}>
                  {line}
                </span>
              ))}
            </span>
          </span>
        ) : null}

        <span className="flex flex-col gap-2 border-t px-4 py-3 pb-4">
          <SectionTitle icon={Target}>Para que serve</SectionTitle>
          <span className="text-[11px] text-muted-foreground leading-relaxed">{whatItIsFor}</span>
        </span>
      </HoverCardContent>
    </HoverCard>
  )
}
