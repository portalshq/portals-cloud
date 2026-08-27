import type {CommercialSnapshot} from './pilot'
import {
  changedPilotFields,
  createPilotDraft,
  type PilotCommittedRevision,
  type PilotDraftChange,
  type PilotMutableTerms,
} from './pilot-collaboration'
import type {StoredPilot} from './store'
import type {SuccessCriterion} from './contracts'

export function pilotMutableTermsFromState(input: {
  resolvedStartDate?: string | null
  proposal?: CommercialSnapshot | null
  successCriteria: SuccessCriterion[]
}): PilotMutableTerms {
  return {
    startDate: input.resolvedStartDate || null,
    valueConfirmed: Boolean(input.proposal?.valueModel?.confirmed),
    criteria: input.successCriteria.map((criterion) => ({...criterion})),
  }
}

export function commitPilotTermRevision(input: {
  pilot: StoredPilot
  nextTerms: PilotMutableTerms
  actor?: string
  submittedBy?: string
  baseVersion?: number
  extraChanges?: PilotDraftChange[]
  at?: string
}): {
  version: number
  draft: StoredPilot['draft']
  revisions: PilotCommittedRevision[]
  changes: PilotDraftChange[]
} {
  const at = input.at || new Date().toISOString()
  const currentTerms =
    [...input.pilot.revisions]
      .sort((left, right) => right.version - left.version)[0]
      ?.terms || pilotMutableTermsFromState(input.pilot)
  const termChanges = changedPilotFields(currentTerms, input.nextTerms, {
    at,
    by: input.actor,
  })
  const changes = [...termChanges, ...(input.extraChanges || [])]
  const version = changes.length > 0 ? input.pilot.version + 1 : input.pilot.version
  const draft = createPilotDraft({
    terms: input.nextTerms,
    baseVersion: version,
    actor: input.actor,
    at,
  })
  const revisions =
    changes.length > 0
      ? [
          ...input.pilot.revisions,
          {
            pilotId: input.pilot.id,
            version,
            baseVersion: input.baseVersion || input.pilot.version,
            committedAt: at,
            committedBy: input.actor,
            submittedBy: input.submittedBy,
            terms: input.nextTerms,
            changes,
          },
        ]
      : input.pilot.revisions
  return {version, draft, revisions, changes}
}
