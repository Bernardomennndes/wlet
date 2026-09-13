import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ServerUnreachableError, SessionExpiredError } from '@wlet/services/shared/domain/errors'
import { storedCountLabel } from '../../src/routes/dados/-stored-count-label'

describe('o campo "Arquivos guardados"', () => {
  it('conta enquanto a leitura não voltou', () => {
    assert.deepEqual(storedCountLabel(undefined, null), { kind: 'loading', text: 'Contando…' })
  })

  it('diz "nenhum" no zero, e não some', () => {
    // Zero é uma resposta, não ausência: é a conta que nunca leu extrato nenhum.
    assert.deepEqual(storedCountLabel(0, null), { kind: 'value', text: 'nenhum' })
  })

  it('mostra o número', () => {
    assert.deepEqual(storedCountLabel(12, null), { kind: 'value', text: '12' })
  })

  it('o ERRO vence o carregando — os dois têm `stored` undefined, e só um é verdade', () => {
    // Este é o invariante. `retry` desiste depois de duas tentativas e `stored` fica `undefined`
    // para sempre: sem esta precedência a tela diz "Contando…" indefinidamente, prometendo um
    // número que não vem. Inverter a ordem dos ramos devolve exatamente aquele defeito.
    const field = storedCountLabel(undefined, new ServerUnreachableError())
    assert.equal(field.kind, 'error')
    assert.match(field.text, /servidor/i)
  })

  it('e a mensagem DISTINGUE as falhas, porque elas pedem coisas diferentes', () => {
    // Um texto fixo ("falha ao contar") apagaria a diferença entre "entre de novo" e "tente
    // outra vez" — é a mesma tradução que o handler global das escritas usa.
    const unreachable = storedCountLabel(undefined, new ServerUnreachableError())
    const expired = storedCountLabel(undefined, new SessionExpiredError())
    assert.notEqual(unreachable.text, expired.text)
    assert.match(expired.text, /sess(ã|a)o/i)
  })

  it('erro com número JÁ carregado ainda avisa: o número na tela pode estar velho', () => {
    // Refetch que falha mantém o `data` anterior. Mostrar o número calado faria a tela afirmar
    // uma contagem que o servidor não confirmou nesta leitura.
    assert.equal(storedCountLabel(12, new ServerUnreachableError()).kind, 'error')
  })
})
