import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fold } from '@wlet/lib/search'

/**
 * A normalização de BUSCA — o que faz o combobox achar "Alimentação" quando se digita
 * "alimentacao".
 *
 * São cinco linhas e mesmo assim valem teste, porque o defeito é invisível: um filtro que compara
 * strings cruas não acha nada e a tela parece apenas "não ter" a categoria. Quem digita desiste e
 * escolhe outra — o gasto vai para a rubrica errada, e ninguém registra que houve uma busca falha.
 *
 * Ela tem DOIS consumidores (`AppCombobox` e o gatilho de rubrica) e é dos dois lados da
 * comparação: o rótulo e a consulta passam pela mesma função. Por isso os casos abaixo testam o
 * par, e não a função isolada — é o par que a tela usa.
 */
const matches = (label: string, query: string) => fold(label).includes(fold(query))

describe('fold', () => {
  it('tira acento dos DOIS lados da comparação', () => {
    assert.ok(matches('Alimentação', 'alimentacao'), 'sem acento acha com acento')
    assert.ok(matches('Alimentacao', 'alimentação'), 'e o contrário também')
    assert.ok(matches('Saúde', 'saude'))
  })

  it('ignora a caixa', () => {
    assert.ok(matches('Mercado', 'MERCADO'))
    assert.ok(matches('MERCADO', 'mercado'))
  })

  it('acha no MEIO do texto, que é como a descrição participa da busca', () => {
    // A descrição entra no casamento junto com o rótulo: digitar "padaria" tem de encontrar
    // "Mercado", cuja descrição é "Supermercados e padarias".
    assert.ok(matches('Mercado Supermercados e padarias', 'padaria'))
  })

  it('cedilha e til sobrevivem à decomposição', () => {
    // `NFD` separa o diacrítico do caractere base, e o `\p{Diacritic}` o remove. Um `ç` que não
    // decomponha continuaria diferente de `c` — e "manutencao" não acharia "Manutenção".
    assert.equal(fold('Manutenção'), 'manutencao')
    assert.equal(fold('Ação'), 'acao')
    assert.equal(fold('Índice'), 'indice')
  })

  it('texto sem acento atravessa igual', () => {
    assert.equal(fold('Transporte'), 'transporte')
  })
})
