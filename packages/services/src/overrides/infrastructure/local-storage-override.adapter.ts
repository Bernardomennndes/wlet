import type { Overrides } from '@wlet/domain'
import type { EnvelopeSpec } from '../../shared/envelope'
import { browserStorage, makeLocalStorageDriver, type StorageLike, volatileStorage } from '../../shared/infrastructure/local-storage.driver'
import type { OverrideRepository } from '../domain/ports/override-repository'

/**
 * Os ajustes em `localStorage`.
 *
 * **Por que `localStorage`** (§7): são pares id→categoria, ordem de KB mesmo com centenas de
 * ajustes, e são por navegador — quem abre noutra máquina não os tem, e isso é aceito desde
 * sempre (o `CLAUDE.md` diz que para valer em todo lugar o ajuste vira regra no ingest).
 *
 * **`selfVersioned` não serve aqui, e por isso a migração é explícita.** O que está gravado
 * hoje sob `wlet.overrides` é o objeto CRU, sem versão nenhuma — `writeStorage('overrides', {…})`.
 * Envolver num envelope faria a leitura nova achar `version: undefined` e devolver vazio: todos
 * os ajustes manuais da pessoa sumiriam sem erro. `migrate` recebe justamente esse caso.
 */
function isOverrides(raw: unknown): raw is Overrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  return Object.values(raw).every((v) => typeof v === 'string')
}

const spec: EnvelopeSpec<Overrides> = {
  version: 1,
  empty: () => ({}),
  parse: (raw) => (isOverrides(raw) ? raw : null),
}

const KEY = 'overrides'

export function makeLocalStorageOverrideRepository(storage: StorageLike = browserStorage() ?? volatileStorage()): OverrideRepository {
  const driver = makeLocalStorageDriver(storage, KEY, spec)
  return {
    async findAll() {
      const fromEnvelope = await driver.read()
      if (Object.keys(fromEnvelope).length > 0) return fromEnvelope
      // Formato ANTIGO: objeto cru, sem envelope. Lido aqui e não convertido na hora — a
      // conversão acontece na primeira gravação, e até lá as duas leituras funcionam. Converter
      // na leitura tornaria uma operação de leitura uma escrita, que é o tipo de efeito que
      // surpreende num modo de navegação restrito.
      // Os DOIS prefixos: quem não abre o app desde a renomeação tem `wallet.overrides`. O
      // driver já copia a chave para a frente, mas depender desse efeito colateral tornaria a
      // leitura correta por acidente — aqui ela é correta por escrito.
      try {
        const raw = storage.getItem(`wlet.${KEY}`) ?? storage.getItem(`wallet.${KEY}`)
        if (!raw) return {}
        const parsed: unknown = JSON.parse(raw)
        return isOverrides(parsed) ? parsed : {}
      } catch {
        return {}
      }
    },
    save: (overrides) => driver.write(overrides),
  }
}
