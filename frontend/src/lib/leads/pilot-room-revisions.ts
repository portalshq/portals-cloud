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
import {pilotDirectAnswersFrom} from './pilot-room-fields'

export function pilotMutableTermsFromState(input: {
  resolvedStartDate?: string | null
  proposal?: CommercialSnapshot | null
  successCriteria: SuccessCriterion[]
  answers?: Record<string, unknown>
}): PilotMutableTerms {
  return {
    startDate: input.resolvedStartDate || null,
    valueConfirmed: Boolean(input.proposal?.valueModel?.confirmed),
    criteria: input.successCriteria.map((criterion) => ({...criterion})),
    answers: pilotDirectAnswersFrom(input.answers),
  }
}

export function commitPilotTermRevision(input: {
  pilot: StoredPilot
  nextTerms: PilotMutableTerms
  actor?: string
  submittedBy?: string
  baseVersion?: number
  extraChanges?: PilotDraftChange[]
  contributors?: PilotDraftChange[]
  at?: string
}): {
  version: number
  draft: StoredPilot['draft']
  revisions: PilotCommittedRevision[]
  changes: PilotDraftChange[]
} {
  const at = input.at || new Date().toISOString()
  const fallbackTerms = pilotMutableTermsFromState(input.pilot)
  const previousTerms = [...input.pilot.revisions].sort((left, right) => right.version - left.version)[0]?.terms
  const currentTerms = previousTerms
    ? {...fallbackTerms, ...previousTerms, answers: {...fallbackTerms.answers, ...previousTerms.answers}}
    : fallbackTerms
  const contributorByField = new Map(
    (input.contributors || [])
      .filter((change) => change.updatedBy)
      .map((change) => [change.field, change.updatedBy]),
  )
  const termChanges = changedPilotFields(currentTerms, input.nextTerms, {
    at,
    by: input.actor,
  }).map((change) => ({
    ...change,
    updatedBy: contributorByField.get(change.field) || change.updatedBy,
  }))
  const changes = [...termChanges, ...(input.extraChanges || [])]
  const version = changes.length > 0 ? input.pilot.version + 1 : input.pilot.version
  const draft =
    changes.length > 0
      ? createPilotDraft({
          terms: input.nextTerms,
          baseVersion: version,
          actor: input.actor,
          at,
        })
      : input.pilot.draft
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
