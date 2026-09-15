import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CATEGORIES, CATEGORY_MAP, categoriesGroups, categoryLabel } from '@wlet/domain'
import { read, stripComments } from './support/source-fields'

/**
 * O catálogo de categorias, e as TRINTA referências a ele espalhadas por aí.
 *
 * `CATEGORY_MAP` é um `Record` montado por `id`, e id de categoria é STRING: trinta lugares do
 * código citam um deles como literal — o motor de categorização, o pipeline, `finance.ts`,
 * `chart-tokens.ts` e algumas telas. Renomear uma categoria não quebra compilação em nenhum
 * deles; o gasto simplesmente passa a cair num id que não existe, `categoryLabel` devolve o
 * PRÓPRIO ID como rótulo, e a tela mostra "juros-multas" onde deveria ler "Juros, multas e IOF".
 *
 * O jeito mais consequente de prender isso é pelo MOTOR: cada regra de categorização declara a
 * categoria para onde manda o gasto, e uma que não exista manda dinheiro para o limbo.
 */
const RULES = 'packages/ingest/src/rules.ts'
const FINANCE = 'apps/web/src/lib/finance.ts'
const TOKENS = 'apps/web/src/lib/chart-tokens.ts'

describe('o catálogo é coerente consigo mesmo', () => {
  it('nenhum id repetido', () => {
    // `Object.fromEntries` mantém o ÚLTIMO de um id repetido, e o primeiro vira inalcançável: os
    // lançamentos dele passam a exibir o rótulo do outro, sem erro nenhum.
    const ids = CATEGORIES.map((category) => category.id)
    assert.equal(new Set(ids).size, ids.length)
    assert.ok(ids.length >= 25, `só ${ids.length} categorias — o catálogo encolheu`)
  })

  it('cada GRUPO tem uma espécie só', () => {
    // O empilhado desenha por grupo e o sinal vem da espécie. Um grupo com receita e despesa
    // dentro somaria os dois lados na mesma faixa, e a barra mostraria a diferença como se fosse
    // gasto.
    const porGrupo = new Map<string, Set<string>>()
    for (const category of CATEGORIES) {
      porGrupo.set(category.group, (porGrupo.get(category.group) ?? new Set()).add(category.kind))
    }
    for (const [group, kinds] of porGrupo) assert.equal(kinds.size, 1, `${group} mistura ${[...kinds].join(' e ')}`)
  })

  it('todo grupo declarado tem categoria, e toda categoria tem grupo declarado', () => {
    // Grupo sem categoria desenha uma seção vazia; categoria em grupo não declarado não tem
    // rótulo de seção, e a tela mostra o identificador cru.
    const declarados = new Set(categoriesGroups.map((option) => option.value))
    const usados = new Set(CATEGORIES.map((category) => category.group))
    assert.deepEqual(
      [...usados].filter((group) => !declarados.has(group as never)),
      [],
    )
    assert.deepEqual(
      [...declarados].filter((group) => !usados.has(group)),
      [],
    )
  })

  it('`outros` existe, é despesa, e é o destino do que não casa regra', () => {
    // `chart-tokens` o exclui do ranking de cores pelo id, e o pipeline manda para ele o que não
    // casou nada. Se ele sumir do catálogo, o gasto não classificado fica sem rótulo.
    assert.equal(CATEGORY_MAP.outros?.kind, 'expense')
  })

  it('e o rótulo de um id desconhecido é o PRÓPRIO id', () => {
    // Não é elegante, e é a escolha certa: devolver vazio esconderia o problema numa célula em
    // branco, e é justamente assim que uma categoria renomeada se denuncia na tela.
    assert.equal(categoryLabel('categoria-que-nao-existe'), 'categoria-que-nao-existe')
    assert.equal(categoryLabel('moradia'), 'Moradia')
  })
})

describe('quem cita uma categoria por STRING continua acertando', () => {
  const literals = (file: string, pattern: RegExp) => [...stripComments(read(file)).matchAll(pattern)].map((match) => match[1])

  it('toda regra de categorização manda para uma categoria que existe', () => {
    // O motor tem dezenas de regras, cada uma com o destino escrito à mão. Um destino inexistente
    // não estoura: o gasto cai num id sem rótulo, some dos agrupamentos por grupo, e o total do
    // mês continua certo — o erro aparece só como uma fatia sem nome.
    const destinos = literals(RULES, /category: '([a-z0-9-]+)'/g)
    assert.ok(destinos.length >= 40, `só ${destinos.length} regras lidas`)
    assert.deepEqual(
      [...new Set(destinos)].filter((id) => !CATEGORY_MAP[id]),
      [],
    )
  })

  it('as retiradas que `finance.ts` batiza existem no catálogo', () => {
    // `retirada-pj` e `retirada-pf` são a tradução da transferência entre PF e PJ, e só existem
    // dentro de um recorte. Renomear qualquer uma delas faz a retirada aparecer sem rótulo
    // exatamente na visão em que ela é o movimento principal.
    const names = literals(FINANCE, /return '(retirada-[a-z]+)'/g)
    assert.deepEqual(names.sort(), ['retirada-pf', 'retirada-pj'])
    for (const id of names) assert.ok(CATEGORY_MAP[id], `${id} não está no catálogo`)
  })

  it('e o id que o ranking de cores exclui continua existindo', () => {
    // `chart-tokens` tira `outros` do ranking pelo ID. Renomeado, ele volta a concorrer por um
    // dos oito slots e rouba a cor de uma categoria de verdade — que foi um defeito real aqui.
    const excluido = literals(TOKENS, /id === '([a-z0-9-]+)'/g)
    assert.deepEqual(excluido, ['outros'])
    assert.ok(CATEGORY_MAP[excluido[0]])
  })
})
