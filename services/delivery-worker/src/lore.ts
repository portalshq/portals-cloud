import type {DeliveryJob} from './jobs.js'
import type {PackageManifest} from './package.js'

export type LoreDeliveryResult = {
  repositoryId: string
  commitHash: string
}

export type LoreDeliveryInput = {
    job: DeliveryJob
    manifest: PackageManifest
    endpoint: string
    machineToken: string
}

export interface LoreDeliveryAdapter {
  deliver(input: LoreDeliveryInput): Promise<LoreDeliveryResult>
}

/** Fail closed until the fork-compatible SDK/protocol adapter is verified. */
export class UnconfiguredLoreDeliveryAdapter implements LoreDeliveryAdapter {
  async deliver(_input: LoreDeliveryInput): Promise<LoreDeliveryResult> {
    throw new Error('Lore delivery adapter is not configured')
  }
}
