import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

/**
 * `useEffect` é o ÚLTIMO hook antes do `return` — a §4 da `component-construction.md`.
 *
 * A ordem não é estética. Um efeito no meio do componente lê como se participasse do cálculo que vem
 * depois dele, e é justamente aí que nasce o defeito que a §2 proíbe: alguém acrescenta um `setState`
 * ali para "preparar" o `useMemo` de baixo, e o estado derivado por efeito volta pela porta dos
 * fundos. Com o efeito no fim, essa leitura não se oferece.
 *
 * Nada mais pega isso: o `tsc` não tem opinião sobre ordem, e o `react-hooks` do lint cuida das
 * dependências, não da posição. `transacoes/-content.tsx` tinha o efeito antes de três `useMemo`.
 */
const dirs = [
  { url: new URL('../../src/', import.meta.url), name: 'apps/web/src' },
  { url: new URL('../../../../packages/ui/src/', import.meta.url), name: 'packages/ui/src' },
]

/**
 * Os arquivos do REGISTRY ficam de fora, e a razão é a mesma que os deixa fora do lint.
 *
 * `sidebar.tsx` veio do shadcn como está — `SidebarProvider` põe o `useEffect` do atalho de teclado
 * antes do `useMemo` do contexto. Reordenar código de registry faz o próximo `shadcn add` render um
 * diff que não é nosso, e o projeto já aceita as sete advertências de lint deles pelo mesmo motivo.
 * A exceção é NOMINAL: um arquivo novo do registry não entra sozinho.
 */
const REGISTRY = ['packages/ui/src/components/sidebar.tsx']

const HOOKS: Record<string, number> = {
  useState: 2,
  useReducer: 2,
  useQuery: 3,
  useSuspenseQuery: 3,
  useMutation: 3,
  useMemo: 4,
  useCallback: 4,
  useEffect: 5,
  useLayoutEffect: 5,
}

function tsxFiles(dir: URL, prefix: string): [string, string][] {
  const out: [string, string][] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...tsxFiles(new URL(`${e.name}/`, dir), `${prefix}/${e.name}`))
    else if (e.name.endsWith('.tsx')) out.push([`${prefix}/${e.name}`, readFileSync(new URL(e.name, dir), 'utf8')])
  }
  return out
}

describe('a ordem dos hooks', () => {
  const files = dirs.flatMap((d) => tsxFiles(d.url, d.name)).filter(([name]) => !REGISTRY.includes(name))

  it('o varredor acha os componentes', () => {
    assert.ok(files.length > 60, `só ${files.length} arquivos`)
  })

  it('nenhum useEffect antes de um hook de estado, requisição ou memo', () => {
    const offenders: string[] = []
    for (const [name, source] of files) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      // Um componente por vez: do `function X(` maiúsculo até o próximo `export` de topo.
      for (const decl of code.matchAll(/\n(?:export )?function ([A-Z][A-Za-z0-9]*)\(/g)) {
        const next = code.indexOf('\nexport ', decl.index + 1)
        const body = code.slice(decl.index, next > 0 ? next : code.length)
        const calls = [...body.matchAll(new RegExp(`\\b(${Object.keys(HOOKS).join('|')})\\(`, 'g'))].map((m) => m[1])
        const effect = calls.findIndex((c) => HOOKS[c] === 5)
        if (effect === -1) continue
        const after = calls.slice(effect + 1).filter((c) => HOOKS[c] < 5)
        if (after.length) offenders.push(`${name} · ${decl[1]}: useEffect antes de ${[...new Set(after)].sort().join(', ')}`)
      }
    }
    assert.deepEqual(offenders, [], 'a §4 põe o efeito por último — no meio, ele convida o estado derivado que a §2 proíbe')
  })

  it('e a exceção do registry ainda é necessária — senão ela vira licença em branco', () => {
    // Uma exceção que sobrevive ao arquivo ter sido consertado abre a porta para qualquer coisa.
    for (const name of REGISTRY) {
      const [, source] = dirs.flatMap((d) => tsxFiles(d.url, d.name)).find(([n]) => n === name) ?? []
      assert.ok(source, `${name} está na lista de exceções e não existe mais`)
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      const calls = [...code.matchAll(new RegExp(`\\b(${Object.keys(HOOKS).join('|')})\\(`, 'g'))].map((m) => m[1])
      const effect = calls.findIndex((c) => HOOKS[c] === 5)
      assert.ok(effect !== -1 && calls.slice(effect + 1).some((c) => HOOKS[c] < 5), `${name} já está em ordem — tire-o da lista`)
    }
  })
})
