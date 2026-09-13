import { z } from 'zod'
import { PACKAGE_PARTS } from '@wlet/services/backup'

/**
 * A escolha de partes é um FORMULÁRIO, e não um punhado de caixinhas guardadas num `useState`.
 *
 * Ela fica PENDENTE esperando o botão do rodapé e só então alimenta uma escrita que substitui o
 * armazenamento inteiro — é exatamente o caso que a `forms.md` §1 cobre. O que era um
 * `disabled={selected.size === 0}` (um botão morto, sem dizer por quê) vira a mensagem do schema,
 * dita no lugar onde se escolhe.
 *
 * A lista de valores sai de `PACKAGE_PARTS`, do próprio serviço de cópia: uma parte nova no pacote
 * tem de ser erro de compilação aqui, não uma caixinha que ninguém lembrou de somar.
 *
 * Mora num `.ts` irmão para poder ser testado sem montar React (`form-output-contract.md` §1.1).
 */
export const importFormSchema = z.object({
  parts: z.array(z.enum(PACKAGE_PARTS)).min(1, 'Escolha ao menos uma parte para importar.'),
})

export type ImportFormValues = z.infer<typeof importFormSchema>
