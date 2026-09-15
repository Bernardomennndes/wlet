import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { purchaseLinkSchema } from './purchase-link-dialog-schema'

describe('a escolha da compra no diálogo', () => {
  it('a saída é o purchaseId escolhido, e só ele', () => {
    assert.deepEqual(purchaseLinkSchema.parse({ purchaseId: 'db78e48a1935' }), { purchaseId: 'db78e48a1935' })
  })

  it('sem escolha, a mensagem que a tela mostra', () => {
    const result = purchaseLinkSchema.safeParse({ purchaseId: '' })
    assert.equal(result.success, false)
    if (!result.success) assert.match(result.error.issues[0].message, /Escolha uma compra/)
  })
})
