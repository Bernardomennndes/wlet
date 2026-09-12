import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

/**
 * A TABELA DE ARESTAS: qual escrita invalida quais domínios.
 *
 * Uma aresta esquecida não produz erro de compilação nem teste vermelho em lugar nenhum — produz
 * TELA VELHA, que é o defeito mais difícil de atribuir a um commit: a pessoa grava, a outra tela
 * continua mostrando o número antigo, e ninguém liga uma coisa à outra. A §5.3 da regra de
 * requisição de dados pede este sensor, e ele é uma tabela porque a informação que falta não está
 * no código: é a intenção de quem escreveu.
 *
 * A comparação é POR DOMÍNIO, não pela chave literal: o que importa é a aresta, e a serialização
 * da chave é assunto do `@orpc/tanstack-query`.
 */
const ARESTAS = [
  {
    tela: 'configuracao/-content.tsx',
    // Teto, cobranças, metas, perfis de conta e regras — cinco seções, cinco escritas, cinco
    // frases. A regra proíbe uma fábrica que receba a mensagem por parâmetro.
    escritas: 5,
    invalida: ['config'],
  },
  {
    // Adicionar, editar e remover rubrica. Três, e não uma, porque o aviso nomeia a categoria.
    tela: 'rubricas/-content.tsx',
    escritas: 3,
    invalida: ['config'],
  },
  {
    // Excluir um previsto, e gravar um (criar ou editar, que compartilham o formulário).
    tela: 'previsao/-content.tsx',
    escritas: 2,
    invalida: ['config'],
  },
] as const

const raiz = new URL('../../src/routes/', import.meta.url)

/** Sem comentários: eles CITAM as formas proibidas para explicá-las, e contá-los acusaria a prosa. */
function codigoDe(caminho: string): string {
  return readFileSync(new URL(caminho, raiz), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
}

const contar = (fonte: string, padrao: RegExp) => (fonte.match(padrao) ?? []).length

describe('tabela de invalidação', () => {
  for (const { tela, escritas, invalida } of ARESTAS) {
    it(`${tela}: ${escritas} escritas, invalidando ${invalida.join(', ')}`, () => {
      const fonte = codigoDe(tela)
      assert.equal(contar(fonte, /useMutation\(/g), escritas, 'o número de escritas mudou — atualize a tabela e confira as arestas de cada uma')
      // Uma frase por escrita, no mínimo: a §5 exige toast de sucesso em TODA mutation, TODA vez.
      assert.ok(contar(fonte, /toast\.success\(/g) >= escritas, `${contar(fonte, /toast\.success\(/g)} avisos de sucesso para ${escritas} escritas`)
      for (const dominio of invalida) {
        assert.match(fonte, new RegExp(`invalidateQueries\\(|api\\(\\)\\.${dominio}\\.key\\(\\)`), `nenhuma invalidação de ${dominio}`)
        assert.match(fonte, new RegExp(`api\\(\\)\\.${dominio}\\.key\\(\\)`), `a chave de ${dominio} não vem do contrato`)
      }
    })
  }
})

/**
 * O erro é UM, no provider — e a única prova disso é não haver `onError` no ponto de uso.
 *
 * A exceção da regra é estreita: uma tela que mostre o erro num diálogo próprio passa `onError`
 * PARA SUPRIMIR o toast global. Nenhuma faz isso hoje, então a contagem esperada é zero — e o dia
 * em que alguém precisar da exceção, este teste obriga a declará-la aqui em vez de abrir o
 * precedente em silêncio.
 */
describe('nenhum tratamento de erro no ponto de uso', () => {
  const telas: string[] = []
  const varrer = (dir: URL, prefixo: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) varrer(new URL(`${e.name}/`, dir), `${prefixo}${e.name}/`)
      else if (e.name.endsWith('.tsx')) telas.push(`${prefixo}${e.name}`)
    }
  }
  varrer(raiz, '')

  it('nenhuma rota passa onError a um useMutation', () => {
    const ofensoras = telas.filter((t) => /onError/.test(codigoDe(t)))
    assert.deepEqual(ofensoras, [], 'a §5 proíbe tratar erro de escrita no ponto de uso; a exceção é a tela com erro próprio, e ela precisa ser declarada neste teste')
  })

  it('e as rotas conferidas são muitas — o varredor não parou de olhar', () => {
    assert.ok(telas.length > 30, `só ${telas.length} telas varridas`)
  })
})

/**
 * Nenhum hook de ESCRITA reutilizado sobreviveu.
 *
 * `use-declarations.ts` era exatamente isso: duas — depois três — telas gravavam por ele, com
 * pending, erro e sucesso embrulhados, e o preço era uma mensagem genérica para tudo. A §5 o
 * proíbe nominalmente. `src/hooks/` continua existindo para o que não grava.
 */
describe('src/hooks/ não grava', () => {
  it('nenhum hook compartilhado chama replace/save/set de um serviço', () => {
    const dir = new URL('../../src/hooks/', import.meta.url)
    const ofensores = readdirSync(dir).filter((nome) => /services\(\)[\s\S]{0,80}\.(replace|save|set|remove)\(/.test(readFileSync(new URL(nome, dir), 'utf8')))
    assert.deepEqual(ofensores, [], 'hook de escrita reutilizado: a frase do aviso tem de ser do ponto de uso')
  })
})
