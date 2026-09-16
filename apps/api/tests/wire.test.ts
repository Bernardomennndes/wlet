import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fromRegexWire, money, toMoney, toRegexWire } from '../src/shared/wire'

/**
 * A fronteira entre o que o banco guarda e o que o contrato declara.
 *
 * É o lugar mais estreito por onde passa todo valor do app, e o docblock do módulo registra o que
 * acontece quando ele erra: fev/26 teve entradas 12973.399999999999 contra saídas
 * 12973.400000000001 — iguais nos centavos —, e o mês foi pintado de VERMELHO por um `>` que
 * comparava float. O número na tela estava certo; a cor, não.
 *
 * As quatro funções são puras e não precisam de banco. O teste de router ao lado já prova que uma
 * `RegExp` sobrevive à ida e à volta pelo Postgres; este prova as conversões em si, inclusive os
 * casos que aquele caminho não produz.
 */
describe('dinheiro na fronteira', () => {
  it('o `numeric` do Postgres chega como STRING e vira número', () => {
    // O driver devolve string de propósito: um `double` não representa centavo exatamente.
    assert.equal(money('1234.56'), 1234.56)
    assert.equal(money('-0.01'), -0.01)
  })

  it('número já convertido atravessa igual — a conversão é idempotente', () => {
    // A mesma função serve os dois lados porque nem toda coluna é `numeric`; chamá-la duas vezes
    // não pode mudar o valor.
    assert.equal(money(1234.56), 1234.56)
    assert.equal(money(money('1234.56')), 1234.56)
  })

  it('ausência lê como ZERO, e é decisão de fronteira', () => {
    // `null` aqui é coluna vazia, não valor desconhecido: uma soma com `null` viraria `NaN` e
    // contaminaria todo total rio abaixo, sem erro nenhum.
    //
    // Este caso prende o CONTRATO e não a implementação, e descobri isso tentando falsificá-lo:
    // tirar o ramo `value === null ? 0` não muda nada, porque `Number(null)` já é 0 em JS. O ramo
    // explícito é documentação. O teste continua valendo pelo outro lado — ele quebra no dia em
    // que alguém trocar o zero por `NaN`, por `null` ou por um `throw`, que são as três respostas
    // alternativas plausíveis para "a coluna está vazia".
    assert.equal(money(null), 0)
  })

  it('a volta fixa DOIS decimais, e é o que impede a deriva de float de chegar ao banco', () => {
    // A deriva é PRODUZIDA por soma, e não escrita como literal, por duas razões: é assim que ela
    // nasce no app — somando lançamento a lançamento —, e um literal como `12973.399999999999`
    // acende o `noPrecisionLoss` do Biome, que é ERRO e derruba `pnpm lint` por causa de um teste.
    const somaDeOnze = Array.from({ length: 11 }, () => 1179.4).reduce((total, value) => total + value, 0)
    assert.notEqual(somaDeOnze, 11 * 1179.4, 'a soma derivou, que é a premissa deste caso')
    assert.equal(toMoney(somaDeOnze), '12973.40', 'e o `toFixed(2)` corta a cauda que pintou o mês de vermelho')
    assert.equal(toMoney(0.1 + 0.2), '0.30')
  })

  it('e a ida e a volta do dinheiro fecham nos centavos', () => {
    for (const value of [0, 0.01, -0.01, 1234.56, 12973.4, 1e6]) {
      assert.equal(money(toMoney(value)), Number(value.toFixed(2)), `${value}`)
    }
  })
})

describe('RegExp na fronteira', () => {
  it('a ida e a volta preservam o padrão E as flags', () => {
    // `JSON.stringify(/x/i)` devolve `{}` — é a razão de `config` nunca ter cabido em
    // `localStorage`, e de as regras viajarem como `{source, flags}`.
    const original = /SUPERMERCADO|MERCADO /i
    const volta = fromRegexWire(toRegexWire(original))
    assert.equal(volta.source, original.source)
    assert.equal(volta.flags, original.flags)
    assert.ok(volta.test('compra no Mercado da esquina'), 'e continua casando o que casava')
  })

  it('sem flag a volta também é sem flag', () => {
    const volta = fromRegexWire(toRegexWire(/ABC/))
    assert.equal(volta.flags, '')
    assert.equal(volta.test('abc'), false, 'sem `i`, a caixa volta a importar')
  })

  it('o escape sobrevive — é o que distingue um ponto de qualquer caractere', () => {
    const volta = fromRegexWire(toRegexWire(/R\$ \d+\.\d{2}/))
    assert.equal(volta.source, 'R\\$ \\d+\\.\\d{2}')
    assert.ok(volta.test('R$ 12.34'))
    assert.equal(volta.test('R$ 12X34'), false, 'o ponto escapado não casa qualquer caractere')
  })
})
