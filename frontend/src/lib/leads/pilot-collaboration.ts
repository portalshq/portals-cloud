import * as Automerge from '@automerge/automerge'
import type {SuccessCriterion} from './contracts'
import type {
  ConflictResolution,
  PilotCollaborativeDraft,
  PilotDraftChange,
  PilotDraftConflict,
  PilotMutableTerms,
} from './pilot-collaboration-types'
import {PILOT_DIRECT_ANSWER_FIELDS, PILOT_DIRECT_ANSWER_LABELS} from './pilot-room-fields'
export type {
  ConflictResolution,
  PilotCollaborativeDraft,
  PilotCommittedRevision,
  PilotDraftChange,
  PilotDraftConflict,
  PilotMutableTerms,
} from './pilot-collaboration-types'

type DraftDoc = {
  terms: PilotMutableTerms
  edits: Record<string, PilotDraftChange>
}

function assertServerRuntime(): void {
  if (typeof window !== 'undefined') {
    throw new Error('Pilot collaboration uses Automerge WebAssembly and must run on the server.')
  }
}

function encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

function decode(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64url'))
}

function actorId(actor?: string): string | undefined {
  if (!actor) return undefined
  const encoded = Buffer.from(actor).toString('hex')
  return encoded.length >= 32
    ? encoded.slice(0, 64)
    : encoded.padEnd(32, '0')
}

function cloneTerms(terms: PilotMutableTerms): PilotMutableTerms {
  return {
    startDate: terms.startDate || null,
    valueConfirmed: Boolean(terms.valueConfirmed),
    criteria: terms.criteria.map((criterion) => ({...criterion})),
    answers: {...terms.answers},
  }
}

function stableValue(value: unknown): unknown {
  if (value === undefined) return null
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        stableValue(entry),
      ]),
    )
  }
  return value
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right))
}

function criterionByKey(terms: PilotMutableTerms, key: string): SuccessCriterion | undefined {
  return terms.criteria.find((criterion) => criterion.key === key)
}

function fieldLabel(criterion: SuccessCriterion, property: keyof SuccessCriterion): string {
  const suffix: Partial<Record<keyof SuccessCriterion, string>> = {
    status: 'decision',
    target: 'measurable target',
    participant: 'participant',
    evidence: 'evidence',
  }
  return `${criterion.label} ${suffix[property] || String(property)}`
}

function fieldKind(_field: string): 'structured' | 'text' {
  // Room controls are scalar saves. Automerge safely merges disjoint paths; a
  // concurrent write to one control follows last saved value semantics.
  return 'structured'
}

function getField(terms: PilotMutableTerms, field: string): unknown {
  if (field === 'startDate') return terms.startDate || null
  if (field === 'valueConfirmed') return terms.valueConfirmed
  const answerMatch = field.match(/^answers\.([A-Za-z0-9_]+)$/)
  if (answerMatch) return terms.answers?.[answerMatch[1] as keyof typeof terms.answers] || ''
  const removalMatch = field.match(/^criteria\.([^.]+)\.__removed$/)
  if (removalMatch) return !criterionByKey(terms, removalMatch[1])
  const match = field.match(/^criteria\.([^.]+)\.(status|target|participant|evidence)$/)
  if (!match) return undefined
  const criterion = criterionByKey(terms, match[1])
  return criterion ? criterion[match[2] as keyof SuccessCriterion] || '' : undefined
}

function setField(terms: PilotMutableTerms, field: string, value: unknown): PilotMutableTerms {
  const next = cloneTerms(terms)
  if (field === 'startDate') {
    next.startDate = value ? String(value) : null
    return next
  }
  if (field === 'valueConfirmed') {
    next.valueConfirmed = Boolean(value)
    return next
  }
  const answerMatch = field.match(/^answers\.([A-Za-z0-9_]+)$/)
  if (answerMatch) {
    next.answers[answerMatch[1] as keyof typeof next.answers] = String(value || '')
    return next
  }
  const removalMatch = field.match(/^criteria\.([^.]+)\.__removed$/)
  if (removalMatch) {
    if (value) next.criteria = next.criteria.filter((criterion) => criterion.key !== removalMatch[1])
    return next
  }
  const match = field.match(/^criteria\.([^.]+)\.(status|target|participant|evidence)$/)
  if (!match) return next
  const [, key, property] = match
  next.criteria = next.criteria.map((criterion) =>
    criterion.key === key
      ? {...criterion, [property]: property === 'status' ? value : String(value || '')}
      : criterion,
  )
  return next
}

export function changedPilotFields(
  base: PilotMutableTerms,
  next: PilotMutableTerms,
  opts: {at?: string; by?: string} = {},
): PilotDraftChange[] {
  const at = opts.at || new Date().toISOString()
  const changes: PilotDraftChange[] = []
  const push = (field: string, label: string, value: unknown) => {
    if (sameValue(getField(base, field), value)) return
    changes.push({
      field,
      label,
      kind: fieldKind(field),
      value,
      updatedAt: at,
      updatedBy: opts.by,
    })
  }
  push('startDate', 'Pilot start date', next.startDate || null)
  push('valueConfirmed', 'Auditable value estimate', next.valueConfirmed)
  for (const field of PILOT_DIRECT_ANSWER_FIELDS) push(`answers.${field}`, PILOT_DIRECT_ANSWER_LABELS[field], next.answers?.[field] || '')
  const keys = new Set([
    ...base.criteria.map((criterion) => criterion.key),
    ...next.criteria.map((criterion) => criterion.key),
  ])
  for (const key of keys) {
    const current = criterionByKey(next, key)
    const prior = criterionByKey(base, key)
    const source = current || prior
    if (!source) continue
    if (!current && prior) {
      changes.push({
        field: `criteria.${key}.__removed`,
        label: `${prior.label} removed`,
        kind: 'structured',
        value: true,
        updatedAt: at,
        updatedBy: opts.by,
      })
      continue
    }
    push(`criteria.${key}.status`, fieldLabel(source, 'status'), current?.status || '')
    push(`criteria.${key}.target`, fieldLabel(source, 'target'), current?.target || '')
    push(`criteria.${key}.participant`, fieldLabel(source, 'participant'), current?.participant || '')
    push(`criteria.${key}.evidence`, fieldLabel(source, 'evidence'), current?.evidence || '')
  }
  return changes
}

export function createPilotDraft(input: {
  terms: PilotMutableTerms
  baseVersion: number
  actor?: string
  at?: string
}): PilotCollaborativeDraft {
  assertServerRuntime()
  const at = input.at || new Date().toISOString()
  const doc = Automerge.from<DraftDoc>(
    {
      terms: cloneTerms(input.terms),
      edits: {},
    },
    actorId(input.actor),
  )
  return {
    baseVersion: input.baseVersion,
    automerge: encode(Automerge.save(doc)),
    heads: Automerge.getHeads(doc),
    changes: [],
    updatedAt: at,
    updatedBy: input.actor,
  }
}

export function pilotTermsFromDraft(
  draft: PilotCollaborativeDraft | undefined,
  fallback: PilotMutableTerms,
): PilotMutableTerms {
  assertServerRuntime()
  if (!draft?.automerge) return cloneTerms(fallback)
  try {
    const doc = Automerge.load<DraftDoc>(decode(draft.automerge))
    const terms = cloneTerms(doc.terms || fallback)
    return {...terms, answers: {...fallback.answers, ...terms.answers}}
  } catch {
    return cloneTerms(fallback)
  }
}

export function updatePilotDraft(input: {
  draft?: PilotCollaborativeDraft
  baseTerms: PilotMutableTerms
  baseVersion: number
  nextTerms: PilotMutableTerms
  fieldPaths?: string[]
  actor?: string
  at?: string
}): PilotCollaborativeDraft {
  assertServerRuntime()
  const at = input.at || new Date().toISOString()
  const existing =
    input.draft?.automerge
      ? Automerge.load<DraftDoc>(decode(input.draft.automerge), actorId(input.actor))
      : Automerge.from<DraftDoc>(
          {terms: cloneTerms(input.baseTerms), edits: {}},
          actorId(input.actor),
        )
  const requested = input.fieldPaths ? new Set(input.fieldPaths) : null
  const currentDraftTerms = cloneTerms(existing.terms || input.baseTerms)
  const changes = changedPilotFields(requested ? currentDraftTerms : input.baseTerms, input.nextTerms, {
    at,
    by: input.actor,
  }).filter((change) => !requested || requested.has(change.field))
  const doc = Automerge.change(existing, 'pilot draft update', (draft) => {
    draft.edits ||= {}
    for (const change of changes) {
      if (change.field === 'startDate') {
        draft.terms.startDate = input.nextTerms.startDate || null
      } else if (change.field === 'valueConfirmed') {
        draft.terms.valueConfirmed = input.nextTerms.valueConfirmed
      } else if (change.field.startsWith('answers.')) {
        const field = change.field.slice('answers.'.length) as keyof typeof draft.terms.answers
        draft.terms.answers ||= {}
        draft.terms.answers[field] = input.nextTerms.answers[field] || ''
      } else {
        const removalMatch = change.field.match(/^criteria\.([^.]+)\.__removed$/)
        if (removalMatch) {
          const index = draft.terms.criteria.findIndex(
            (criterion) => criterion.key === removalMatch[1],
          )
          if (index >= 0) draft.terms.criteria.splice(index, 1)
        } else {
          const match = change.field.match(/^criteria\.([^.]+)\.(status|target|participant|evidence)$/)
          if (!match) continue
          const [, key, property] = match as [string, string, 'status' | 'target' | 'participant' | 'evidence']
          const nextCriterion = input.nextTerms.criteria.find((criterion) => criterion.key === key)
          if (nextCriterion) delete draft.edits[`criteria.${key}.__removed`]
          const index = draft.terms.criteria.findIndex((criterion) => criterion.key === key)
          if (index < 0) {
            if (nextCriterion) {
              draft.terms.criteria.push(JSON.parse(JSON.stringify(nextCriterion)) as SuccessCriterion)
            }
          } else if (nextCriterion) {
            if (property === 'status') {
              draft.terms.criteria[index].status = nextCriterion.status
            } else {
              const value = nextCriterion[property]
              if (value === undefined) delete draft.terms.criteria[index][property]
              else draft.terms.criteria[index][property] = value
            }
          }
        }
      }
      if (sameValue(getField(input.baseTerms, change.field), getField(input.nextTerms, change.field))) {
        delete draft.edits[change.field]
      } else {
        draft.edits[change.field] = change
      }
    }
  })
  return {
    baseVersion: input.draft?.baseVersion || input.baseVersion,
    automerge: encode(Automerge.save(doc)),
    heads: Automerge.getHeads(doc),
    changes: Object.values(doc.edits || {}),
    updatedAt: at,
    updatedBy: input.actor,
  }
}

function mergeText(baseValue: unknown, currentValue: unknown, mineValue: unknown): string {
  const base = String(baseValue || '')
  const current = String(currentValue || '')
  const mine = String(mineValue || '')
  if (current === mine) return current
  if (!current) return mine
  if (!mine) return current
  if (current.includes(mine)) return current
  if (mine.includes(current)) return mine
  if (base && current.startsWith(base) && mine.startsWith(base)) {
    const currentSuffix = current.slice(base.length)
    const mineSuffix = mine.slice(base.length)
    return `${base}${currentSuffix}${mineSuffix === currentSuffix ? '' : mineSuffix}`
  }
  return `${current}\n${mine}`
}

export function resolvePilotDraftCommit(input: {
  baseTerms: PilotMutableTerms
  currentTerms: PilotMutableTerms
  incomingTerms: PilotMutableTerms
  resolutions?: Record<string, ConflictResolution>
}): {
  terms: PilotMutableTerms
  conflicts: PilotDraftConflict[]
  appliedChanges: PilotDraftChange[]
} {
  let merged = cloneTerms(input.currentTerms)
  const conflicts: PilotDraftConflict[] = []
  const incomingChanges = changedPilotFields(input.baseTerms, input.incomingTerms)
  for (const change of incomingChanges) {
    const baseValue = getField(input.baseTerms, change.field)
    const currentValue = getField(input.currentTerms, change.field)
    const mineValue = getField(input.incomingTerms, change.field)
    const currentChanged = !sameValue(baseValue, currentValue)
    const currentDiffers = !sameValue(currentValue, mineValue)
    const resolution = input.resolutions?.[change.field]
    if (currentChanged && currentDiffers && resolution !== 'mine' && resolution !== 'current') {
      if (change.kind === 'text') {
        merged = setField(merged, change.field, mergeText(baseValue, currentValue, mineValue))
        continue
      }
      conflicts.push({
        field: change.field,
        label: change.label,
        kind: change.kind,
        baseValue,
        currentValue,
        mineValue,
      })
      continue
    }
    if (resolution === 'current') continue
    merged = setField(merged, change.field, mineValue)
  }
  return {
    terms: merged,
    conflicts,
    appliedChanges: changedPilotFields(input.currentTerms, merged),
  }
}
