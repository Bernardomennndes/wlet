import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { describe, it } from 'node:test'
import { read, repoRoot, stripComments } from './support/source-fields'

/**
 * A mensagem de erro é TEXTO VOLTADO AO USUÁRIO que nenhum sensor de texto enxerga.
 *
 * `screen-text.test.ts` e o gate de idioma leem JSX. Estas frases não estão em JSX nenhum: moram
 * numa classe de `packages/services`, e chegam à tela pelo handler global, dentro de um toast. São
 * as únicas palavras que a pessoa lê quando algo dá errado — e são as mais fáceis de escrever em
 * inglês, porque quem as escreve está pensando no código e não em quem vai ler.
 *
 * O módulo base já diz por que elas existem: o `fetch` lança `TypeError: Failed to fetch` quando a
 * rede cai — uma frase que não diz nem que houve rede envolvida —, o oRPC lança `ORPCError` com o
 * status cru, e uma sessão expirada chega como 401 sem texto. Os três chegariam à tela em inglês
 * dizendo coisas que não descrevem o que fazer. Traduzir é o trabalho destas classes; deixar uma
 * delas sem mensagem devolve o problema para a tela.
 */
const SERVICES = 'packages/services/src'

function errorFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(`${repoRoot}${dir}`, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const relative = `${prefix}${entry.name}`
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`, `${relative}/`)
      else if (entry.name.endsWith('.ts') && read(relative).includes('extends DomainError')) out.push(relative)
    }
  }
  walk(`${SERVICES}/`, `${SERVICES}/`)
  return out
}

/** Cada subclasse, com o corpo do seu construtor. */
function subclasses(): { name: string; file: string; ctor: string }[] {
  const out: { name: string; file: string; ctor: string }[] = []
  for (const file of errorFiles()) {
    const source = stripComments(read(file))
    for (const match of source.matchAll(/export class (\w+Error) extends DomainError \{([\s\S]*?)\n\}/g)) {
      out.push({ name: match[1], file, ctor: match[2] })
    }
  }
  return out
}

/**
 * Palavras que o português escreve COM acento e que aparecem sem ele quando quem digita está com
 * pressa. A lista não precisa ser exaustiva — precisa NÃO TER FALSO POSITIVO, e eu errei isso DUAS
 * vezes antes de acertar: pus "instantes" e "categoria", que não levam acento nenhum, e o sensor
 * acusou duas mensagens perfeitas. O erro tem a mesma forma das duas vezes — copiar uma lista de
 * "palavras que costumam vir sem acento" sem conferir palavra por palavra se ELA leva acento.
 *
 * Cada entrada aqui é uma palavra cuja forma correta TEM diacrítico: `não`, `sessão`, `período`,
 * `inválido`, `conexão`, `você`, `possível`, `irreconhecível`, `código`, `número`, `usuário`,
 * `serviço`, `informação`, `alteração`, `ação`, `permissão`, `será`, `já`, `também`.
 */
const SEM_ACENTO = /\b(nao|sessao|configuracao|periodo|invalido|invalida|conexao|voce|possivel|irreconhecivel|codigo|numero|usuario|servico|informacao|alteracao|acao|permissao|sera|ja|tambem)\b/i

describe('todo erro de domínio fala com a pessoa', () => {
  const classes = subclasses()

  it('as classes estão sendo encontradas', () => {
    assert.ok(classes.length >= 12, `só ${classes.length} subclasses de DomainError lidas`)
  })

  it('nenhuma deixa a mensagem por conta de quem chama', () => {
    // Ou um padrão literal (`message = '…'`), ou uma mensagem MONTADA no construtor a partir dos
    // argumentos. O que não pode é `constructor(message: string)` cru: quem lança esquece o texto,
    // e o toast chega vazio — pior que um erro em inglês, porque não diz nada.
    const speechless = classes.filter(({ ctor }) => !/message = '/.test(ctor) && !/super\(`/.test(ctor))
    assert.deepEqual(
      speechless.map((c) => `${c.file}: ${c.name}`),
      [],
      'erro de domínio sem mensagem própria',
    )
  })

  it('e toda mensagem é uma FRASE em português', () => {
    // Maiúscula no começo e ponto no fim: elas aparecem sozinhas num toast, não dentro de outra
    // frase. Sem o ponto, duas mensagens seguidas no console viram uma só.
    const wrong: string[] = []
    for (const { name, file, ctor } of classes) {
      for (const match of ctor.matchAll(/message = '([^']+)'|super\(`([^`]+)`\)/g)) {
        const text = (match[1] ?? match[2]).replace(/\$\{[^}]*\}/g, 'x')
        if (!/^[A-ZÀ-Ú]/.test(text)) wrong.push(`${file}: ${name} — não começa com maiúscula: "${text}"`)
        if (!text.trim().endsWith('.')) wrong.push(`${file}: ${name} — não termina em ponto: "${text}"`)
        if (SEM_ACENTO.test(text)) wrong.push(`${file}: ${name} — palavra sem acento: "${text}"`)
      }
    }
    assert.deepEqual(wrong, [])
  })

  it('e nenhuma escapou para o inglês', () => {
    // A primeira versão procurava PALAVRAS em inglês — "not found", "invalid", "failed" — e uma
    // frase inteiramente inglesa passou por ela: "Purchase already linked to another plan." não
    // contém nenhuma das palavras da lista. Procurar o defeito por enumeração só acha o que já se
    // imaginou.
    //
    // A prova aqui é POSITIVA: toda frase em português carrega um diacrítico ou uma palavra
    // funcional que o inglês não tem. As quinze mensagens de hoje passam todas; a inglesa não
    // passa por nenhum dos dois caminhos.
    const PORTUGUES = /[áàâãéêíóôõúüç]|\b(não|que|para|com|uma|um|está|estão|são|dos|das|os|as|ao|à|no|na|em|de|se)\b/i
    const wrong: string[] = []
    for (const { name, file, ctor } of classes) {
      for (const match of ctor.matchAll(/message = '([^']+)'|super\(`([^`]+)`\)/g)) {
        const text = (match[1] ?? match[2]).replace(/\$\{[^}]*\}/g, 'x')
        if (!PORTUGUES.test(text)) wrong.push(`${file}: ${name} — "${text}"`)
      }
    }
    assert.deepEqual(wrong, [], 'mensagem de erro que não parece português')
  })
})
