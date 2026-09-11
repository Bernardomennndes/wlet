import { type Db, authAccounts, sessions, users, verifications } from '@wlet/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer } from 'better-auth/plugins'

/**
 * A autenticação do WLET — Better Auth, o mesmo da Selfie.
 *
 * **Self-hosted, e é essa a razão da escolha.** Um provedor externo veria o cadastro de quem usa
 * um app de extrato bancário: quem, quando, de onde. Aqui a sessão nunca sai da sua
 * infraestrutura, e a promessa de privacidade do produto não passa a depender do contrato de
 * privacidade de um terceiro. Para este app isso não é preferência — é coerência.
 *
 * O que NÃO veio da Selfie, e por quê: lá há verificação híbrida de senha (bcrypt e scrypt),
 * resíduo de uma migração vinda do MongoDB, e campos de papel no usuário, que são do domínio
 * dela. O WLET nasce sem senha legada e sem papéis — copiar os dois traria complexidade a
 * carregar para sempre sem nada para resolver.
 */
export function createAuth(db: Db, options: { baseURL: string; secret: string; trustedOrigins: string[] }) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: users, session: sessions, account: authAccounts, verification: verifications },
    }),
    baseURL: options.baseURL,
    secret: options.secret,
    /**
     * As origens confiáveis são DECLARADAS, e a lista nunca inclui `*`.
     *
     * Ela é o que impede um site qualquer de iniciar um fluxo de login contra este servidor e
     * receber a sessão de volta. É o mesmo argumento do CORS, num lugar diferente.
     */
    trustedOrigins: options.trustedOrigins,

    emailAndPassword: {
      enabled: true,
      /**
       * A verificação de e-mail fica DESLIGADA enquanto não há envio de e-mail configurado.
       *
       * Ligá-la sem um remetente deixaria toda conta nova presa num limbo — cadastrada e
       * incapaz de entrar, sem nada na tela explicando. Quando o envio existir, esta linha
       * vira `true` e o fluxo passa a valer.
       */
      requireEmailVerification: false,
      minPasswordLength: 10,
    },

    /**
     * O `bearer` é o que permite entrar por `Authorization: Bearer <token>`.
     *
     * Sem ele, o Better Auth só lê COOKIE — e o app funcionaria, mas todo teste e todo script
     * ficariam de fora. Os dois caminhos levam à mesma sessão, que é o ponto: dois modos de
     * autenticar com estados separados seria a duplicação de sempre, voltando pela porta dos
     * fundos.
     */
    plugins: [bearer()],

    session: {
      /** Sete dias, renovados a cada dia de uso. */
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
