import { z } from 'zod'
import type { PlanGroup } from '@wlet/domain'

/**
 * O schema do grupo de planos — extraído do componente para poder ser TESTADO.
 *
 * A `form-output-contract.md` §1.1 pede o teste de `parse`, e a regra da JANELA é justamente o tipo
 * de coisa que só um teste prende: ela é opcional inteira, mas se o início existe o fim é obrigatório,
 * e o fim não pode ser antes do início. Três estados, dois deles recusados.
 *
 * Mora num `.ts` irmão porque um `const` privado não pode ser testado, e exportá-lo de um arquivo de
 * componente custa o fast refresh do React inteiro.
 */
const MONTH = /^\d{4}-\d{2}$/

export const groupFormSchema = z
  .object({
    label: z.string().trim().min(1, 'Dê um nome ao grupo.'),
    // A janela é opcional, e a ausência dela se escreve `null` — não string vazia, e não um
    // mês qualquer que depois seria confundido com uma escolha (`forms.md` §3). O seletor de
    // mês fala em string; a conversão fica nele, que é quem não sabe dizer null.
    from: z.string().nullish(),
    to: z.string().nullish(),
    note: z.string(),
  })
  .superRefine((values, ctx) => {
    if (!values.from) return
    if (!MONTH.test(values.from) || !values.to || !MONTH.test(values.to)) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'Escolha os dois meses da janela.' })
      return
    }
    if (values.to < values.from) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'O fim da janela não pode ser antes do início.' })
    }
  })
  /**
   * A SAÍDA do schema já é o grupo — sem adaptador entre o formulário e quem o consome.
   *
   * A conversão morava no `handleSubmit`, e o efeito colateral era que o tipo do schema não
   * era o payload: nada prendia um ao outro, e provar a saída exigiria montar a tela
   * (`form-output-contract.md` §1.1).
   */
  .transform(
    (values): Omit<PlanGroup, 'id'> => ({
      label: values.label,
      from: values.from ?? undefined,
      to: values.to ?? undefined,
      // A observação vem de um `<textarea>`, que nunca devolve `null`: aqui o vazio é mesmo a
      // string em branco, e é ela que vira ausência.
      note: values.note.trim() || undefined,
    }),
  )

/** O que os CAMPOS guardam — a entrada do schema, antes da conversão. */
export type GroupFormValues = z.input<typeof groupFormSchema>
