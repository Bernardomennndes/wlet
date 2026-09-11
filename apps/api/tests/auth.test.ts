import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { eq, sessions } from '@wlet/db'
import { resolveSession } from '../src/shared/auth'
import { auth, db, limpar, novoUsuario } from './support'

const d = db()
const a = auth(d)
const criados: string[] = []
after(async () => {
  for (const id of criados) await limpar(d, id)
  await d.close()
})

const comBearer = (token: string) => new Headers({ authorization: `Bearer ${token}` })

describe('sessão', () => {
  it('um token válido resolve no dono dele', async () => {
    const u = await novoUsuario(d)
    criados.push(u.userId)
    assert.equal(await resolveSession(a, comBearer(u.token)), u.userId)
  })

  it('sem cabeçalho, sem identidade', async () => {
    assert.equal(await resolveSession(a, new Headers()), null)
  })

  it('token que não existe NÃO vira identidade', async () => {
    // O caso que o `x-user-id` deixava passar: inventar um valor e ser atendido.
    assert.equal(await resolveSession(a, comBearer('inventado')), null)
  })

  it('esquema errado é recusado, não interpretado', async () => {
    const u = await novoUsuario(d)
    criados.push(u.userId)
    // Sem o `Bearer `, o valor é ignorado inteiro — e não tratado como token cru, que seria
    // aceitar um formato que ninguém documentou.
    assert.equal(await resolveSession(a, new Headers({ authorization: u.token })), null)
  })

  it('sessão EXPIRADA não vale, mesmo com o token certo', async () => {
    // O prazo é conferido no banco: uma sessão vencida não pode depender de o servidor ter
    // reiniciado ou não.
    const u = await novoUsuario(d)
    criados.push(u.userId)
    await d
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.token, u.token))
    assert.equal(await resolveSession(a, comBearer(u.token)), null)
  })

  it('senha errada não entra', async () => {
    const u = await novoUsuario(d)
    criados.push(u.userId)
    await assert.rejects(() => a.api.signInEmail({ body: { email: u.email, password: 'outra-senha-longa' } }))
  })

  it('a senha é GUARDADA COMO HASH, nunca em claro', async () => {
    // Vale afirmar num teste: é a diferença entre um vazamento de banco ser grave e ser fatal.
    const u = await novoUsuario(d)
    criados.push(u.userId)
    const linhas = await d.query.authAccounts.findMany({ where: (t, { eq: e }) => e(t.userId, u.userId) })
    const senha = linhas[0]?.password ?? ''
    assert.ok(senha.length > 0, 'a credencial existe')
    assert.ok(!senha.includes('senha-de-teste-longa'), 'e não contém a senha digitada')
  })

  it('dois usuários têm tokens e ids diferentes', async () => {
    const x = await novoUsuario(d)
    const y = await novoUsuario(d)
    criados.push(x.userId, y.userId)
    assert.notEqual(x.token, y.token)
    assert.notEqual(x.userId, y.userId)
  })
})
