import { z } from 'zod'
import { entityKinds, flowKinds, plannedRecurrences, type Entity, type PlannedEntry, type Recurrence } from '@wlet/domain'
import { MAX_BUSINESS_DAY_OF_MONTH, MAX_DAY_OF_MONTH } from '@/components/due-on-field'

/**
 * O schema do lançamento previsto — extraído do componente para poder ser TESTADO.
 *
 * A `form-output-contract.md` §1.1 diz onde a maior parte dos casos de saída deve viver: num teste de
 * `parse`, que é função de objeto para objeto e não paga DOM por nada. Enquanto o schema era um
 * `const` privado dentro do `.tsx`, esse teste não existia — e este é o schema com mais decisão do
 * projeto: união discriminada no dia do vencimento, três campos que SOMEM por ramo, e o credor que
 * decide se a regra é projeção ou conta a pagar.
 *
 * Mora num `.ts` irmão e não exportado do `.tsx` por uma razão a mais: exportar algo que não é
 * componente de um arquivo de componente custa o fast refresh do React inteiro.
 */

// Os valores do schema saem das listas de enum do domínio, nunca de um `z.enum` redigitado:
// uma recorrência nova em `plannedRecurrences` tem de ser erro de compilação aqui, não uma
// opção que o formulário aceita e a leitura rejeita.
/**
 * Um lançamento previsto só é entrada ou saída — as outras duas faces de `Flow` (transferência
 * e reembolso) descrevem o que JÁ aconteceu no extrato, e não há como declará-las de antemão.
 * A lista sai de `flowKinds` filtrada, e não de rótulos redigitados aqui: é a §1 da
 * `enum-display`, e é o que o próprio `PlannedEntry.kind` já documenta ("subconjunto de `Flow`,
 * sem lista própria").
 */
const ENTRY_FLOWS = flowKinds.filter((f) => f.value === 'income' || f.value === 'expense')

const RECURRENCE_VALUES = plannedRecurrences.map((r) => r.value) as [Recurrence, ...Recurrence[]]
const ENTITY_VALUES = entityKinds.map((e) => e.value) as [Entity, ...Entity[]]

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

const schema = z
  .object({
    label: z.string().trim().min(1, 'Dê um nome ao lançamento.'),
    amount: z.number().positive('Informe o valor.'),
    kind: z.enum(['income', 'expense']),
    categoryId: z.string().min(1, 'Escolha uma categoria.'),
    entity: z.enum(ENTITY_VALUES),
    recurrence: z.enum(RECURRENCE_VALUES),
    startMonth: z.string().regex(MONTH, 'Escolha o mês inicial.'),
    count: z.number(),
    // Vazio quer dizer "sem prazo", que é diferente de um mês escolhido — a mesma distinção
    // que o plano sem mês faz.
    endMonth: z.union([z.string().regex(MONTH), z.literal('')]),
    /**
     * O credor, e é ELE que separa as duas naturezas de uma declaração: com nome preenchido a
     * regra vira CONTA A PAGAR e ganha situação em Pagamentos; sem nome, ela só projeta. Por
     * isso ele é opcional e não tem valor padrão — preencher por quem não preencheu
     * transformaria toda projeção numa cobrança que ninguém combinou.
     */
    merchants: z.string(),
    /**
     * O dia é um objeto de duas formas, e entra no formulário como qualquer outro campo.
     *
     * Ele vivia num `useRef` lido durante o render, o que o lint acusou com razão: um valor
     * assim não faz o campo re-renderizar, então escolher "5º dia útil" não redesenhava nada
     * até outra coisa mudar. `undefined` é estado legítimo — regra sem dia não entra no mês em
     * curso, porque não há como saber se ela já aconteceu.
     */
    dueOn: z
      .union([
        z.object({ kind: z.literal('day'), day: z.number().int().min(1).max(MAX_DAY_OF_MONTH) }),
        z.object({ kind: z.literal('business-day'), nth: z.number().int().min(1).max(MAX_BUSINESS_DAY_OF_MONTH) }),
      ])
      .optional(),
  })
  // Parcelada sem contagem não tem fim, e a janela dela iria ao infinito na projeção — é a
  // mesma recusa que `assertPlanned` faz no serviço, dita aqui antes de chegar lá.
  .superRefine((values, ctx) => {
    if (values.recurrence === 'installments' && !(Number.isInteger(values.count) && values.count > 0)) {
      ctx.addIssue({ code: 'custom', path: ['count'], message: 'Uma regra parcelada precisa do número de parcelas.' })
    }
  })
  /**
   * A SAÍDA do schema É o payload — e é por isso que a conversão mora aqui, não no `handleSubmit`.
   *
   * Ela vivia lá dentro: o credor virava lista, `count` e `endMonth` sumiam por ramo, `match`
   * nascia condicional. O efeito era que `z.output` descrevia uma forma e o objeto que de fato
   * saía era outra, montada à mão — nenhum `safeParse` conseguia provar o que a tela produz, e
   * o `tsc` não tinha o que comparar. Com o `.transform()`, o schema volta a ser a função
   * inteira (entra digitação, sai o lançamento), e a anotação de retorno faz o compilador ser o
   * juiz: mudar `PlannedEntry` quebra AQUI, na hora.
   *
   * `exceptions` NÃO entra: não há campo para ela na gaveta, e um payload que carrega dado que
   * nenhuma tecla produziu é adaptador disfarçado. Quem edita é que a preserva, do mesmo jeito
   * que já preserva o `id` — ver `submitEntry` em `previsao/-content.tsx`.
   */
  .transform((values): Omit<PlannedEntry, 'id'> => {
    const merchants = values.merchants
      .split(',')
      .map((m) => m.trim().toUpperCase())
      .filter(Boolean)
    return {
      label: values.label,
      amount: values.amount,
      kind: values.kind,
      categoryId: values.categoryId,
      entity: values.entity,
      recurrence: values.recurrence,
      startMonth: values.startMonth,
      // Os três abaixo SOMEM quando não se aplicam, em vez de irem como zero ou vazio:
      // `count` só existe em parcelada, `endMonth` só em mensal com prazo, e `match` só
      // quando há credor — e é a ausência dele que mantém a regra como mera projeção.
      count: values.recurrence === 'installments' ? values.count : undefined,
      endMonth: values.recurrence === 'monthly' && values.endMonth ? values.endMonth : undefined,
      dueOn: values.dueOn,
      match: merchants.length ? { merchants } : undefined,
    }
  })

/** A lista de fluxos declaráveis, para a gaveta desenhar o seletor. */
export { ENTRY_FLOWS }

/** O que os CAMPOS coletam. A saída é outra coisa — é `Omit<PlannedEntry, 'id'>`. */
export type PlannedFormValues = z.input<typeof schema>

export { schema as plannedFormSchema }
