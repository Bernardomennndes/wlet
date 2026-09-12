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
const raiz = new URL('../../src/routes/', import.meta.url)

/** Sem comentários: eles CITAM a forma proibida para explicá-la. */
function codigoDe(url: URL): string {
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
const DESTRUTIVAS = [
  { tela: 'planos/-content.tsx', perguntas: 2, mutacoes: ['removerPlano', 'removerGrupo'] },
  { tela: 'rubricas/-content.tsx', perguntas: 1, mutacoes: ['remover'] },
  { tela: 'previsao/-content.tsx', perguntas: 1, mutacoes: ['excluir'] },
  // Reprocessar não apaga nada por si, mas reescreve o conjunto INTEIRO: se um perfil de conta
  // mudou, todo `transaction.id` muda e os ajustes manuais presos a eles ficam órfãos em silêncio.
  { tela: 'dados/-content.tsx', perguntas: 1, mutacoes: ['reprocessar'] },
] as const

const contar = (fonte: string, padrao: RegExp) => (fonte.match(padrao) ?? []).length

describe('confirmação de mutação instantânea', () => {
  for (const { tela, perguntas, mutacoes } of DESTRUTIVAS) {
    it(`${tela}: ${perguntas} ${perguntas === 1 ? 'pergunta' : 'perguntas'} para ${mutacoes.join(', ')}`, () => {
      const fonte = codigoDe(new URL(tela, raiz))
      assert.equal(contar(fonte, /<AlertDialog\b/g), perguntas, 'o número de diálogos de confirmação mudou — atualize a tabela e confira cada ação')
      assert.equal(contar(fonte, /<AlertDialogAction\b/g), perguntas, 'cada pergunta precisa de exatamente uma ação que a confirme')

      for (const mutacao of mutacoes) {
        // A mutação NÃO pode ser chamada de um `onClick` que não seja o do `AlertDialogAction`.
        // Procuramos o disparo e exigimos que o `AlertDialogAction` mais próximo ACIMA dele exista.
        const disparos = [...fonte.matchAll(new RegExp(`\\b${mutacao}\\(`, 'g'))]
        assert.ok(disparos.length > 0, `${mutacao} não é mais chamada nesta tela`)
        for (const disparo of disparos) {
          const antes = fonte.slice(0, disparo.index)
          const acao = antes.lastIndexOf('<AlertDialogAction')
          const fechamento = antes.lastIndexOf('</AlertDialog>')
          assert.ok(acao > fechamento, `${tela}: ${mutacao} é disparada fora de um AlertDialogAction — a §1 proíbe o clique que já grava`)
        }
      }
    })
  }

  it('e o AlertDialog usado é o do registry, não o Dialog comum', () => {
    // A §2 da regra é explícita: o `Dialog` não tem papel de alerta nem foco no cancelar, e trocar
    // um pelo outro é a aproximação que ninguém volta para corrigir.
    for (const { tela } of DESTRUTIVAS) {
      const fonte = readFileSync(new URL(tela, raiz), 'utf8')
      assert.match(fonte, /from '@wlet\/ui\/components\/alert-dialog'/, `${tela} não importa o alert-dialog`)
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
  const fonte = readFileSync(new URL('../../../../packages/ui/src/components/alert-dialog.tsx', import.meta.url), 'utf8')

  it('anuncia-se como alertdialog', () => {
    assert.match(fonte, /role="alertdialog"/)
  })

  it('põe o foco inicial no CANCELAR, não na confirmação', () => {
    // Num diálogo comum o foco cai no primeiro elemento — aqui isso seria o botão de confirmar, e
    // um Enter reflexo executaria justamente o que se quis confirmar.
    assert.match(fonte, /initialFocus=\{cancelar\}/)
    assert.match(fonte, /data-slot="alert-dialog-cancel"[\s\S]{0,160}ref=\{ref/)
  })

  it('não fecha ao clicar fora', () => {
    // Clique acidental fora é ambíguo: não se sabe se desistiu ou errou o alvo.
    assert.match(fonte, /disablePointerDismissal = true/)
  })
})

/** Nenhuma outra rota pode ter ganhado remoção sem entrar na tabela acima. */
describe('a tabela cobre todas as telas que removem', () => {
  it('nenhuma rota fora da tabela dispara remoção de um clique', () => {
    const telas: string[] = []
    const varrer = (dir: URL, prefixo: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) varrer(new URL(`${e.name}/`, dir), `${prefixo}${e.name}/`)
        else if (e.name.endsWith('.tsx')) telas.push(`${prefixo}${e.name}`)
      }
    }
    varrer(raiz, '')
    const declaradas = DESTRUTIVAS.map((d) => d.tela)
    const suspeitas = telas
      .filter((t) => !declaradas.includes(t as (typeof DESTRUTIVAS)[number]['tela']))
      // `useMutation` com um nome de remoção: é o padrão de uma escrita destrutiva nova.
      .filter((t) => /mutate: (remover|excluir|apagar|deletar)/.test(codigoDe(new URL(t, raiz))))
    assert.deepEqual(suspeitas, [], 'tela com remoção fora da tabela de confirmação — declare-a e dê a ela um AlertDialog')
  })
})
