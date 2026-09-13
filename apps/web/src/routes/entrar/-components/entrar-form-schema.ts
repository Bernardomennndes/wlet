import { z } from 'zod'

/**
 * O schema da entrada e do cadastro — extraído do componente para poder ser TESTADO.
 *
 * A senha mínima é 10 e não 8 porque é o que o servidor exige (`packages/auth/src/index.ts`,
 * `minPasswordLength: 10`). Repetir o número aqui é duplicação — mas a alternativa é a pessoa
 * descobrir o limite depois de enviar, por uma mensagem em inglês vinda do servidor. O comentário é
 * o que impedia os dois de divergirem em silêncio, e agora há um teste que confere o número.
 */
export const entrarFormSchema = z.object({
  /**
   * OPCIONAL porque o mesmo formulário serve os dois modos: entrar não pede nome, cadastrar pede.
   * Quem decide se o campo aparece é o `modo`; o schema aceita a ausência nos dois.
   */
  name: z.string().optional(),
  email: z.email('Informe um e-mail válido'),
  password: z.string().min(10, 'A senha precisa de pelo menos 10 caracteres'),
})

export type EntrarFormValues = z.infer<typeof entrarFormSchema>
