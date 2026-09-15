import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, it } from 'node:test'
import { repoRoot } from './support/source-fields'

/**
 * Os MÓDULOS que as rules mandam usar — e se eles existem.
 *
 * As rules deste projeto foram importadas de outro (a Selfie) e adaptadas. A adaptação já tratou
 * duas classes: `rule-globs.test.ts` confere o `paths` do cabeçalho, e o texto de várias declara
 * que "todo caminho no formato `(grupo)/…` é do projeto de ORIGEM". Faltava a terceira, que é a
 * mais traiçoeira: o módulo citado no ALIAS DESTE PROJETO.
 *
 * `@/` é o alias de `apps/web`. Uma rule que diga "use `X` de `@/components/ui/field`" parece
 * instrução local e verificável — e o que a mede é ninguém. Encontrados assim, por medição:
 *
 * - `forms.md` mandava importar `Field` de `@/components/ui/field`; aqui é
 *   `@wlet/ui/components/field`, e a nota estava dentro de um bloco "**Neste projeto.**".
 * - `forms.md` dizia "a skill escreve `@workspace/...`; neste repo é `@selfie/...`" — neste repo é
 *   `@wlet/`.
 * - `kpi-cards.md` citava `@/lib/format` TRÊS vezes, uma delas afirmando "é o padrão CORRETO aqui,
 *   e é o que as sete telas fazem". As telas importam `@wlet/lib/format`, dez vezes, medido.
 * - `listing-filters.md` mandava usar cinco componentes de filtro que não existem, enquanto o
 *   próprio cabeçalho dela já nomeava o `AppCombobox` como a referência viva daqui.
 *
 * Nenhum desses quebra build, teste ou tela: quem segue não acha o módulo, conclui que a rule é
 * velha, e para de confiar no resto dela. É o mesmo defeito que a §4 da `data-list.md` registra ter
 * tido — "um inventário de outro repositório não é lacuna nem precedente: é ruído".
 */
const rulesDir = `${repoRoot}.claude/rules/`

/**
 * As citações que FICAM, e o porquê de cada uma.
 *
 * Linhagem não é lacuna: mostrar de onde a decisão veio é parte do valor das rules importadas. O
 * que não pode é linhagem PARECER instrução. Por isso a exceção é nominal — um módulo novo que não
 * resolva cai vermelho, e quem o acrescentar decide aqui se é para usar ou para lembrar.
 */
const LINEAGE: Record<string, string> = {
  // A origem é Next + TanStack Table; `data-table.md` abre dizendo que este projeto não usa nem um
  // nem outro, então os seis abaixo são a forma de lá, guardada para explicar a regra.
  '@/components/data-table/data-table': 'data-table.md declara que não há <DataTable> aqui',
  '@/components/data-table/data-table-grid-header': 'idem',
  '@/components/data-table/data-table-pagination': 'idem',
  '@/components/data-table/actions-column': 'idem',
  '@/hooks/use-data-table-grid-state': 'idem — o estado de grade é do TanStack',
  '@/types/table': 'idem — a augmentation de `meta.title` é do TanStack',
  '@/components/material/material-tag': 'domínio da origem (aulas, materiais); não há equivalente',
  '@/data/types': 'services-architecture.md §8 já o rotula: "na Selfie o módulo era `@/data/types`, que não existe aqui"',
  '@selfie/lib': 'o pacote da origem, citado na tabela de adaptação da §0',
  '@selfie/lib/schema/enums': 'idem',
  '@selfie/ui/components/form': 'idem — o registry daqui não tem `Form`, tem `Field`',
  '@selfie/ui/components/select': 'idem',
  // Reticências em prosa, e não caminho de módulo: `@wlet/...` aparece numa frase que compara os
  // três prefixos. Ficam nomeadas para o sensor não ter de adivinhar o que é elipse.
  '@selfie/...': 'elipse em prosa',
  '@wlet/...': 'elipse em prosa',
  '@workspace/...': 'elipse em prosa',
}

const packages = new Map(
  readdirSync(`${repoRoot}packages`, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(`${repoRoot}packages/${e.name}/package.json`))
    .map((e) => [JSON.parse(readFileSync(`${repoRoot}packages/${e.name}/package.json`, 'utf8')).name as string, `packages/${e.name}`]),
)

const exists = (base: string) => ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].some((ext) => existsSync(`${repoRoot}${base}${ext}`))

/** Resolve uma citação como o projeto resolveria o import — pelo alias ou pelo pacote. */
function resolve(spec: string): boolean {
  if (spec.startsWith('@/')) return exists(`apps/web/src/${spec.slice(2)}`)
  const [scope, name, ...rest] = spec.split('/')
  const dir = packages.get(`${scope}/${name}`)
  if (!dir) return false
  return rest.length === 0 || exists(`${dir}/src/${rest.join('/')}`)
}

function citations(): { rule: string; spec: string }[] {
  const out: { rule: string; spec: string }[] = []
  for (const file of readdirSync(rulesDir).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(`${rulesDir}${file}`, 'utf8')
    const seen = new Set<string>()
    for (const match of text.matchAll(/`(@(?:\/|wlet\/|selfie\/|workspace\/)[A-Za-z0-9_/.-]*)`/g)) {
      if (seen.has(match[1])) continue
      seen.add(match[1])
      out.push({ rule: file, spec: match[1] })
    }
  }
  return out
}

describe('todo módulo que uma rule cita ou existe, ou está declarado como linhagem', () => {
  it('nenhuma citação fica sem uma das duas coisas', () => {
    const orphans = citations()
      .filter(({ spec }) => !resolve(spec) && !(spec in LINEAGE))
      .map(({ rule, spec }) => `${rule} → ${spec}`)
    assert.deepEqual(orphans, [], 'ou aponte para o módulo que existe aqui, ou declare em LINEAGE por que a citação da origem fica')
  })

  it('e a lista de linhagem não guarda módulo que PASSOU a existir', () => {
    // O lado esquecido da exceção. Se alguém trouxer o componente para cá, a citação vira instrução
    // válida e a linha aqui passa a mentir — dizendo "não existe" sobre o que existe, que é
    // exatamente o defeito com o sinal trocado.
    const arrived = Object.keys(LINEAGE).filter((spec) => !spec.endsWith('/...') && resolve(spec))
    assert.deepEqual(arrived, [], 'existe agora: tire de LINEAGE e conserte a prosa da rule')
  })

  it('e toda linhagem declarada é de fato CITADA por alguma rule', () => {
    // Exceção órfã é pior que ausente: ela anistia um caminho que ninguém escreve e dá a impressão
    // de que o assunto foi tratado.
    const cited = new Set(citations().map((c) => c.spec))
    assert.deepEqual(
      Object.keys(LINEAGE).filter((spec) => !cited.has(spec)),
      [],
    )
  })
})

describe('o sensor alcança as rules que diz alcançar', () => {
  it('leu as 20 rules e achou citação em mais de uma', () => {
    // Um `readdirSync` num caminho errado devolve lista vazia e deixa tudo acima verde.
    assert.equal(readdirSync(rulesDir).filter((f) => f.endsWith('.md')).length, 20)
    assert.ok(new Set(citations().map((c) => c.rule)).size > 5, 'citação em poucas rules demais — o padrão de busca deve ter quebrado')
  })
})
