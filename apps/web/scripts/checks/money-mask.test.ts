import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { maskMoney, parseMoney } from '@wlet/ui/money-mask'

/**
 * A máscara é o par de funções em que um erro NÃO quebra nada — ele só grava o valor errado.
 * Um deslocamento de uma casa transforma R$ 3.000,00 em R$ 300,00, a tela desenha o número
 * torto com a mesma naturalidade, e a previsão inteira sai de lugar sem nenhum aviso.
 */

describe('parseMoney: só os dígitos contam, e os dois últimos são centavos', () => {
  it('sobe da direita para a esquerda conforme se digita', () => {
    const digitado = ['3', '30', '300', '3000', '30000', '300000']
    const esperado = [0.03, 0.3, 3, 30, 300, 3000]
    assert.deepEqual(digitado.map(parseMoney), esperado)
  })

  it('ignora a pontuação, então relê o que ela mesma escreveu', () => {
    // É o caso REAL do campo controlado: o valor exibido volta como entrada a cada tecla.
    assert.equal(parseMoney('3.000,00'), 3000)
    assert.equal(parseMoney('1.234,56'), 1234.56)
    assert.equal(parseMoney(maskMoney(1234.56)), 1234.56)
  })

  it('campo vazio é zero, e texto sem dígito também', () => {
    for (const texto of ['', 'R$', 'abc', ',', '.']) assert.equal(parseMoney(texto), 0, JSON.stringify(texto))
  })

  it('apagar desce pelo mesmo caminho por onde subiu', () => {
    assert.equal(parseMoney('3.000,0'), 300)
    assert.equal(parseMoney('300,0'), 30)
    assert.equal(parseMoney('0,0'), 0)
  })

  it('não aceita sinal: o campo é de preço, e preço negativo não se digita', () => {
    assert.equal(parseMoney('-5000'), 50)
  })

  it('corta em 15 dígitos, para a soma não sair da faixa segura do Number', () => {
    const valor = parseMoney('9'.repeat(20))
    assert.equal(valor, 9999999999999.99)
    assert.ok(valor * 100 < Number.MAX_SAFE_INTEGER)
  })
})

describe('maskMoney: o que aparece no campo', () => {
  it('escreve com milhar e duas casas, e SEM o R$ — o símbolo é adorno do InputGroup', () => {
    assert.equal(maskMoney(3000), '3.000,00')
    assert.equal(maskMoney(1234.5), '1.234,50')
    assert.equal(maskMoney(0.03), '0,03')
    assert.ok(!maskMoney(3000).includes('R$'))
  })

  it('zero é campo VAZIO, não "0,00"', () => {
    assert.equal(maskMoney(0), '')
    // E o que não é número também não vira texto: NaN chega de um campo em branco.
    assert.equal(maskMoney(Number.NaN), '')
  })

  it('ida e volta preserva o valor em toda a faixa que o campo aceita', () => {
    for (const valor of [0.01, 0.99, 1, 99.99, 3000, 1234.56, 987654.32]) {
      assert.equal(parseMoney(maskMoney(valor)), valor, String(valor))
    }
  })
})
