import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * O que NÃO pode entrar num commit — e a checagem que faltava.
 *
 * O `.gitignore` deste repositório é o único obstáculo entre o extrato bancário inteiro e um
 * repositório público, e ele é bem escrito: nomeia os extratos crus, o que o ingest produz deles,
 * o pacote de exportação, os seis `*.config.ts` com nome, conta, salário e metas, e até o cache
 * do Turbo — que guarda o BUILD, e o build embute `src/generated/`.
 *
 * O que não havia era o que mantém assim. Nenhuma ferramenta confere um `.gitignore`: apagar uma
 * linha não quebra nada, não aparece em revisão de código como risco, e o estrago só se vê depois
 * do `push`. **Medido agora**: o build local produz um `transactions-*.js` de 3,3 MB, e ele é a
 * semente com 5.694 lançamentos — estabelecimento, valor, data e descrição de cada um.
 *
 * O segundo teste é o que de fato protege. `git check-ignore` responde "sim, está ignorado"
 * mesmo para um arquivo que JÁ FOI COMMITADO — ignorar não desrastreia. Um arquivo pessoal que
 * entrou antes da linha existir continua no histórico, e o `.gitignore` diz que está tudo bem.
 */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))

const git = (...args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })

/**
 * Os caminhos de dado pessoal, com o que cada um carrega.
 *
 * A lista é ESCRITA e não derivada do `.gitignore`: derivá-la faria o teste concordar com o
 * arquivo que ele existe para conferir, e apagar uma linha passaria a apagar a checagem junto.
 */
const PERSONAL: [path: string, holds: string][] = [
  ['apps/web/docs/', 'os extratos e faturas crus, como o banco os exportou'],
  ['apps/web/src/generated/transactions.json', 'toda transação: estabelecimento, valor, data, descrição e conta'],
  ['apps/web/src/generated/accounts.json', 'as contas, com número e titular'],
  ['apps/web/src/generated/investments.json', 'a carteira'],
  ['wlet-2026-09-09.json', 'o pacote de exportação: conjunto inteiro mais os extratos originais em base64'],
  ['apps/web/scripts/accounts.config.ts', 'nome, banco e número de conta'],
  ['apps/web/scripts/planned.config.ts', 'salário e contas a pagar'],
  ['apps/web/scripts/receivables.config.ts', 'quem te deve dinheiro, pelo nome'],
  ['apps/web/scripts/goals.config.ts', 'as metas financeiras'],
  ['apps/web/scripts/budget.config.ts', 'o teto de gastos'],
  ['apps/web/scripts/rules.config.ts', 'os estabelecimentos que você frequenta'],
  ['.turbo/', 'o cache do Turbo — ele guarda o BUILD, e o build embute a semente'],
  ['apps/web/.turbo/', 'o mesmo cache, dentro do pacote'],
  ['.env', 'a senha do banco e o segredo de assinatura de sessão'],
]

describe('dado pessoal não entra em commit', () => {
  it('todo caminho sensível está IGNORADO', () => {
    const unguarded: string[] = []
    for (const [path, holds] of PERSONAL) {
      // `-q` devolve 1 quando o caminho NÃO é ignorado; `execFileSync` lança nesse caso.
      try {
        git('check-ignore', '-q', path)
      } catch {
        unguarded.push(`${path} — ${holds}`)
      }
    }
    assert.deepEqual(unguarded, [], 'caminho de dado pessoal fora do .gitignore')
  })

  it('e nenhum deles está RASTREADO — porque ignorar não desrastreia', () => {
    // O teste que protege de verdade. Um arquivo que entrou antes de a linha existir continua no
    // índice e no histórico, e o `check-ignore` acima responde "ignorado" sobre ele sem mentir.
    const tracked = git('ls-files').split('\n').filter(Boolean)
    const forbidden = tracked.filter(
      (file) =>
        file.startsWith('apps/web/docs/') ||
        file.startsWith('apps/web/src/generated/') ||
        /^wlet-.*\.json$/.test(file) ||
        // `.env.example` é o que VIAJA, e ele casaria com um `^\.env` ingênuo — foi o primeiro
        // vermelho deste teste, e acusar o arquivo certo é o jeito mais rápido de um sensor ser desligado.
        (/^\.env(\.|$)/.test(file) && !file.endsWith('.example')) ||
        (/^apps\/web\/scripts\/[a-z]+\.config\.ts$/.test(file) && !file.includes('.example.')),
    )
    assert.deepEqual(forbidden, [], 'arquivo pessoal RASTREADO pelo git')
  })

  it('o varredor está olhando para o repositório inteiro', () => {
    // Um `git ls-files` que devolve pouco — diretório errado, repositório não inicializado —
    // faria o teste acima passar sem ter olhado nada.
    assert.ok(git('ls-files').split('\n').filter(Boolean).length >= 200, 'poucos arquivos rastreados — a varredura não está no repositório certo')
  })
})

describe('e o que viaja é o exemplo', () => {
  it('todo `*.config.ts` pessoal tem um `.example.ts` versionado', () => {
    // É o `.example` que documenta a forma e o que o `pnpm setup` copia. Sem ele, quem clona
    // fica sem o arquivo e sem saber o que escrever nele — e a saída mais provável é pedir o
    // original a quem tem, que é exatamente o que o `.gitignore` está evitando.
    const tracked = new Set(git('ls-files').split('\n'))
    const missing: string[] = []
    for (const [path] of PERSONAL) {
      if (!/scripts\/[a-z]+\.config\.ts$/.test(path)) continue
      const example = path.replace(/\.config\.ts$/, '.config.example.ts')
      if (!tracked.has(example)) missing.push(example)
    }
    assert.deepEqual(missing, [])
  })

  it('e o `.env.example` viaja no lugar do `.env`', () => {
    assert.ok(existsSync(`${repoRoot}.env.example`))
    assert.ok(git('ls-files').includes('.env.example'))
  })
})
