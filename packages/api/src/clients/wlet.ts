import { type ClientOptions, createApiClient } from '../client'
import { wletContract } from '../contracts/wlet'

export function createWletClient(options: ClientOptions) {
  return createApiClient(wletContract, options)
}

export type WletClient = ReturnType<typeof createWletClient>
