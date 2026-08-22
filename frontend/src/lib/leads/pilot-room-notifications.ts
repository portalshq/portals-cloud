import type {SecurityDecision} from './contracts'
import type {ReviewerRole} from './pilot'
import type {PilotDraftChange} from './pilot-collaboration'
import {activePilotMemberEmails} from './application-auth'
import {normalizeEmail} from './identity'
import {enqueuePilotEmail, type StoredPilot} from './store'

export type PilotRoomSection =
  | 'scope'
  | 'commercial'
  | 'success_criteria'
  | 'security'
  | 'procurement'
  | 'signature'

export type PilotRoomEvent =
  | 'terms_changed'
  | 'team_review_started'
  | 'reviewer_invited'
  | 'change_requested'
  | 'security_change_requested'
  | 'pilot_terms_confirmed'
  | 'agreement_ready'
  | 'signed'
  | 'paid'
  | 'kickoff_scheduled'
  | 'pilot_active'

const ANSWER_SECTIONS: Record<string, PilotRoomSection> = {
  activeWorkflow: 'scope',
  pilotWorkflow: 'scope',
  productionOwner: 'scope',
  productionOwnerEmail: 'scope',
  participantsRange: 'scope',
  historicalProject: 'scope',
  integrationMethod: 'scope',
  integrationSystemsJson: 'scope',
  dataClassification: 'scope',
  annualDeploymentOption: 'commercial',
  annualPriceAcknowledged: 'commercial',
  approvalPath: 'commercial',
  budgetOwner: 'commercial',
  budgetReadiness: 'commercial',
  successCriterionKeysJson: 'success_criteria',
  successCriteria: 'success_criteria',
  securityRequirements: 'security',
  procurementPoRequired: 'procurement',
  procurementReviewTime: 'procurement',
  approverName: 'procurement',
  approverEmail: 'procurement',
  signerName: 'signature',
  signerEmail: 'signature',
}

const SECTION_VARIANTS: Record<PilotRoomSection, string> = {
  scope: 'scope_changed',
  commercial: 'commercial_changed',
  success_criteria: 'success_criteria_changed',
  security: 'security_changed',
  procurement: 'procurement_changed',
  signature: 'signature_changed',
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

function pushEmail(targets: Map<string, string>, email?: string | null, variant = 'terms_changed') {
  const normalized = email ? normalizeEmail(email) : ''
  if (!normalized || targets.has(normalized)) return
  targets.set(normalized, variant)
}

function reviewerEmails(pilot: StoredPilot, roles?: ReviewerRole[]): string[] {
  return pilot.reviewers
    .filter((reviewer) => reviewer.status !== 'revoked' && reviewer.email)
    .filter((reviewer) => !roles || roles.includes(reviewer.role))
    .map((reviewer) => reviewer.email)
}

async function roomMemberEmails(pilot: StoredPilot): Promise<string[]> {
  const portalsEmail = normalizeEmail(process.env.LEADS_NOTIFICATION_EMAIL || '')
  return [
    String(pilot.answers.email || ''),
    String(pilot.answers.signerEmail || ''),
    ...reviewerEmails(pilot),
    ...(await activePilotMemberEmails(pilot.id)),
  ].filter((email) => {
    const normalized = normalizeEmail(email)
    return normalized && normalized !== portalsEmail
  })
}

function sectionOwnerEmails(pilot: StoredPilot, section: PilotRoomSection): string[] {
  const answers = pilot.answers as Record<string, unknown>
  switch (section) {
    case 'scope':
      return [
        String(answers.productionOwnerEmail || ''),
        ...reviewerEmails(pilot, ['production_owner']),
      ]
    case 'commercial':
      return [
        String(answers.economicBuyerEmail || ''),
        ...reviewerEmails(pilot, ['economic_buyer']),
      ]
    case 'success_criteria':
      return [
        String(answers.economicBuyerEmail || ''),
        String(answers.technicalEvaluatorEmail || ''),
        ...reviewerEmails(pilot, ['economic_buyer', 'technical_evaluator']),
      ]
    case 'security':
      return reviewerEmails(pilot, ['security_reviewer'])
    case 'procurement':
      return [
        String(answers.approverEmail || ''),
        ...reviewerEmails(pilot, ['approver', 'procurement_reviewer']),
      ]
    case 'signature':
      return [
        String(answers.signerEmail || ''),
        ...reviewerEmails(pilot, ['signer']),
      ]
  }
}

export function pilotRoomSectionsForChanges(changes: PilotDraftChange[]): PilotRoomSection[] {
  const sections = new Set<PilotRoomSection>()
  for (const change of changes) {
    if (change.field === 'startDate') sections.add('scope')
    else if (change.field === 'valueConfirmed') sections.add('commercial')
    else if (change.field.startsWith('criteria.')) sections.add('success_criteria')
    else if (change.field.startsWith('answers.')) {
      const field = change.field.slice('answers.'.length)
      const section = ANSWER_SECTIONS[field]
      if (section) sections.add(section)
    } else if (change.field.startsWith('security.')) {
      sections.add('security')
    }
  }
  return [...sections]
}

export function changedPilotRoomFields(input: {
  before: StoredPilot
  after: {
    answers: Record<string, unknown>
    securityDecisions: SecurityDecision[]
  }
  at?: string
  by?: string
}): PilotDraftChange[] {
  const at = input.at || new Date().toISOString()
  const changes: PilotDraftChange[] = []
  const beforeAnswers = input.before.answers as Record<string, unknown>
  const afterAnswers = input.after.answers
  for (const field of Object.keys(ANSWER_SECTIONS)) {
    if (sameValue(beforeAnswers[field], afterAnswers[field])) continue
    changes.push({
      field: `answers.${field}`,
      label: field,
      kind: 'structured',
      value: afterAnswers[field] ?? null,
      updatedAt: at,
      updatedBy: input.by,
    })
  }
  if (!sameValue(input.before.securityDecisions, input.after.securityDecisions)) {
    changes.push({
      field: 'security.decisions',
      label: 'Security posture',
      kind: 'structured',
      value: input.after.securityDecisions,
      updatedAt: at,
      updatedBy: input.by,
    })
  }
  return changes
}

export async function notifyPilotRoomEvent(input: {
  pilot: StoredPilot
  event: PilotRoomEvent
  sections?: PilotRoomSection[]
  eventKey?: string
}): Promise<void> {
  const eventKey = input.eventKey || `${input.event}:${input.pilot.version}:${Date.now()}`
  const targets = new Map<string, string>()
  const ownerEmail = String(input.pilot.answers.email || '')
  const portalsEmail = String(process.env.LEADS_NOTIFICATION_EMAIL || '')

  if (input.event === 'terms_changed') {
    const sections = input.sections || []
    for (const email of await roomMemberEmails(input.pilot)) pushEmail(targets, email)
    const sectionVariant = sections.length === 1 ? SECTION_VARIANTS[sections[0]] : null
    if (sectionVariant) {
      for (const email of sectionOwnerEmails(input.pilot, sections[0])) {
        const normalized = email ? normalizeEmail(email) : ''
        if (normalized) targets.set(normalized, sectionVariant)
      }
    }
  } else {
    pushEmail(targets, ownerEmail, input.event)
    if (
      [
        'team_review_started',
        'reviewer_invited',
        'security_change_requested',
        'pilot_terms_confirmed',
        'agreement_ready',
        'signed',
        'paid',
        'kickoff_scheduled',
        'pilot_active',
      ].includes(input.event)
    ) {
      pushEmail(targets, portalsEmail, input.event)
    }
  }

  await Promise.all(
    [...targets.entries()].map(([email, variant]) =>
      enqueuePilotEmail(input.pilot.id, variant, email, eventKey),
    ),
  )
}
