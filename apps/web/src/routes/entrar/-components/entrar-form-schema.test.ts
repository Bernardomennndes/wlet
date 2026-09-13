import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { entrarFormSchema } from './entrar-form-schema'

/**
 * A entrada do formulário de acesso — e o número que ele COMPARTILHA com o servidor.
 *
 * O mínimo de senha é 10 porque o Better Auth do `packages/auth` está configurado com
 * `minPasswordLength: 10`. São dois lugares com o mesmo número, e a alternativa (não repetir) era
 * pior: a pessoa descobria o limite depois de enviar, por uma mensagem em inglês vinda do servidor.
 *
 * O teste existe para a duplicação não divergir em SILÊNCIO. Ele afirma o 10 em cima e embaixo do
 * limite, então baixar o schema para 8 sem baixar o servidor quebra aqui.
 */
describe('a entrada do formulário de acesso', () => {
  const base = { name: '', email: 'pessoa@exemplo.com', password: 'senha-de-dez' }

  it('a senha tem no mínimo 10 caracteres — o mesmo número do servidor', () => {
    assert.equal(entrarFormSchema.safeParse({ ...base, password: 'a'.repeat(10) }).success, true)
    const curta = entrarFormSchema.safeParse({ ...base, password: 'a'.repeat(9) })
    assert.equal(curta.success, false)
    if (!curta.success) assert.match(curta.error.issues[0].message, /pelo menos 10/)
  })

  it('o nome é OPCIONAL, porque o mesmo formulário serve entrar e cadastrar', () => {
    // Quem decide se o campo aparece é o modo; o schema aceita a ausência nos dois. A chave é
    // OMITIDA de verdade, e não passada como `undefined`: são coisas diferentes para o Zod, e o
    // formulário do modo "entrar" simplesmente não tem esse campo.
    const semNome = { email: base.email, password: base.password }
    assert.equal(entrarFormSchema.safeParse(semNome).success, true)
    assert.equal(entrarFormSchema.parse(semNome).name, undefined)
    assert.equal(entrarFormSchema.parse(base).name, '')
  })

  it('recusa e-mail que não é e-mail, com mensagem em português', () => {
    for (const email of ['', 'pessoa', 'pessoa@', '@exemplo.com', 'pessoa @exemplo.com']) {
      const r = entrarFormSchema.safeParse({ ...base, email })
      assert.equal(r.success, false, `"${email}" devia ser recusado`)
      if (!r.success) assert.match(r.error.issues[0].message, /e-mail válido/)
    }
    assert.equal(entrarFormSchema.safeParse({ ...base, email: 'pessoa+marca@exemplo.com.br' }).success, true)
  })
})
