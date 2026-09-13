import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PACKAGE_PARTS } from '@wlet/services/backup'
import { importFormSchema } from './import-dialog-schema'

/**
 * A escolha de partes da importação.
 *
 * Duas coisas que só um teste prende: que escolher NADA é recusado com uma frase (era um botão
 * desabilitado, que não dizia por quê), e que os valores aceitos são exatamente os do serviço de
 * cópia — uma parte nova no pacote não pode virar uma caixinha que ninguém lembrou de somar.
 */
describe('a escolha de partes da importação', () => {
  it('escolher NADA é recusado, e a frase diz o que fazer', () => {
    const r = importFormSchema.safeParse({ parts: [] })
    assert.equal(r.success, false)
    if (!r.success) assert.match(r.error.issues[0].message, /ao menos uma parte/)
  })

  it('aceita exatamente as partes que o serviço de cópia declara', () => {
    // Não uma lista redigitada: se `PACKAGE_PARTS` ganhar uma parte, este teste passa a exercitá-la
    // sozinho, e o schema que não a aceitasse quebraria aqui.
    assert.equal(importFormSchema.safeParse({ parts: [...PACKAGE_PARTS] }).success, true)
    for (const part of PACKAGE_PARTS) assert.equal(importFormSchema.safeParse({ parts: [part] }).success, true, part)
  })

  it('recusa parte que não existe no pacote', () => {
    assert.equal(importFormSchema.safeParse({ parts: ['inventada'] }).success, false)
    assert.equal(importFormSchema.safeParse({ parts: ['dataset', 'inventada'] }).success, false)
  })
})
