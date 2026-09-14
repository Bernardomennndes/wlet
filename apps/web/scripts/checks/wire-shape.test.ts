import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * Um campo que o DOMÍNIO tem e o CONTRATO não é dado que some no fio, em silêncio.
 *
 * O `shape.ts` do contrato afirma que a junção é a do compilador: `os.router` é
 * `implement(wletContract)`, então um campo que mude ali quebra o handler antes de qualquer
 * requisição. Isso vale numa direção só, e é a direção MENOS provável — mexer no contrato.
 *
 * Na outra, nada acontece. Um campo acrescentado ao `Transaction` do domínio e esquecido aqui não
 * quebra compilação nenhuma: a checagem de propriedade excedente do TypeScript só vale para
 * literal, o handler devolve objeto montado, e o Zod **descarta chave desconhecida na saída sem
 * dizer nada**. O lançamento atravessa sem o campo, a tela lê `undefined`, e a origem disso está
 * a três camadas de distância.
 *
 * É o modo de falha que este projeto já conhece de outro ângulo — foi um `as never` que segurou o
 * `amountBetween` divergindo entre contrato e domínio. Aqui a divergência nem precisa de cast.
 */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))

const read = (relative: string) => readFileSync(`${repoRoot}${relative}`, 'utf8')

const TYPES = 'packages/domain/src/types.ts'
const PIPELINE = 'packages/ingest/src/pipeline.ts'
const DATASET_SHAPE = 'packages/api/src/domains/dataset/shape.ts'
const CONFIG_SHAPE = 'packages/api/src/domains/config/shape.ts'
const PLANS_SHAPE = 'packages/api/src/domains/plans/shape.ts'

/** Sem comentário: um bloco de documentação que cite um nome de campo seria lido como campo. */
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/** O corpo de uma declaração, do primeiro `{` até a chave que o fecha. */
function body(source: string, start: number): string {
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i)
  }
  throw new Error('chave não fechada')
}

/**
 * Só as chaves do PRIMEIRO nível: o que está aninhado é forma de um campo, não campo.
 *
 * A separação é por VÍRGULA de profundidade zero e não por linha, e a diferença apareceu no
 * `goal`, que o contrato escreve numa linha só. Um leitor por linha devolvia zero campos ali —
 * e zero campos comparado com zero campos fecha, que é o jeito mais silencioso de um sensor
 * deixar de olhar.
 */
function topLevelKeys(block: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of block) {
    if (ch === '{' || ch === '(' || ch === '[') depth++
    else if (ch === '}' || ch === ')' || ch === ']') depth--
    // Vírgula E quebra de linha separam: o Zod escreve `a: x, b: y` (às vezes numa linha só) e a
    // interface do TypeScript escreve um campo por linha, sem vírgula. Um separador só cobre um
    // dos dois — e foi assim que a primeira versão deste leitor devolveu zero campo para as três
    // interfaces do domínio depois de eu consertá-lo para o `goal` do contrato.
    if ((ch === ',' || ch === '\n') && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current)

  const keys: string[] = []
  for (const part of parts) {
    // A forma ABREVIADA conta como campo: `entity` no Zod é o mesmo que `entity: entity`.
    const match = part.trim().match(/^([A-Za-z_][\w$]*)\s*\??\s*(:|$)/)
    if (match) keys.push(match[1])
  }
  return keys.sort()
}

const domainFields = (name: string, file = TYPES) => {
  const source = stripComments(read(file))
  const at = source.indexOf(`export interface ${name} {`)
  assert.notEqual(at, -1, `${name} sumiu do domínio`)
  return topLevelKeys(body(source, at))
}

const wireFields = (name: string, file = DATASET_SHAPE) => {
  const source = stripComments(read(file))
  // Sem o `export`: `matchRule` e `dueOn` são internos ao módulo do contrato e viajam dentro dos
  // outros. Não serem exportados não os torna menos parte do fio.
  const at = source.search(new RegExp(`(?:export )?const ${name} = z\\.object\\(`))
  assert.notEqual(at, -1, `${name} sumiu do contrato`)
  return topLevelKeys(body(source, at))
}

/** Os três que viajam inteiros, do domínio para o fio. */
const MIRRORED: [domain: string, wire: string][] = [
  ['Transaction', 'transaction'],
  ['Account', 'account'],
  ['Transfer', 'transfer'],
  ['DatasetMeta', 'datasetMeta'],
  ['InvestmentHolding', 'investmentHolding'],
  ['InvestmentSnapshot', 'investmentSnapshot'],
  ['PatrimonyPoint', 'patrimonyPoint'],
  ['IncomeMonth', 'incomeMonth'],
]

describe('o contrato espelha o domínio, campo a campo', () => {
  it('o leitor está achando os dois lados', () => {
    // Uma extração que devolve lista vazia faria as comparações abaixo passarem por vacuidade —
    // e é o modo de falha mais provável de um teste que lê fonte.
    //
    // O piso é por TIPO e por SOMA, e os dois números têm razão de ser. Por tipo ele é baixo
    // porque tipo pequeno existe: `DatasetMeta` tem quatro campos, e um piso de cinco reprovava
    // o leitor funcionando. A soma é o que pega o leitor quebrando para todos de uma vez.
    let total = 0
    for (const [domain, wire] of MIRRORED) {
      assert.ok(domainFields(domain).length >= 2, `${domain}: só ${domainFields(domain).length} campos lidos`)
      assert.ok(wireFields(wire).length >= 2, `${wire}: só ${wireFields(wire).length} campos lidos`)
      total += domainFields(domain).length + wireFields(wire).length
    }
    assert.ok(total >= 80, `só ${total} campos lidos no total`)
  })

  for (const [domain, wire] of MIRRORED) {
    it(`\`${domain}\` e \`${wire}\` têm os MESMOS campos`, () => {
      // Comparação nos dois sentidos de propósito. Campo só no domínio some no fio; campo só no
      // contrato é pior — o handler precisa preenchê-lo e não tem de onde, e a validação de saída
      // recusa a resposta inteira, que é o incidente do orçamento `{}` outra vez.
      assert.deepEqual(wireFields(wire), domainFields(domain))
    })
  }
})

/**
 * A configuração: a superfície onde a divergência JÁ ACONTECEU.
 *
 * `amountBetween` era `z.tuple([number, number])` no contrato e `{ min?, max? }` no domínio, e a
 * configuração real usa `{ min: 200 }` — sem máximo, porque um rateio varia mês a mês. Uma tupla
 * não representa isso. O defeito ficou invisível por um `as never` no adapter do cliente; tirado o
 * cast, ele apareceu no typecheck. Este espelho é o que dispensa o typecheck de ser a única
 * chance — ele acusa mesmo que um cast novo volte a esconder.
 */
const CONFIG_MIRRORED: [domain: string, wire: string, file?: string][] = [
  ['PlannedEntry', 'plannedEntry'],
  ['Receivable', 'receivable'],
  ['BudgetItem', 'budgetItem'],
  ['Budget', 'budget'],
  ['Goal', 'goal'],
  ['MatchRule', 'matchRule'],
  ['AccountProfile', 'accountProfile', PIPELINE],
]

describe('a configuração declarada também espelha o domínio', () => {
  it('o leitor está achando os dois lados', () => {
    for (const [domain, wire, file] of CONFIG_MIRRORED) {
      assert.ok(domainFields(domain, file ?? TYPES).length >= 3, `${domain}: só ${domainFields(domain, file ?? TYPES).length} campos lidos`)
      assert.ok(wireFields(wire, CONFIG_SHAPE).length >= 3, `${wire}: só ${wireFields(wire, CONFIG_SHAPE).length} campos lidos`)
    }
  })

  for (const [domain, wire, file] of CONFIG_MIRRORED) {
    it(`\`${domain}\` e \`${wire}\` têm os MESMOS campos`, () => {
      assert.deepEqual(wireFields(wire, CONFIG_SHAPE), domainFields(domain, file ?? TYPES))
    })
  }

  it('e a RUBRICA, que viaja INLINE, não perdeu campo', () => {
    // `BudgetCategory` não tem forma nomeada no contrato: ela é escrita dentro do `byCategory`.
    // Por isso fica fora do espelho acima e ganha esta checagem própria — sem ela, o único campo
    // do domínio que não é conferido seria justamente o que a composição de uma rubrica usa.
    const source = stripComments(read(CONFIG_SHAPE))
    const at = source.indexOf('byCategory:')
    assert.notEqual(at, -1, 'o `byCategory` mudou de nome')
    const inline = topLevelKeys(body(source, source.indexOf('z.object(', at)))
    assert.deepEqual(inline, domainFields('BudgetCategory'))
  })
})

describe('o dataset do fio carrega as cinco partes', () => {
  it('nenhuma parte do conjunto ficou de fora do contrato', () => {
    // `dataset` é o envelope: se uma parte sumir dele, o `GET /dataset` devolve um conjunto
    // incompleto e o serviço o recusa — a tela abre pela semente sem explicar por quê.
    assert.deepEqual(wireFields('dataset'), ['accounts', 'investments', 'meta', 'transactions', 'transfers'])
  })
})

/**
 * Os PLANOS — e aqui o espelho encontrou uma divergência de verdade, que segue aberta.
 *
 * Um grupo de planos declara janela (`from`, `to`) e observação (`note`) no domínio, o formulário
 * COLETA os três — `group-dialog.tsx` tem os dois seletores de mês e um `<Textarea>` — e o schema
 * os valida e apara. Eles não chegam ao banco: o contrato descreve `{ id, label }`, a tabela
 * `plan_groups` tem duas colunas, e o handler insere duas.
 *
 * Medido, não deduzido: enviado `{id, label, from: '2026-03', to: '2026-04', note: 'levar câmera'}`
 * pelo `addGroup`, a leitura seguinte devolve `{id, label}`. Ninguém erra, nada estoura, e a
 * pessoa vê "Grupo criado" — a janela e a observação que ela escreveu simplesmente não existem
 * mais. O `Plan` perde `note` pelo mesmo caminho, e esse ainda não tem campo na tela.
 *
 * O conserto atravessa migração, contrato e handler, e não é meu para fazer sem alinhamento. O
 * que cabe aqui é não deixar a divergência voltar a ser invisível: ela fica DECLARADA campo a
 * campo, e o teste falha tanto se um quarto campo começar a sumir quanto se estes três voltarem a
 * atravessar — porque aí esta lista é que está errada.
 */
const PLANS_MIRRORED: [domain: string, wire: string][] = [
  ['Plan', 'plan'],
  ['PlanGroup', 'planGroup'],
]

/** Campo do domínio que NÃO atravessa, por tipo. Lista fechada: é débito, não licença. */
const DOES_NOT_CROSS: Record<string, string[]> = {
  PlanGroup: ['from', 'note', 'to'],
  Plan: ['note'],
}

describe('os planos: o espelho com a divergência DECLARADA', () => {
  it('o leitor está achando os dois lados', () => {
    for (const [domain, wire] of PLANS_MIRRORED) {
      assert.ok(domainFields(domain).length >= 2, `${domain}: só ${domainFields(domain).length} campos lidos`)
      assert.ok(wireFields(wire, PLANS_SHAPE).length >= 2, `${wire}: só ${wireFields(wire, PLANS_SHAPE).length} campos lidos`)
    }
  })

  for (const [domain, wire] of PLANS_MIRRORED) {
    it(`\`${domain}\` e \`${wire}\`: só os campos conhecidos deixam de atravessar`, () => {
      const onlyDomain = domainFields(domain).filter((field) => !wireFields(wire, PLANS_SHAPE).includes(field))
      assert.deepEqual(onlyDomain, DOES_NOT_CROSS[domain], 'mudou o conjunto de campos que some no fio')
    })

    it(`e \`${wire}\` não inventa campo que o domínio não tem`, () => {
      // Esta direção não tem anistia: campo só no contrato é resposta que o handler não consegue
      // montar, e a validação de saída recusa o `GET` inteiro.
      const onlyWire = wireFields(wire, PLANS_SHAPE).filter((field) => !domainFields(domain).includes(field))
      assert.deepEqual(onlyWire, [])
    })
  }
})

const PREFERENCES_SHAPE = 'packages/api/src/domains/preferences/shape.ts'
const PREFERENCES_PORT = 'packages/services/src/preferences/domain/ports/preferences-repository.ts'

describe('as preferências também espelham', () => {
  it('`Preferences` e `preferencesShape` têm os MESMOS campos', () => {
    // O tipo mora na PORTA do contexto e não no vocabulário, e ainda assim é o que atravessa —
    // um campo a mais de um lado é uma preferência que a pessoa escolhe e o servidor não guarda.
    assert.deepEqual(wireFields('preferencesShape', PREFERENCES_SHAPE), domainFields('Preferences', PREFERENCES_PORT))
  })
})

/**
 * Nenhuma forma do contrato fica FORA do espelho sem ser declarada.
 *
 * É a guarda que faz este arquivo continuar valendo: sem ela, uma forma nova entra no contrato,
 * ninguém a espelha, e o teste segue verde porque nunca ouviu falar dela. O mesmo buraco por onde
 * a divergência dos planos passou — ela existia desde que os planos foram para o servidor, e só
 * apareceu quando o espelho chegou naquele domínio.
 */
const NOT_MIRRORED: Record<string, string> = {
  investments: 'envelope: junta as três partes da carteira, não espelha tipo nenhum',
  dataset: 'envelope do conjunto — tem teste próprio, logo acima',
  declarations: 'envelope da configuração: junta as sete listas',
  plansData: 'envelope dos planos: grupos mais itens',
  ingestReport: 'relatório do pipeline — a forma nasce no contrato, não no domínio',
  sourceFileUpload: 'transporte de arquivo: caminho mais base64, não é dado de domínio',
  storedSource: 'metadado de arquivo guardado, montado pelo servidor',
  matchRule: 'espelhado na tabela da configuração',
  rule: 'regra de categoria: a forma do domínio vive em `@wlet/ingest`, com `RegExp` em vez de fio',
  regexWire: 'a travessia de `RegExp` — existe justamente porque o domínio NÃO tem essa forma',
}

describe('o espelho cobre tudo o que atravessa', () => {
  const SHAPE_FILES = [DATASET_SHAPE, CONFIG_SHAPE, PLANS_SHAPE, PREFERENCES_SHAPE, 'packages/api/src/shared/shape.ts']

  it('toda forma do contrato está espelhada ou DECLARADA como envelope', () => {
    const mirrored = new Set([...MIRRORED, ...CONFIG_MIRRORED, ...PLANS_MIRRORED].map(([, wire]) => wire).concat('preferencesShape'))
    const orphans: string[] = []
    let seen = 0
    for (const file of SHAPE_FILES) {
      for (const match of stripComments(read(file)).matchAll(/(?:export )?const ([A-Za-z]+) = z\.object\(/g)) {
        seen++
        const name = match[1]
        if (!mirrored.has(name) && !NOT_MIRRORED[name]) orphans.push(`${file}: ${name}`)
      }
    }
    assert.ok(seen >= 20, `só ${seen} formas lidas — a varredura das formas quebrou`)
    assert.deepEqual(orphans, [], 'forma do contrato sem espelho e sem justificativa')
  })

  it('e nenhuma justificativa sobrevive à forma que ela justifica', () => {
    // Anistia que ninguém revisita vira sedimento — a mesma regra da allowlist do sensor de
    // badge e da do sensor de idioma.
    const declared = new Set<string>()
    for (const file of SHAPE_FILES) {
      for (const match of stripComments(read(file)).matchAll(/(?:export )?const ([A-Za-z]+) = z\.object\(/g)) declared.add(match[1])
    }
    assert.deepEqual(
      Object.keys(NOT_MIRRORED).filter((name) => !declared.has(name)),
      [],
      'justificativa apontando para forma que não existe mais',
    )
  })
})
