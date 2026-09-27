import {lore} from '@lore-vcs/sdk'
import type {
  LoreBranchPushArgs,
  LoreFileStageArgs,
  LoreGlobalArgs,
  LoreAuthLoginWithTokenArgs,
  LoreRepositoryCloneArgs,
  LoreRevisionCommitArgs,
} from '@lore-vcs/sdk/types/args'
import {LoreEventTag} from '@lore-vcs/sdk/types/enums'
import type {LoreEvent} from '@lore-vcs/sdk/types/events'
import type {LoreDeliveryAdapter, LoreDeliveryInput, LoreDeliveryResult} from './lore.js'

export type LocalLorePreparation = {
  repositoryPath: string
  remoteUrl?: string
  accessToken?: string
  files: string[]
  commitMessage: string
}

/**
 * Uses Lore's native TypeScript SDK for local repository preparation. This
 * does not grant remote authorization and does not replace the remote API.
 */
export async function prepareLocalLoreRepository(input: LocalLorePreparation): Promise<{repositoryId?: string; commitHash?: string}> {
  const globals: LoreGlobalArgs = {
    repositoryPath: input.repositoryPath,
    offline: !input.remoteUrl,
  }

  if (input.remoteUrl && input.accessToken) {
    const authArgs: LoreAuthLoginWithTokenArgs = {
      remoteUrl: input.remoteUrl,
      token: input.accessToken,
      tokenType: 'Bearer',
    }
    await lore.authLoginWithToken(globals, authArgs).waitAsync()
  }

  if (input.remoteUrl) {
    const cloneArgs: LoreRepositoryCloneArgs = {repositoryUrl: input.remoteUrl}
    await lore.repositoryClone(globals, cloneArgs).waitAsync()
  }

  const stageArgs: LoreFileStageArgs = {paths: input.files}
  await lore.fileStage(globals, stageArgs).waitAsync()

  const commitArgs: LoreRevisionCommitArgs = {message: input.commitMessage}
  const commitEvents: LoreEvent[] = await lore.revisionCommit(globals, commitArgs).collectAsync()
  const revisionEvent = commitEvents.find((event) => event.tag === LoreEventTag.REVISION_COMMIT_REVISION)
  const repositoryId = revisionEvent && 'data' in revisionEvent && typeof revisionEvent.data === 'object' && revisionEvent.data && 'repository' in revisionEvent.data
    ? String((revisionEvent.data as {repository: string}).repository)
    : undefined
  const commitHash = revisionEvent && 'data' in revisionEvent && typeof revisionEvent.data === 'object' && revisionEvent.data && 'revision' in revisionEvent.data
    ? String((revisionEvent.data as {revision: string}).revision)
    : undefined

  if (input.remoteUrl) {
    const pushArgs: LoreBranchPushArgs = {}
    await lore.branchPush(globals, pushArgs).waitAsync()
  }
  return {repositoryId, commitHash}
}

/**
 * Remote-capable adapter using the pinned SDK's online repository operations.
 * The caller must provide the exact workspace and staged files; no artifact is
 * inferred from the database manifest.
 */
export class SdkLoreDeliveryAdapter implements LoreDeliveryAdapter {
  constructor(
    private readonly workspacePath: string,
    private readonly files: string[],
    private readonly commitMessage: string,
  ) {}

  async deliver(input: LoreDeliveryInput): Promise<LoreDeliveryResult> {
    const prepared = await prepareLocalLoreRepository({
      repositoryPath: this.workspacePath,
      remoteUrl: input.endpoint,
      accessToken: input.machineToken,
      files: this.files,
      commitMessage: this.commitMessage,
    })
    if (!prepared.repositoryId || !prepared.commitHash) throw new Error('Lore SDK did not return repository and commit identifiers')
    return {repositoryId: prepared.repositoryId, commitHash: prepared.commitHash}
  }
}
