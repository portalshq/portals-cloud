import * as Automerge from '@automerge/automerge'
import type {SuccessCriterion} from './contracts'

export type PilotMutableTerms = {
  startDate: string | null
  valueConfirmed: boolean
  criteria: SuccessCriterion[]
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
}

export type PilotCommittedRevision = {
  pilotId: string
  version: number
  baseVersion: number
  committedAt: string
  committedBy?: string
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

type DraftDoc = {
  terms: PilotMutableTerms
  edits: Record<string, PilotDraftChange>
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

function fieldKind(field: string): 'structured' | 'text' {
  return field.endsWith('.target') || field.endsWith('.participant') || field.endsWith('.evidence')
    ? 'text'
    : 'structured'
}

function getField(terms: PilotMutableTerms, field: string): unknown {
  if (field === 'startDate') return terms.startDate || null
  if (field === 'valueConfirmed') return terms.valueConfirmed
  const match = field.match(/^criteria\.([^.]+)\.(status|target|participant|evidence)$/)
  if (!match) return undefined
  const criterion = criterionByKey(terms, match[1])
  return criterion?.[match[2] as keyof SuccessCriterion] || ''
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
  const keys = new Set([
    ...base.criteria.map((criterion) => criterion.key),
    ...next.criteria.map((criterion) => criterion.key),
  ])
  for (const key of keys) {
    const current = criterionByKey(next, key)
    const prior = criterionByKey(base, key)
    const source = current || prior
    if (!source) continue
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
  if (!draft?.automerge) return cloneTerms(fallback)
  try {
    const doc = Automerge.load<DraftDoc>(decode(draft.automerge))
    return cloneTerms(doc.terms || fallback)
  } catch {
    return cloneTerms(fallback)
  }
}

export function updatePilotDraft(input: {
  draft?: PilotCollaborativeDraft
  baseTerms: PilotMutableTerms
  baseVersion: number
  nextTerms: PilotMutableTerms
  actor?: string
  at?: string
}): PilotCollaborativeDraft {
  const at = input.at || new Date().toISOString()
  const existing =
    input.draft?.automerge
      ? Automerge.load<DraftDoc>(decode(input.draft.automerge), actorId(input.actor))
      : Automerge.from<DraftDoc>(
          {terms: cloneTerms(input.baseTerms), edits: {}},
          actorId(input.actor),
        )
  const changes = changedPilotFields(input.baseTerms, input.nextTerms, {
    at,
    by: input.actor,
  })
  const doc = Automerge.change(existing, 'pilot draft update', (draft) => {
    draft.terms = cloneTerms(input.nextTerms)
    draft.edits ||= {}
    for (const change of changes) {
      draft.edits[change.field] = change
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
