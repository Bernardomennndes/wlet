/**
 * Os JSON de `src/generated/`, se existirem — e o "se" é o ponto deste arquivo.
 *
 * `import x from '@/generated/transactions.json'` é resolvido pelo Vite em tempo de BUILD:
 * sem o arquivo, o build falha. Isso contradizia a promessa do app — o dado vive no navegador,
 * e o conteúdo gerado é só a semente de quem nunca importou nada. Apagar `src/generated/`
 * deixava o projeto sem compilar, o que não faz sentido para um fallback.
 *
 * `import.meta.glob` resolve o padrão em build também, mas devolve um objeto VAZIO quando nada
 * casa, em vez de erro. É o que torna a semente de fato opcional.
 *
 * O módulo é importado DINAMICAMENTE por quem o usa: fora do Vite — o runner de testes roda
 * por tsx — `import.meta.glob` não existe, e mantê-lo fora da cadeia de import estático impede
 * que o simples ato de importar o barrel de serviços estoure.
 */
const modules = import.meta.glob<{ default: unknown }>('/src/generated/*.json')

/** O conteúdo de um arquivo gerado, ou `null` se ele não veio no build. */
export async function readGenerated<T>(name: string): Promise<T | null> {
  const load = modules[`/src/generated/${name}.json`]
  if (!load) return null
  return (await load()).default as T
}

/** Se existe ALGUM arquivo gerado. Zero significa que o app nasceu sem semente. */
export function hasGenerated(): boolean {
  return Object.keys(modules).length > 0
}
