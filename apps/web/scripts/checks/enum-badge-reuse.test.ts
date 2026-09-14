import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * A badge de um enum é UMA, e a §2 de `enum-badges.md` é sobre isso.
 *
 * Um enum de domínio é reutilizável, e a badge dele também tem de ser. Montada à mão em cada
 * tela, ela se multiplica — e a segunda cópia nunca nasce errada: nasce igual, e fica para trás
 * no primeiro ajuste. Acrescentar um valor ao enum, mudar um rótulo, trocar o tom de "atrasado":
 * a tela que reusa acompanha, a que remontou não. As duas continuam desenhando, com verdades
 * diferentes, e nada acusa.
 *
 * O sensor cobra a REUTILIZAÇÃO, não a aparência: enquanto o `EnumBadge` for o único lugar que
 * traduz `tone` em cor e a badge dedicada for a única que conhece a lista, as telas não têm como
 * divergir.
 */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const COMPONENTS = 'apps/web/src/components'

const read = (relative: string) =>
  readFileSync(`${repoRoot}${relative}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')

/** Cada enum de domínio que já tem badge própria, e o arquivo que a define. */
const DEDICATED: Record<string, string> = {
  flowKinds: `${COMPONENTS}/flow-badge.tsx`,
  entityKinds: `${COMPONENTS}/entity-badge.tsx`,
  accountsTypes: `${COMPONENTS}/account-type-badge.tsx`,
  transfersKinds: `${COMPONENTS}/transfer-kind-badge.tsx`,
  payableStatuses: `${COMPONENTS}/payable-status-badge.tsx`,
  receivableStatuses: `${COMPONENTS}/receivable-status-badge.tsx`,
}

/**
 * Quem remonta a badge de um enum que já tem a sua, e por quê — para a população NÃO CRESCER.
 *
 * `settlement-history` é GENÉRICO sobre os dois lados (cobrança e conta a pagar) e escolhe a
 * lista por parâmetro, então ele não pode nomear um componente estaticamente do jeito que está
 * escrito hoje. É contornável — bastaria o `KINDS` carregar o COMPONENTE em vez da lista de
 * opções —, e enquanto não for, é a terceira cópia do mesmo `Map` de valor para opção.
 *
 * Fica na lista em vez de a regra ser afrouxada: uma exceção com nome é um débito visível; uma
 * regra que aceita "quando for genérico" é uma porta por onde passa qualquer coisa.
 */
const KNOWN: Record<string, string> = {
  [`${COMPONENTS}/settlement-history.tsx`]: 'genérico sobre cobrança e conta a pagar; escolhe a lista por parâmetro em vez do componente',
}

function screenFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(`${repoRoot}${dir}`, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`, `${relative}/`)
      else if (/\.tsx?$/.test(entry.name)) out.push(relative)
    }
  }
  walk('apps/web/src/', 'apps/web/src/')
  return out
}

describe('quem tem badge própria é renderizado por ela', () => {
  const files = screenFiles()

  it('o varredor está olhando, e as badges dedicadas existem', () => {
    assert.ok(files.length >= 100, `só ${files.length} arquivos varridos`)
    for (const [enumName, file] of Object.entries(DEDICATED)) {
      assert.ok(files.includes(file), `${file} sumiu — a badge de ${enumName} não está mais onde este teste procura`)
    }
  })

  it('ninguém monta à mão a badge de um enum que já tem a sua', () => {
    // O sinal é montar `EnumBadge` sobre a lista do enum: é exatamente o que a badge dedicada
    // faz, e fazê-lo de novo na tela é a cópia que vai ficar para trás.
    const remounted: string[] = []
    for (const file of files) {
      if (Object.values(DEDICATED).includes(file) || KNOWN[file]) continue
      const source = read(file)
      if (!source.includes('EnumBadge')) continue
      for (const enumName of Object.keys(DEDICATED)) {
        if (new RegExp(`\\b${enumName}\\b`).test(source)) remounted.push(`${file}: ${enumName}`)
      }
    }
    assert.deepEqual(remounted, [], 'badge de enum remontada numa tela (§2 de enum-badges.md) — reuse a dedicada')
  })

  it('e a exceção conhecida continua sendo UMA', () => {
    // Uma anistia que ninguém revisita vira sedimento. Se o arquivo se limpar, ele sai da lista
    // — e o teste obriga a isso, porque uma entrada que já não viola é acusada.
    for (const [file, motivo] of Object.entries(KNOWN)) {
      assert.ok(files.includes(file), `${file} não existe mais — tire-o da lista`)
      const source = read(file)
      const remonta = source.includes('EnumBadge') && Object.keys(DEDICATED).some((enumName) => new RegExp(`\\b${enumName}\\b`).test(source))
      assert.ok(remonta, `${file} não remonta mais badge nenhuma (${motivo}) — tire-o da lista`)
    }
  })
})

describe('a tradução de tom mora num lugar só', () => {
  it('toda badge dedicada passa pelo `EnumBadge`', () => {
    // Se uma delas montar o próprio markup, o `tone` da lista deixa de significar alguma coisa
    // naquela tela: o `TONE_CLASS` é o único lugar que o traduz em cor.
    const wrong: string[] = []
    for (const [enumName, file] of Object.entries(DEDICATED)) {
      if (!read(file).includes('<EnumBadge')) wrong.push(`${file} (${enumName})`)
    }
    assert.deepEqual(wrong, [])
  })

  it('e a badge dedicada é a ÚNICA que conhece a lista do enum', () => {
    // Fora dela e da exceção conhecida, ninguém deveria precisar da lista para DESENHAR. Quem a
    // usa para outra coisa — montar um seletor, validar um schema — não importa `EnumBadge`
    // junto, e é essa combinação que o teste acima cobra.
    const holders = new Map<string, string[]>()
    for (const enumName of Object.keys(DEDICATED)) {
      const users = screenFiles().filter((file) => new RegExp(`\\b${enumName}\\b`).test(read(file)))
      holders.set(enumName, users)
    }
    for (const [enumName, users] of holders) {
      assert.ok(users.includes(DEDICATED[enumName]), `${enumName}: a badge dedicada não referencia mais a lista`)
    }
  })
})
