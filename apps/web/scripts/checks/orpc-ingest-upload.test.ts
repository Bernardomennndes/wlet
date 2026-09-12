import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makeOrpcSourceStore } from '../../../../packages/services/src/dataset/infrastructure/orpc-dataset.adapter.ts'

/**
 * O caminho REMOTO do UPLOAD, no ponto em que ele quase nunca é exercitado: um arquivo grande.
 *
 * O alvo mudou de lugar junto com o desenho: quem sobe os bytes é `SourceStore.save`
 * (`PUT /dataset/sources`), e o runner passou a processar o que já está guardado — antes os dois
 * subiam os mesmos megabytes. O defeito que este teste guarda é o mesmo; a função que o comete é
 * que é outra.
 *
 * O adapter montava o base64 com `btoa(String.fromCharCode(...s.bytes))`. O spread de um
 * `Uint8Array` de megabytes passa um argumento POR BYTE, estoura a pilha e lança `RangeError`
 * antes de qualquer rede — então o botão "Escolher a pasta docs/" morria com um erro que não fala
 * em tamanho, e só com arquivo de verdade. Os extratos reais que `backup.ts` documenta são 11,4 MB.
 *
 * O teste usa 1 MB porque é o suficiente: o limite de argumentos estoura MUITO antes disso, e um
 * megabyte mantém a suíte rápida. Com o `toBase64` de `@wlet/lib/portable`, que converte em fatias
 * de 32 KB, ele passa.
 */
describe('upload de arquivo-fonte pelo contrato: arquivo grande', () => {
  const clienteFalso = (capturado: { sources?: { path: string; contentBase64: string }[] }) =>
    ({
      dataset: {
        writeSources: async (input: { sources: { path: string; contentBase64: string }[] }) => {
          capturado.sources = input.sources
          return { ok: true as const }
        },
      },
    }) as never

  it('não estoura a pilha com um arquivo de 1 MB', async () => {
    const capturado: { sources?: { path: string; contentBase64: string }[] } = {}
    const store = makeOrpcSourceStore({ client: clienteFalso(capturado) })
    const bytes = new Uint8Array(1024 * 1024).fill(65)

    await assert.doesNotReject(() => store.save([{ path: 'docs/extrato/grande.ofx', bytes }]))
    assert.equal(capturado.sources?.length, 1)
  })

  it('o base64 que sobe é o MESMO que o servidor sabe decodificar', async () => {
    const capturado: { sources?: { path: string; contentBase64: string }[] } = {}
    const store = makeOrpcSourceStore({ client: clienteFalso(capturado) })
    // Bytes que quebram uma implementação ingênua por caractere: acima de 127 e o zero.
    const bytes = new Uint8Array([0, 65, 127, 128, 200, 255])

    await store.save([{ path: 'docs/fatura/bin.pdf', bytes }])

    const voltou = Buffer.from(capturado.sources?.[0].contentBase64 ?? '', 'base64')
    assert.deepEqual(new Uint8Array(voltou), bytes, 'o que sobe tem de voltar idêntico — é o que apps/api faz em routers/dataset.ts')
  })
})
