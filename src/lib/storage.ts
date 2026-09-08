/**
 * O que o app guarda no navegador, com o prefixo num lugar só.
 *
 * `readStorage` e `writeStorage` viviam duplicados em `filters.tsx` e `theme.tsx`, e o prefixo
 * estava escrito por extenso em cada chamada — seis literais `'wallet.…'` espalhados por dois
 * providers e um módulo. Renomear a marca cobrou essa dívida na hora: um prefixo repetido em
 * seis lugares não se renomeia, se garimpa.
 *
 * Não há `@/` nem import de dado gerado aqui de propósito: `plans.ts` também lê deste módulo,
 * e ele é exercitado pelos testes, que não podem passar a depender de um dataset gerado para
 * exercitar aritmética de calendário.
 */

/** O prefixo de toda chave. Trocar isto renomeia o armazenamento inteiro. */
const PREFIX = 'wlet'

/**
 * O prefixo anterior, de quando o app se chamava Wallet.
 *
 * **Ele existe para os dados de quem já usa não sumirem.** O navegador não migra chave: sem
 * esta reserva, o app passaria a ler `wlet.plans`, que não existe em navegador nenhum que já
 * rodou a versão antiga, e o catálogo de planos apareceria vazio — sem erro, porque a ausência
 * de chave é indistinguível de catálogo vazio. O mesmo valeria para os ajustes manuais de
 * categoria, o tema, o recorte e o período.
 *
 * A migração COPIA em vez de mover: a chave antiga fica onde está. Apagá-la tornaria a volta
 * para a versão anterior uma perda de dados, e o custo de deixá-la é um punhado de bytes
 * órfãos. Quando não houver mais para onde voltar, ela pode sair — e com ela este bloco.
 */
const LEGACY_PREFIX = 'wallet'

/** A chave completa de um nome. */
export function storageKey(name: string): string {
  return `${PREFIX}.${name}`
}

/**
 * O texto cru gravado sob um nome, migrando o do prefixo antigo na primeira leitura.
 *
 * A migração acontece na LEITURA e não num passo de inicialização porque não existe um momento
 * em que o app "abre": cada provider lê a sua chave quando monta, e um passo separado teria de
 * conhecer a lista inteira de nomes — que é exatamente o acoplamento que este módulo desfaz.
 */
export function readRaw(name: string): string | null {
  try {
    const current = localStorage.getItem(storageKey(name))
    if (current !== null) return current
    const legacy = localStorage.getItem(`${LEGACY_PREFIX}.${name}`)
    if (legacy !== null) localStorage.setItem(storageKey(name), legacy)
    return legacy
  } catch {
    // Armazenamento indisponível (janela anônima, cookies bloqueados): o app segue sem estado
    // gravado, que é o mesmo caminho de um navegador novo.
    return null
  }
}

/** O valor JSON gravado sob um nome, ou o padrão. */
export function readStorage<T>(name: string, fallback: T): T {
  try {
    const raw = readRaw(name)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** Grava um valor JSON sob um nome. Armazenamento indisponível: segue sem persistir. */
export function writeStorage(name: string, value: unknown) {
  try {
    localStorage.setItem(storageKey(name), JSON.stringify(value))
  } catch {
    // armazenamento indisponível: segue sem persistir
  }
}
