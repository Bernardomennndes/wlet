import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { groupFormSchema } from './group-dialog-schema'

/**
 * A saída do grupo de planos, e sobretudo a regra da JANELA.
 *
 * Ela é opcional INTEIRA — um grupo sem janela é legítimo —, mas se o início existe o fim é
 * obrigatório, e o fim não pode ser antes do início. São três estados, dois deles recusados, e
 * nenhum deles aparece na assinatura do tipo: só um `parse` prova.
 */
const base = { label: 'Viagem ao Chile', from: null, to: null, note: '' }

describe('a saída do grupo de planos', () => {
  it('sem janela é válido, e a ausência sai como undefined', () => {
    const group = groupFormSchema.parse(base)
    assert.equal(group.from, undefined)
    assert.equal(group.to, undefined)
    assert.equal(group.note, undefined, 'observação em branco é ausência, não string vazia')
  })

  it('início SEM fim é recusado, e a mensagem pede os dois', () => {
    const r = groupFormSchema.safeParse({ ...base, from: '2026-03' })
    assert.equal(r.success, false)
    if (!r.success) {
      assert.deepEqual(r.error.issues[0].path, ['to'], 'o erro aponta o campo que falta')
      assert.match(r.error.issues[0].message, /os dois meses/)
    }
  })

  it('fim ANTES do início é recusado', () => {
    const r = groupFormSchema.safeParse({ ...base, from: '2026-06', to: '2026-03' })
    assert.equal(r.success, false)
    if (!r.success) assert.match(r.error.issues[0].message, /não pode ser antes do início/)
    // O mesmo mês nos dois é janela de um mês, e vale.
    assert.equal(groupFormSchema.safeParse({ ...base, from: '2026-06', to: '2026-06' }).success, true)
  })

  it('a janela completa atravessa', () => {
    const group = groupFormSchema.parse({ ...base, from: '2026-03', to: '2026-08' })
    assert.equal(group.from, '2026-03')
    assert.equal(group.to, '2026-08')
  })

  it('mês malformado é recusado mesmo com os dois preenchidos', () => {
    assert.equal(groupFormSchema.safeParse({ ...base, from: '2026-3', to: '2026-08' }).success, false)
  })

  it('o nome é aparado e não pode ser vazio; a observação é aparada e some se vazia', () => {
    assert.equal(groupFormSchema.parse({ ...base, label: '  Chile  ' }).label, 'Chile')
    assert.equal(groupFormSchema.safeParse({ ...base, label: '   ' }).success, false)
    assert.equal(groupFormSchema.parse({ ...base, note: '   ' }).note, undefined)
    assert.equal(groupFormSchema.parse({ ...base, note: '  levar câmera  ' }).note, 'levar câmera')
  })
})
