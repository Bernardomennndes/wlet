import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BASE_RULES, buildRules, categorize, cleanDescription, deriveMerchant, normalizeForRules, PRIORITY_RULES, type Rule } from '@wlet/ingest/rules'

/**
 * O motor de categorização — o que decide a categoria de TODO lançamento.
 *
 * Nada dele tinha teste, e é dele que sai o número de cada rubrica, cada fatia do gráfico de
 * categorias e cada linha da tela de Categorias. Um erro aqui não estoura: o dinheiro vai para a
 * rubrica errada, e as duas ficam plausíveis.
 *
 * `categorize` morava privada no `pipeline.ts`, onde não havia como exercitá-la. É pura, e passou
 * para `rules.ts`, ao lado das listas que percorre.
 */
const of = (pattern: RegExp, category: string, over: Partial<Rule> = {}): Rule => ({ id: category, test: pattern, category, ...over })

describe('a ORDEM das camadas de regra', () => {
  it('prioritária ganha da sua, e a sua ganha da genérica', () => {
    // É a razão de `buildRules` existir: a camada pessoal entra no MEIO. Inverter faria uma regra
    // sua sobrescrever "pagamento de fatura", e a fatura do cartão viraria gasto de categoria.
    const mine = [of(/MERCADO/, 'minha-categoria')]
    const ids = buildRules(mine).map((rule) => rule.id)
    assert.ok(ids.indexOf('pagamento-fatura') < ids.indexOf('minha-categoria'), 'a prioritária vem antes da sua')
    assert.ok(ids.indexOf('minha-categoria') < ids.indexOf(BASE_RULES[0].id), 'a sua vem antes da genérica')
  })

  it('sem regras suas, a lista continua válida — é o que um clone novo tem', () => {
    assert.deepEqual(buildRules(), [...PRIORITY_RULES, ...BASE_RULES])
  })

  it('a farmácia entregue pelo app continua SAÚDE, e o clube não é refeição', () => {
    // As duas regras vêm antes do iFood de propósito, e o comentário no módulo diz isso. Nada
    // prendia a ordem: reordenar a lista mandaria o remédio para "restaurantes" em silêncio, e a
    // rubrica de saúde perderia exatamente o que a de restaurantes ganharia.
    const rules = buildRules()
    assert.equal(categorize(rules, 'IFD*DROGARIA SAO PAULO', -80).categoryId, 'saude')
    assert.equal(categorize(rules, 'IFOOD CLUB', -10).categoryId, 'assinaturas')
    assert.equal(categorize(rules, 'IFD*RESTAURANTE DO ZE', -60).categoryId, 'restaurantes')
  })
})

describe('categorize', () => {
  it('a PRIMEIRA que casar vence', () => {
    const rules = [of(/MERCADO/, 'primeira'), of(/MERCADO/, 'segunda')]
    assert.equal(categorize(rules, 'MERCADO DIA', -50).rule, 'primeira')
  })

  it('o `sign` FILTRA e a busca continua — nos DOIS ramos', () => {
    // Uma regra descartada pelo sinal não pode interromper a busca: a próxima ainda tem de poder
    // pegar o lançamento. Sem isso, "JUROS" devolveria o padrão em vez da categoria certa.
    //
    // Os dois ramos precisam de caso próprio, e a primeira versão deste teste só tinha um: com as
    // duas regras na ordem `out` e depois `in`, trocar o `continue` do ramo `in` por `break` não
    // mudava nada, porque aquela linha nunca era a que descartava. A ordem INVERSA é o que
    // exercita a outra.
    const outFirst = [of(/JUROS/, 'juros-multas', { id: 'saida', sign: 'out' }), of(/JUROS/, 'rendimentos', { id: 'entrada', sign: 'in' })]
    assert.equal(categorize(outFirst, 'JUROS DE ATRASO', -30).rule, 'saida', 'a primeira serve')
    assert.equal(categorize(outFirst, 'JUROS CREDITADOS', 30).rule, 'entrada', 'a primeira foi descartada pelo ramo `out`, e a busca seguiu')

    const inFirst = [of(/JUROS/, 'rendimentos', { id: 'entrada', sign: 'in' }), of(/JUROS/, 'juros-multas', { id: 'saida', sign: 'out' })]
    assert.equal(categorize(inFirst, 'JUROS DE ATRASO', -30).rule, 'saida', 'a primeira foi descartada pelo ramo `in`, e a busca seguiu')
  })

  it('entrada sem regra é REEMBOLSO, saída sem regra é OUTROS', () => {
    // Decisão de modelo, e a assimetria é o ponto: neste app o reembolso ABATE uma despesa em vez
    // de contar como receita. Tratar entrada desconhecida como receita inflaria o que entrou toda
    // vez que alguém devolvesse um rateio.
    assert.deepEqual(categorize([], 'QUALQUER COISA', 500), { categoryId: 'reembolso', rule: null, merchant: null })
    assert.deepEqual(categorize([], 'QUALQUER COISA', -500), { categoryId: 'outros', rule: null, merchant: null })
  })

  it('a regra pode REESCREVER o estabelecimento, e quem não reescreve devolve null', () => {
    const rules = [of(/DROGARIA/, 'saude', { merchant: 'Farmácia' }), of(/PADARIA/, 'mercado')]
    assert.equal(categorize(rules, 'DROGARIA SP', -80).merchant, 'Farmácia')
    assert.equal(categorize(rules, 'PADARIA DO ZE', -12).merchant, null)
  })

  it('o texto testado é o NORMALIZADO: a regra nunca vê acento nem minúscula', () => {
    const rules = buildRules()
    assert.equal(categorize(rules, normalizeForRules('Receita Federal — DARF'), -300).categoryId, 'impostos')
  })
})

describe('normalizeForRules', () => {
  it('tira acento, sobe a caixa e colapsa espaço', () => {
    assert.equal(normalizeForRules('  Mercado   São  João '), 'MERCADO SAO JOAO')
  })

  it('desfaz a entidade HTML que os extratos trazem', () => {
    // `&AMP;` sobrevive à normalização porque ela é feita DEPOIS do upper: escrever `&amp;` aqui
    // não pegaria nada.
    assert.equal(normalizeForRules('Casa &amp; Video'), 'CASA & VIDEO')
  })
})

describe('cleanDescription', () => {
  it('apaga CPF mascarado e CNPJ, que não dizem nada a quem lê', () => {
    assert.equal(cleanDescription('Pix enviado para Fulano - •••.123.456-••'), 'Pix enviado para Fulano')
    assert.equal(cleanDescription('Pagamento para Loja - 12.345.678/0001-99'), 'Pagamento para Loja')
  })

  it('tira o código do Inter antes do nome do titular', () => {
    assert.equal(cleanDescription('Pix enviado: "Cp :00012345-Fulano de Tal"'), 'Pix enviado: Fulano de Tal')
  })

  it('desfaz as entidades e colapsa o espaço, sem subir a caixa', () => {
    // Esta é para EXIBIÇÃO, ao contrário da normalização: o nome continua legível como no banco.
    assert.equal(cleanDescription('Casa &amp;  Video'), 'Casa & Video')
  })
})

describe('deriveMerchant', () => {
  it('extrai a contraparte das formas de Pix e TED', () => {
    assert.equal(deriveMerchant('Pix enviado para Fulano de Tal'), 'Fulano de Tal')
    assert.equal(deriveMerchant('Pix recebido de Sicrana'), 'Sicrana')
    assert.equal(deriveMerchant('TED recebida de Beltrano'), 'Beltrano')
    assert.equal(deriveMerchant('Pagamento para Loja X'), 'Loja X')
  })

  it('o que não é transferência atravessa inteiro', () => {
    assert.equal(deriveMerchant('Supermercado Dia'), 'Supermercado Dia')
  })
})
