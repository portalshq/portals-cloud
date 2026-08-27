import type {SuccessCriterion} from './contracts'
import type {PilotDirectAnswers} from './pilot-room-fields'

export type PilotMutableTerms = {
  startDate: string | null
  valueConfirmed: boolean
  criteria: SuccessCriterion[]
  answers: PilotDirectAnswers
}

export type PilotDraftChange = {
  field: string
  label: string
  kind: 'structured' | 'text'
  value: unknown
  updatedAt: string
  updatedBy?: string
}

export type PilotCollaborativeDraft = {
  baseVersion: number
  automerge: string
  heads: string[]
  changes: PilotDraftChange[]
  updatedAt: string
  updatedBy?: string
  submittedAt?: string
  submittedBy?: string
}

export type PilotCommittedRevision = {
  pilotId: string
  version: number
  baseVersion: number
  committedAt: string
  committedBy?: string
  submittedBy?: string
  terms: PilotMutableTerms
  changes: PilotDraftChange[]
}

export type PilotDraftConflict = {
  field: string
  label: string
  kind: 'structured' | 'text'
  baseValue: unknown
  currentValue: unknown
  mineValue: unknown
}

export type ConflictResolution = 'current' | 'mine'
