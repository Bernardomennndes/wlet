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

/**
 * O CAMPO ENQUANTO SE DIGITA — os estados intermediários, que são a metade que faltava.
 *
 * Os testes acima medem textos PRONTOS: "0,5", "1.234", "2,5678". Mas a máscara roda a cada tecla,
 * e entre uma tecla e a seguinte o campo passa por textos que não são número nenhum. Quem digita
 * "0,5" passa por "0" e por "0,"; quem apaga tudo passa por "".
 *
 * O que não pode acontecer nesses estados é a máscara ESTOURAR ou devolver `NaN`. `NaN` é o pior:
 * ele não quebra o campo, propaga-se para o total da rubrica, e o valor planejado da tela vira
 * "NaN" sem dizer qual item o causou — o mesmo modo de falha que o parser do CSV da XP evita.
 */
describe('máscara de quantidade: o que se digita no meio do caminho', () => {
  it('campo VAZIO é zero, e não `NaN`', () => {
    // O estado depois de apagar tudo. Zero é o que a validação recusa, então ele volta pelo caminho
    // certo — pedindo o valor — em vez de virar um número impossível.
    assert.equal(parseQuantity(''), 0)
  })

  it('texto sem dígito nenhum também é zero', () => {
    // Colar "R$" ou "kg" no campo. A limpeza tira tudo e sobra string vazia.
    assert.equal(parseQuantity('abc'), 0)
    assert.equal(parseQuantity('R$'), 0)
  })

  it('separador SEM casa decimal depois vale o inteiro', () => {
    // O estado exato de quem acabou de teclar a vírgula. Sem a guarda, `Number("2.")` até funciona,
    // mas a fração vazia entraria como string vazia na concatenação e o resultado dependeria de
    // como o motor lê `"2."` — a guarda torna a leitura explícita.
    assert.equal(parseQuantity('2,'), 2)
    assert.equal(parseQuantity('2.'), 2)
  })

  it('e separador SEM inteiro antes vale só a fração', () => {
    // Quem digita ",5" em vez de "0,5" — comum em campo de quantidade, e o "0" implícito é o que
    // torna a leitura possível.
    assert.equal(parseQuantity(',5'), 0.5)
    assert.equal(parseQuantity('.5'), 0.5)
  })

  it('zeros à esquerda não mudam o número', () => {
    assert.equal(parseQuantity('00012'), 12)
  })

  it('e nenhuma entrada produz `NaN`, que é o que não pode vazar para a soma', () => {
    // A propriedade que fecha todas as anteriores: seja qual for o texto, o que sai é número. Um
    // `NaN` aqui não quebra o campo — ele soma com o resto da rubrica e o planejado da tela vira
    // "NaN", sem dizer qual item o causou.
    //
    // **Este teste é o único que segura as três guardas de `parseQuantity`, e a falsificação
    // mostrou por quê.** Tirar uma por vez não quebra nada: sem o `if (cleaned === '')`, o
    // `Number('') || 0` abaixo devolve zero igual; sem o `|| '0'` do inteiro, `Number('.5')` já é
    // 0,5; sem o `fraction || '0'`, `Number('2.')` já é 2. Cada uma é redundante com as outras, e
    // uma revisão que apague qualquer uma passa por toda a bateria.
    //
    // Tirando as TRÊS, `parseQuantity(',')` devolve `NaN` — medido. E uma vírgula sozinha não é
    // entrada exótica: é exatamente o que está no campo depois da primeira tecla de quem vai
    // digitar ",5". É por isso que a lista abaixo tem `','` e `'.'`, e é por isso que esta forma
    // de teste — uma propriedade sobre muitas entradas — vale o lugar que ocupa.
    for (const text of ['', ' ', 'abc', 'R$', ',', '.', ',,', '2,,5', '1.2.3', '9'.repeat(30)]) {
      const value = parseQuantity(text)
      assert.equal(Number.isNaN(value), false, `"${text}" produziu NaN`)
      assert.equal(typeof value, 'number')
    }
  })

  it('e o que a escrita recusa volta como campo vazio, nunca como "NaN"', () => {
    // O espelho, do lado de sair: `formatQuantity` recebe o que o domínio guardou, e um valor
    // impossível ali precisa sumir da tela em vez de ser impresso.
    assert.equal(formatQuantity(Number.NaN), '')
    assert.equal(formatQuantity(Number.POSITIVE_INFINITY), '')
    assert.equal(formatQuantity(0), '')
  })
})
