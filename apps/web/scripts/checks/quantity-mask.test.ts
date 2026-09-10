import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatQuantity, parseQuantity } from '@wlet/ui/quantity-mask'

describe('máscara de quantidade', () => {
  it('lê inteiro pelo que ele é, e não como centavo', () => {
    // A diferença para `money-mask`: lá "2" é 0,02; aqui é dois potes.
    assert.equal(parseQuantity('2'), 2)
  })

  it('aceita VÍRGULA, que é o que se digita em português', () => {
    assert.equal(parseQuantity('0,5'), 0.5)
    assert.equal(parseQuantity('1,25'), 1.25)
  })

  it('aceita PONTO, que é o que o teclado numérico do celular manda', () => {
    assert.equal(parseQuantity('0.5'), 0.5)
  })

  it('ignora o que não é dígito nem separador', () => {
    assert.equal(parseQuantity('2 kg'), 2)
    assert.equal(parseQuantity('abc'), 0)
    assert.equal(parseQuantity(''), 0)
  })

  it('o ÚLTIMO separador é o decimal', () => {
    // Sem separador de milhar não há ambiguidade a resolver: o que vem antes é inteiro.
    assert.equal(parseQuantity('1,5'), 1.5)
    assert.equal(parseQuantity('10,25'), 10.25)
  })

  it('corta na terceira casa em vez de arredondar em silêncio', () => {
    assert.equal(parseQuantity('0,1234'), 0.123)
  })

  it('escreve com vírgula e SEM separador de milhar', () => {
    // Com milhar, "1.000" seria ambíguo entre mil e um — e a leitura acima o trataria como um.
    assert.equal(formatQuantity(0.5), '0,5')
    assert.equal(formatQuantity(2), '2')
    assert.equal(formatQuantity(1000), '1000')
  })

  it('zero sai VAZIO, porque é o valor que a validação recusa', () => {
    assert.equal(formatQuantity(0), '')
  })

  it('ida e volta preserva o número', () => {
    for (const n of [0.5, 1, 2.25, 12, 0.125]) assert.equal(parseQuantity(formatQuantity(n)), n, `falhou em ${n}`)
  })
})
