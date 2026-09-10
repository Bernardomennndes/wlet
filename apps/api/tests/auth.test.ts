import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { eq, sessions } from '@wlet/db'
import { resolveSession } from '../src/shared/auth'
import { db, limpar, novoUsuario } from './support'

const d = db()
const criados: string[] = []
after(async () => {
  for (const id of criados) await limpar(d, id)
  await d.close()
})

describe('sessão', () => {
  it('um token válido resolve no dono dele', async () => {
    const u = await novoUsuario(d)
    criados.push(u.userId)
    assert.equal(await resolveSession(d, `Bearer ${u.token}`), u.userId)
  })

  it('sem cabeçalho, sem identidade', async () => {
    assert.equal(await resolveSession(d, undefined), null)
  })

  it('token que não existe NÃO vira identidade', async () => {
    // O caso que o `x-user-id` deixava passar: inventar um valor e ser atendido.
    assert.equal(await resolveSession(d, 'Bearer inventado'), null)
  })

  it('esquema errado é recusado, não interpretado', async () => {
    const u = await novoUsuario(d)
    criados.push(u.userId)
    // Sem o `Bearer `, o valor é ignorado inteiro — e não tratado como token cru, que seria
    // aceitar um formato que ninguém documentou.
    assert.equal(await resolveSession(d, u.token), null)
  })

  it('sessão EXPIRADA não vale, mesmo com o token certo', async () => {
    // O prazo é conferido no banco, não em memória: uma sessão vencida não pode depender de o
    // servidor ter reiniciado ou não.
    const u = await novoUsuario(d)
    criados.push(u.userId)
    await d
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.token, u.token))
    assert.equal(await resolveSession(d, `Bearer ${u.token}`), null)
  })

  it('dois usuários têm tokens diferentes', async () => {
    const a = await novoUsuario(d)
    const b = await novoUsuario(d)
    criados.push(a.userId, b.userId)
    assert.notEqual(a.token, b.token)
    assert.notEqual(a.userId, b.userId)
  })
})
