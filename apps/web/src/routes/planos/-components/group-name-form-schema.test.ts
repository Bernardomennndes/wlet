import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { groupNameFormSchema } from './group-name-form-schema'

describe('o nome de um grupo, editado na linha', () => {
  it('apara os espaços na saída', () => {
    assert.deepEqual(groupNameFormSchema.parse({ label: '  Viagem ao Chile  ' }), { label: 'Viagem ao Chile' })
  })

  it('recusa vazio e só espaços, com a frase que a tela mostra', () => {
    for (const label of ['', '   ']) {
      const result = groupNameFormSchema.safeParse({ label })
      assert.equal(result.success, false, JSON.stringify(label))
      if (!result.success) assert.match(result.error.issues[0].message, /Dê um nome ao grupo/)
    }
  })

  it('a saída tem só o nome — nada além do que a escrita recebe', () => {
    assert.deepEqual(Object.keys(groupNameFormSchema.parse({ label: 'Casa' })), ['label'])
  })
})
