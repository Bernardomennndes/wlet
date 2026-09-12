import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

/**
 * Mutação INSTANTÂNEA pede confirmação — e a ausência dela não tem outro sensor.
 *
 * Um `onClick={() => remover(...)}` compila, passa no typecheck e funciona: ele só é um defeito
 * quando alguém erra o alvo numa lista densa, e aí o dado já foi. A `mutation-confirmation.md` §1
 * proíbe o disparo direto, e este arquivo é o que impede a proibição de virar boa intenção.
 *
 * A checagem é por ARQUIVO e não por chamada: uma tela que remove precisa ter um `AlertDialog`, e
 * as mutações de remoção precisam ser disparadas de dentro de um `AlertDialogAction`. Contar as
 * duas coisas é frouxo o suficiente para não engessar o formato e apertado o suficiente para pegar
 * o disparo solto — que é o que de fato acontece quando se esquece.
 */
const root = new URL('../../src/routes/', import.meta.url)

/** Sem comentários: eles CITAM a forma proibida para explicá-la. */
function codeOf(url: URL): string {
  return readFileSync(url, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
}

/**
 * As telas que têm escrita DESTRUTIVA, e o que cada uma precisa perguntar.
 *
 * A lista é explícita de propósito: descobrir "o que é destrutivo" por heurística de nome erraria
 * nos dois sentidos, e o que decide é o efeito, que só quem escreveu a tela sabe.
 */
const DESTRUCTIVE = [
  { screen: 'planos/-content.tsx', prompts: 2, mutations: ['deletePlan', 'deleteGroup'] },
  { screen: 'rubricas/-content.tsx', prompts: 1, mutations: ['deleteRubric'] },
  { screen: 'previsao/-content.tsx', prompts: 1, mutations: ['deleteEntry'] },
  // Reprocessar não apaga nada por si, mas reescreve o conjunto INTEIRO: se um perfil de conta
  // mudou, todo `transaction.id` muda e os ajustes manuais presos a eles ficam órfãos em silêncio.
  { screen: 'dados/-content.tsx', prompts: 1, mutations: ['reprocess'] },
] as const

const count = (source: string, pattern: RegExp) => (source.match(pattern) ?? []).length

describe('confirmação de mutação instantânea', () => {
  for (const { screen, prompts, mutations } of DESTRUCTIVE) {
    it(`${screen}: ${prompts} ${prompts === 1 ? 'pergunta' : 'perguntas'} para ${mutations.join(', ')}`, () => {
      const source = codeOf(new URL(screen, root))
      assert.equal(count(source, /<AlertDialog\b/g), prompts, 'o número de diálogos de confirmação mudou — atualize a tabela e confira cada ação')
      assert.equal(count(source, /<AlertDialogAction\b/g), prompts, 'cada pergunta precisa de exatamente uma ação que a confirme')

      for (const mutation of mutations) {
        // A mutação NÃO pode ser chamada de um `onClick` que não seja o do `AlertDialogAction`.
        // Procuramos o disparo e exigimos que o `AlertDialogAction` mais próximo ACIMA dele exista.
        const calls = [...source.matchAll(new RegExp(`\\b${mutation}\\(`, 'g'))]
        assert.ok(calls.length > 0, `${mutation} não é mais chamada nesta tela`)
        for (const call of calls) {
          const before = source.slice(0, call.index)
          const action = before.lastIndexOf('<AlertDialogAction')
          const closing = before.lastIndexOf('</AlertDialog>')
          assert.ok(action > closing, `${screen}: ${mutation} é disparada fora de um AlertDialogAction — a §1 proíbe o clique que já grava`)
        }
      }
    })
  }

  it('e o AlertDialog usado é o do registry, não o Dialog comum', () => {
    // A §2 da regra é explícita: o `Dialog` não tem papel de alerta nem foco no cancelar, e trocar
    // um pelo outro é a aproximação que ninguém volta para corrigir.
    for (const { screen } of DESTRUCTIVE) {
      const source = readFileSync(new URL(screen, root), 'utf8')
      assert.match(source, /from '@wlet\/ui\/components\/alert-dialog'/, `${screen} não importa o alert-dialog`)
    }
  })
})

/**
 * E o componente em si tem as TRÊS propriedades que o separam de um `Dialog`.
 *
 * Sem elas o arquivo seria um `Dialog` renomeado, que é exatamente o que a §2 proíbe — e a
 * diferença não aparece em teste de comportamento de tela nenhum.
 */
describe('o alert-dialog não é um Dialog renomeado', () => {
  const source = readFileSync(new URL('../../../../packages/ui/src/components/alert-dialog.tsx', import.meta.url), 'utf8')

  it('anuncia-se como alertdialog', () => {
    assert.match(source, /role="alertdialog"/)
  })

  it('põe o foco inicial no CANCELAR, não na confirmação', () => {
    // Num diálogo comum o foco cai no primeiro elemento — aqui isso seria o botão de confirmar, e
    // um Enter reflexo executaria justamente o que se quis confirmar.
    assert.match(source, /initialFocus=\{cancelRef\}/)
    assert.match(source, /data-slot="alert-dialog-cancel"[\s\S]{0,160}ref=\{ref/)
  })

  it('não fecha ao clicar fora', () => {
    // Clique acidental fora é ambíguo: não se sabe se desistiu ou errou o alvo.
    assert.match(source, /disablePointerDismissal = true/)
  })
})

/** Nenhuma outra rota pode ter ganhado remoção sem entrar na tabela acima. */
describe('a tabela cobre todas as telas que removem', () => {
  it('nenhuma rota fora da tabela dispara remoção de um clique', () => {
    const screens: string[] = []
    const walk = (dir: URL, prefix: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(new URL(`${e.name}/`, dir), `${prefix}${e.name}/`)
        else if (e.name.endsWith('.tsx')) screens.push(`${prefix}${e.name}`)
      }
    }
    walk(root, '')
    const declared = DESTRUCTIVE.map((d) => d.screen)
    const suspects = screens
      .filter((t) => !declared.includes(t as (typeof DESTRUCTIVE)[number]['tela']))
      // `useMutation` com um nome de remoção: é o padrão de uma escrita destrutiva nova.
      .filter((t) => /mutate: (delete|remove)[A-Z]/.test(codeOf(new URL(t, root))))
    assert.deepEqual(suspects, [], 'tela com remoção fora da tabela de confirmação — declare-a e dê a ela um AlertDialog')
  })
})
