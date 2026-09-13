import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { literalBytes, parseCMap } from '@wlet/ingest/pdf'

/**
 * As duas peças PURAS do leitor de PDF — o último módulo de `ingest` sem teste.
 *
 * O leitor existe por um motivo estreito: o Nubank não publica OFX nem CSV para faturas anteriores
 * a 2024, e três anos de histórico só existem em PDF. Ele reconstrói linha por POSIÇÃO, o que
 * exigiria um PDF sintético para exercitar inteiro — mas as duas funções abaixo são onde o texto
 * vira legível ou vira lixo, e nenhuma delas precisa de arquivo.
 *
 * O modo de falha é o pior possível: um caractere trocado no meio do nome do estabelecimento não
 * estoura nada. A descrição sai embaralhada, não casa regra de categoria nenhuma, e o gasto cai em
 * `outros` — com o VALOR certo e a categoria errada, que é o tipo de número que ninguém confere.
 */
describe('parseCMap', () => {
  it('traduz glifo em caractere pelos pares de `bfchar`', () => {
    const map = parseCMap('beginbfchar <0041> <0061> <0042> <0062> endbfchar')
    assert.equal(map.get(0x41), 'a')
    assert.equal(map.get(0x42), 'b')
  })

  it('um destino de 8 dígitos vira DOIS caracteres', () => {
    // O destino é UTF-16BE, lido de quatro em quatro. Ler oito de uma vez daria um caractere só
    // e comeria o segundo — que num par substituto é metade de um emoji ou de um acento raro.
    const map = parseCMap('beginbfchar <0001> <00410042> endbfchar')
    assert.equal(map.get(1), 'AB')
  })

  it('`bfrange` mapeia a FAIXA inteira, deslocando o destino junto', () => {
    // É a forma compacta: três códigos seguidos viram três caracteres seguidos. Tratá-la como
    // um par só deixaria todo o resto da faixa sem tradução — e o texto sairia com buracos.
    const map = parseCMap('beginbfrange <0010> <0012> <0041> endbfrange')
    assert.equal(map.get(0x10), 'A')
    assert.equal(map.get(0x11), 'B')
    assert.equal(map.get(0x12), 'C')
    assert.equal(map.get(0x13), undefined, 'a faixa termina onde foi declarada')
  })

  it('as duas formas convivem no mesmo CMap', () => {
    const map = parseCMap('beginbfchar <0001> <0058> endbfchar beginbfrange <0010> <0011> <0041> endbfrange')
    assert.equal(map.get(1), 'X')
    assert.equal(map.get(0x10), 'A')
  })

  it('faixa absurda não trava o leitor', () => {
    // Um `to` gigante vindo de um arquivo corrompido não pode virar um laço de bilhões de
    // iterações: a fatura inteira deixaria de abrir por causa de uma fonte estragada.
    //
    // A falsificação deste caso é diferente das outras e vale dizer: subindo a trava para 20
    // milhões, o teste não fica vermelho — ele TRAVA, e o runner precisa ser morto por timeout.
    // É exatamente o defeito que a trava evita, demonstrado ao vivo.
    const map = parseCMap('beginbfrange <0000> <FFFFFF> <0041> endbfrange')
    assert.ok(map.size <= 65_535)
  })

  it('CMap vazio devolve mapa vazio, e não estoura', () => {
    assert.equal(parseCMap('').size, 0)
  })
})

describe('literalBytes', () => {
  it('o escape OCTAL tem de 1 a 3 dígitos, e para no primeiro não-octal', () => {
    // `\101` é 'A'. Ler quatro dígitos comeria o caractere seguinte; ler um só devolveria 1 e
    // deixaria "01" como texto. As duas formas embaralham o nome sem erro nenhum.
    assert.deepEqual(literalBytes('\\101'), [65])
    assert.deepEqual(literalBytes('\\1012'), [65, 0x32], 'o quarto dígito é texto, não parte do escape')
    assert.deepEqual(literalBytes('\\78'), [7, 0x38], '8 não é octal: o escape termina antes dele')
  })

  it('os escapes nomeados viram os bytes de controle', () => {
    assert.deepEqual(literalBytes('\\n\\r\\t\\b\\f'), [10, 13, 9, 8, 12])
  })

  it('escape desconhecido devolve o PRÓPRIO caractere — é como se escapa parêntese', () => {
    // `\(`, `\)` e `\\` são a razão de o escape existir numa string de PDF: sem esta regra, um
    // nome com parêntese encerraria a string no meio.
    assert.deepEqual(literalBytes('\\(\\)\\\\'), [0x28, 0x29, 0x5c])
  })

  it('texto sem escape atravessa byte a byte', () => {
    assert.deepEqual(literalBytes('AB'), [0x41, 0x42])
  })
})
