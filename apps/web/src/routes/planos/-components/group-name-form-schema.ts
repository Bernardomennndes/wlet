import type { PlanGroup } from '@wlet/domain'
import { z } from 'zod'

/**
 * O schema do nome de um grupo, editado na própria linha — extraído do componente para ser TESTADO.
 *
 * É um campo só, e ainda assim formulário: a §1 da `forms.md` vale "inclusive de UM único campo e
 * inclusive inline". Mora num `.ts` irmão pela mesma razão dos outros schemas: um `const` privado não
 * se testa, e exportá-lo de um arquivo de componente custa o fast refresh.
 *
 * O `trim` é da SAÍDA: "  Viagem  " grava "Viagem", e só espaços conta como vazio.
 */
export const groupNameFormSchema = z
  .object({
    label: z.string().trim().min(1, 'Dê um nome ao grupo.'),
  })
  // A saída é declarada no tipo do DOMÍNIO: se o nome do grupo mudar de forma, o `tsc` quebra aqui,
  // no formulário, e não três camadas abaixo (`form-domain-link.test.ts`).
  .transform((values): Pick<PlanGroup, 'label'> => ({ label: values.label }))

/** O que o campo guarda — a entrada do schema. */
export type GroupNameFormValues = z.input<typeof groupNameFormSchema>
