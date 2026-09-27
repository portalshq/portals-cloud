import type {Pool} from 'pg'
import type {DeliveryJob} from './jobs.js'
import {markCompleted} from './jobs.js'
import type {LoreDeliveryAdapter, LoreDeliveryResult} from './lore.js'
import type {PackageManifest} from './package.js'

export async function executeDelivery(input: {
  pool: Pool
  workerId: string
  job: DeliveryJob
  manifest: PackageManifest
  endpoint: string
  machineToken: string
  adapter: LoreDeliveryAdapter
}): Promise<LoreDeliveryResult> {
  const result = await input.adapter.deliver({
    job: input.job,
    manifest: input.manifest,
    endpoint: input.endpoint,
    machineToken: input.machineToken,
  })
  if (result.repositoryId !== input.job.repositoryId) throw new Error('Lore repository identity mismatch')
  if (!result.commitHash.trim()) throw new Error('Lore delivery returned an empty commit hash')
  await markCompleted(
    input.pool,
    input.job.id,
    input.workerId,
    input.manifest.packageSha256,
    result.repositoryId,
    result.commitHash,
  )
  return result
}
