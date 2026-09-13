import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

/**
 * TEXTO DE TELA é português — e nenhum identificador vaza para dentro dele.
 *
 * Este sensor nasceu de um defeito meu, e vale contar porque a forma dele se repete: uma renomeação
 * de identificadores em massa (`plano` → `created`, `grupo` → `createdGroup`, `importar` →
 * `importPackage`) atravessou o TEXTO de JSX, porque o renomeador sabia pular comentário e string mas
 * não sabia que o conteúdo entre `>` e `<` também não é código.
 *
 * O resultado ficou quatro commits na tela: os botões de Planos diziam **"Novo created"** e **"Novo
 * createdGroup"**, o cartão de Meus dados dizia **"Exportar e importPackage"**, e dois diálogos
 * perguntavam **"Remover este created?"**. Oito frases. O `tsc` não vê texto, o lint não vê texto, e
 * a §7 da `component-construction.md` — que exige pt-BR correto — não tinha sensor nenhum.
 *
 * **O sinal usado é camelCase**, e ele é preciso por uma razão de idioma: português de interface não
 * tem palavra com maiúscula no meio. `createdGroup`, `importPackage` e `declaredConfig` são
 * inequívocos; e a lista curada ao lado pega os de uma palavra só (`created`, `saved`, `declared`),
 * que o camelCase não alcança.
 */
const dirs = [new URL('../../src/', import.meta.url), new URL('../../../../packages/ui/src/', import.meta.url)]

/**
 * O TEXTO de JSX de um arquivo: o que está entre `>` e `<`, sem chaves.
 *
 * As chaves marcam expressão, que É código. Dois descartes cuidam do resto, e os dois foram
 * necessários na prática:
 *
 * - **sinal de código** (`=`, `(`, `;`, `??`): uma linha de código quebrada em duas casa com o padrão,
 *   e sem isso o sensor acusava `readUrl().scope ?? saved.scope`.
 * - **anotação de tipo** (identificador seguido de `:`, com `?` opcional): os `<` e `>` de um genérico
 *   parecem tag, então `expenseCats: ReturnType<…>` casava. O `:` vem DEPOIS do identificador de
 *   propósito — "Remover este created?" tem interrogação e precisa sobreviver, que é justamente uma
 *   das oito frases que este sensor existe para pegar.
 */
function screenText(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '')
  // O `>` não pode vir de uma seta (`=>`) e o `<` tem de ABRIR uma tag: sem as duas guardas,
  // `retry: (failures, error) => failures < 2` vira "texto de tela" com a palavra `failures` dentro.
  return [...code.matchAll(/(?<!=)>([^<>{}]*[A-Za-zÀ-ú][^<>{}]*)<(?=[/A-Za-z])/g)]
    .map((m) => m[1])
    .filter((t) => !/[=();]|\?\?/.test(t))
    .filter((t) => !/[A-Za-z_$]\s*\??\s*:/.test(t))
}

function tsxFiles(dir: URL, prefix = ''): [string, string][] {
  const out: [string, string][] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...tsxFiles(new URL(`${e.name}/`, dir), `${prefix}${e.name}/`))
    else if (e.name.endsWith('.tsx')) out.push([`${prefix}${e.name}`, readFileSync(new URL(e.name, dir), 'utf8')])
  }
  return out
}

/**
 * Palavras inglesas de UMA sílaba visual, que o camelCase não pega.
 *
 * A lista é a do vocabulário de identificadores deste projeto — os verbos da tabela da §1 da
 * `language-conventions.md` e os particípios que a renomeação usou. Ela cresce quando um identificador
 * novo entrar no vocabulário, não quando alguém escrever inglês na tela por outro motivo.
 */
const IDENTIFICADORES = ['created', 'saved', 'declared', 'deleted', 'updated', 'pending', 'failures', 'reading', 'ingesting', 'importing', 'reprocess', 'apply']

describe('texto de tela', () => {
  const files = dirs.flatMap((d) => tsxFiles(d))

  it('o varredor acha os arquivos', () => {
    assert.ok(files.length > 60, `só ${files.length} arquivos`)
  })

  it('nenhum token camelCase — português de interface não tem maiúscula no meio da palavra', () => {
    const offenders: string[] = []
    for (const [name, source] of files) {
      for (const text of screenText(source)) {
        // `[a-zà-ú]+[A-Z]` é a assinatura: minúscula seguida de maiúscula dentro da MESMA palavra.
        const m = /\b[a-zà-ú]{2,}[A-Z][A-Za-z]*\b/.exec(text)
        if (m) offenders.push(`${name}: "${text.trim().slice(0, 60)}" (${m[0]})`)
      }
    }
    assert.deepEqual(offenders, [], 'identificador vazou para o texto de tela — foi assim que "Novo createdGroup" ficou quatro commits no ar')
  })

  it('nem identificador de uma palavra só', () => {
    const pattern = new RegExp(`\\b(${IDENTIFICADORES.join('|')})\\b`)
    const offenders: string[] = []
    for (const [name, source] of files) {
      for (const text of screenText(source)) {
        const m = pattern.exec(text)
        if (m) offenders.push(`${name}: "${text.trim().slice(0, 60)}" (${m[1]})`)
      }
    }
    assert.deepEqual(offenders, [], 'palavra do vocabulário de identificadores no texto de tela')
  })
})
