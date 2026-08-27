import assert from 'node:assert/strict'
import test from 'node:test'
process.env.LEADS_DRY_RUN = 'true'
import {
  buildSecurityDecisions,
  buildSuccessCriteria,
  classifyPilot,
  computeUnresolved,
} from './pilot'
import {
  attachSubmissionToPilot,
  createPilotRecord,
  getPilotById,
  getPilotByPaymentSession,
  takeDueOutbox,
  updatePilot,
} from './store'
import {
  createPilotDraft,
  pilotTermsFromDraft,
  resolvePilotDraftCommit,
  updatePilotDraft,
  type PilotMutableTerms,
} from './pilot-collaboration'
import {
  changedPilotRoomFields,
  notifyPilotRoomEvent,
  pilotRoomSectionsForChanges,
} from './pilot-room-notifications'
import {
  commitPilotTermRevision,
  pilotMutableTermsFromState,
} from './pilot-room-revisions'
import {ensurePilotRecipientAccess} from './application-auth'

process.env.LEADS_NOTIFICATION_EMAIL = 'ops@portals.test'

const eligible = {
  email: 'ava@studio.example',
  company: 'Studio Example',
  pilotWorkflow: 'campaign variant production',
  productionOwner: 'Ava Nguyen, Senior Producer',
  approvalPath: 'self',
  annualDeploymentOption: 'studio',
  annualPriceAcknowledged: true,
  participantsRange: '2-4',
  dataClassification: 'confidential',
  signerName: 'Ava Nguyen',
  signerEmail: 'ava@studio.example',
  integrationMethod: 'manual-upload',
  exactReproductionRequired: false,
}

async function createEligiblePilot() {
  const submissionId = `submission-${crypto.randomUUID()}`
  const answers = {...eligible}
  const classification = classifyPilot(answers)
  const criteria = buildSuccessCriteria(answers)
  const security = buildSecurityDecisions(answers)
  const unresolved = computeUnresolved(answers, {route: classification.route})
  const pilot = await createPilotRecord({
    profileId: `profile-${crypto.randomUUID()}`,
    initialSubmissionId: submissionId,
    answers,
    route: classification.route,
    state: 'reviewing',
    exceptions: classification.exceptions,
    unresolved,
    successCriteria: criteria,
    securityDecisions: security,
  })
  await attachSubmissionToPilot(submissionId, pilot.id)
  return pilot
}

test('the room flow confirms, finalizes, signs, pays, kickoffs, and activates', async () => {
  const pilot = await createEligiblePilot()
  assert.equal(pilot.state, 'reviewing')
  assert.equal(pilot.route, 'zero-call')

  const confirmed = await updatePilot(pilot.id, {
    state: 'scope_confirmed',
    resolvedStartDate: '2026-09-01',
    unresolved: computeUnresolved(pilot.answers, {
      startDate: '2026-09-01',
      route: 'zero-call',
    }),
  })
  assert.equal(confirmed.unresolved.length, 0)
  assert.equal(confirmed.state, 'scope_confirmed')

  const finalized = await updatePilot(pilot.id, {state: 'ready_sign'})
  assert.equal(finalized.state, 'ready_sign')

  const signed = await updatePilot(pilot.id, {
    state: 'signed',
    signing: {
      name: 'Ava Nguyen',
      email: 'ava@studio.example',
      signedAt: new Date().toISOString(),
      consented: true,
    },
  })
  assert.equal(signed.signing.name, 'Ava Nguyen')

  const paid = await updatePilot(pilot.id, {state: 'paid', payment: {provider: 'manual', paidAt: new Date().toISOString()}})
  assert.equal(paid.payment.provider, 'manual')

  const kickoff = await updatePilot(pilot.id, {state: 'kickoff', kickoff: {scheduledAt: new Date().toISOString()}})
  assert.equal(kickoff.state, 'kickoff')

  const active = await updatePilot(pilot.id, {state: 'active', historyNote: 'pilot activated'})
  assert.equal(active.state, 'active')
  assert.ok(active.history.some((entry) => entry.note === 'pilot activated'))

  const reloaded = await getPilotById(pilot.id)
  assert.equal(reloaded?.state, 'active')
  assert.equal(reloaded?.answers.company, 'Studio Example')
})

test('an unresolved start date blocks confirmation', async () => {
  const pilot = await createEligiblePilot()
  const unresolved = computeUnresolved(pilot.answers, {route: 'zero-call'})
  assert.ok(unresolved.some((item) => item.key === 'start-date'))
  assert.ok(pilot.unresolved.some((item) => item.key === 'start-date'))
})

test('signing records identity and consent, and history is appended', async () => {
  const pilot = await createEligiblePilot()
  const signed = await updatePilot(pilot.id, {
    state: 'signed',
    signing: {name: 'Ava Nguyen', email: 'ava@studio.example', consented: true, signedAt: new Date().toISOString()},
    historyNote: 'signed by Ava Nguyen (ava@studio.example)',
    by: 'ava@studio.example',
  })
  assert.ok(signed.history.length >= 2)
  const latest = signed.history[signed.history.length - 1]
  assert.equal(latest.action, 'system')
  assert.equal(latest.by, 'ava@studio.example')
})

test('a payment session id finds the pilot record', async () => {
  const pilot = await createEligiblePilot()
  const sessionId = `cs_test_${pilot.id}`
  await updatePilot(pilot.id, {
    state: 'paid',
    payment: {sessionId, paidAt: new Date().toISOString()},
  })
  const found = await getPilotByPaymentSession(sessionId)
  assert.equal(found?.id, pilot.id)
  assert.equal(found?.state, 'paid')
  assert.equal(await getPilotByPaymentSession('cs_test_missing'), null)
})

test('creating a pilot seeds proposed reviewers from the answers', async () => {
  const pilot = await createEligiblePilot()
  assert.deepEqual(
    pilot.reviewers.map((reviewer) => reviewer.role),
    ['production_owner', 'economic_buyer', 'technical_evaluator', 'signer'],
  )
  assert.ok(pilot.reviewers.every((reviewer) => reviewer.status === 'proposed'))
  assert.ok(pilot.reviewers.every((reviewer) => reviewer.versionSeen === 1))
  const signer = pilot.reviewers.find((reviewer) => reviewer.role === 'signer')
  assert.equal(signer?.email, 'ava@studio.example')
  assert.equal(pilot.version, 1)
  assert.equal(pilot.draft?.baseVersion, 1)
  assert.equal(pilot.revisions[0]?.version, 1)
  assert.equal(pilot.revisions[0]?.terms.criteria.length, pilot.successCriteria.length)
})

test('version bumps leave stale reviewers flagged for reconfirmation', async () => {
  const pilot = await createEligiblePilot()
  const bumped = await updatePilot(pilot.id, {version: 2, historyNote: 'material revision'})
  assert.equal(bumped.version, 2)
  assert.ok(bumped.reviewers.every((reviewer) => reviewer.versionSeen < bumped.version))
  const reloaded = await getPilotById(pilot.id)
  assert.equal(reloaded?.version, 2)
  assert.ok(reloaded?.history.some((entry) => entry.note === 'material revision'))
})

test('reviewer decisions persist status and change requests', async () => {
  const pilot = await createEligiblePilot()
  const buyer = pilot.reviewers.find((reviewer) => reviewer.role === 'economic_buyer')
  assert.ok(buyer)
  const updated = await updatePilot(pilot.id, {
    reviewers: pilot.reviewers.map((reviewer) =>
      reviewer.id === buyer.id
        ? {...reviewer, status: 'reviewed', reviewedAt: new Date().toISOString(), requestedChanges: true, versionSeen: pilot.version}
        : reviewer,
    ),
  })
  const reloaded = await getPilotById(pilot.id)
  const buyerAfter = reloaded?.reviewers.find((reviewer) => reviewer.id === buyer.id)
  assert.equal(buyerAfter?.status, 'reviewed')
  assert.equal(buyerAfter?.requestedChanges, true)
  assert.equal(updated.history.length, pilot.history.length)
})

test('collaborative draft records working changes without committing a revision', () => {
  const base: PilotMutableTerms = {
    startDate: null,
    valueConfirmed: false,
    criteria: buildSuccessCriteria(eligible),
  }
  const draft = createPilotDraft({terms: base, baseVersion: 1, actor: 'ava@studio.example'})
  const updated = updatePilotDraft({
    draft,
    baseTerms: base,
    baseVersion: 1,
    nextTerms: {...base, startDate: '2026-09-01'},
    actor: 'ava@studio.example',
  })
  const terms = pilotTermsFromDraft(updated, base)
  assert.equal(updated.baseVersion, 1)
  assert.equal(updated.changes.some((change) => change.field === 'startDate'), true)
  assert.equal(terms.startDate, '2026-09-01')
})

test('collaborative draft preserves concurrent edits to different fields', () => {
  const base: PilotMutableTerms = {
    startDate: null,
    valueConfirmed: false,
    criteria: buildSuccessCriteria(eligible),
  }
  const first = updatePilotDraft({
    draft: createPilotDraft({terms: base, baseVersion: 1, actor: 'ava@studio.example'}),
    baseTerms: base,
    baseVersion: 1,
    nextTerms: {...base, startDate: '2026-09-01'},
    actor: 'ava@studio.example',
  })
  const second = updatePilotDraft({
    draft: first,
    baseTerms: base,
    baseVersion: 1,
    nextTerms: {...base, valueConfirmed: true},
    actor: 'maya@studio.example',
  })
  const terms = pilotTermsFromDraft(second, base)
  assert.equal(terms.startDate, '2026-09-01')
  assert.equal(terms.valueConfirmed, true)
})

test('draft commit preserves concurrent changes to different structured fields', () => {
  const base: PilotMutableTerms = {
    startDate: null,
    valueConfirmed: false,
    criteria: buildSuccessCriteria(eligible),
  }
  const current = {...base, startDate: '2026-09-01'}
  const incoming = {...base, valueConfirmed: true}
  const resolved = resolvePilotDraftCommit({
    baseTerms: base,
    currentTerms: current,
    incomingTerms: incoming,
  })
  assert.equal(resolved.conflicts.length, 0)
  assert.equal(resolved.terms.startDate, '2026-09-01')
  assert.equal(resolved.terms.valueConfirmed, true)
})

test('draft commit detects concurrent changes to the same structured field', () => {
  const base: PilotMutableTerms = {
    startDate: null,
    valueConfirmed: false,
    criteria: buildSuccessCriteria(eligible),
  }
  const resolved = resolvePilotDraftCommit({
    baseTerms: base,
    currentTerms: {...base, startDate: '2026-09-01'},
    incomingTerms: {...base, startDate: '2026-10-01'},
  })
  assert.equal(resolved.conflicts.length, 1)
  assert.equal(resolved.conflicts[0].field, 'startDate')
})

test('draft commit merges concurrent collaborative text changes', () => {
  const criteria = buildSuccessCriteria(eligible)
  const key = criteria[0].key
  const base: PilotMutableTerms = {
    startDate: null,
    valueConfirmed: false,
    criteria,
  }
  const current: PilotMutableTerms = {
    ...base,
    criteria: criteria.map((criterion) =>
      criterion.key === key ? {...criterion, target: 'retrieve approved assets'} : criterion,
    ),
  }
  const incoming: PilotMutableTerms = {
    ...base,
    criteria: criteria.map((criterion) =>
      criterion.key === key ? {...criterion, target: 'under one minute'} : criterion,
    ),
  }
  const resolved = resolvePilotDraftCommit({baseTerms: base, currentTerms: current, incomingTerms: incoming})
  const merged = resolved.terms.criteria.find((criterion) => criterion.key === key)?.target || ''
  assert.equal(resolved.conflicts.length, 0)
  assert.match(merged, /retrieve approved assets/)
  assert.match(merged, /under one minute/)
})

test('committing pilot term revisions appends history and resets the collaborative draft', () => {
  const pilotTerms = {
    startDate: null,
    valueConfirmed: false,
    criteria: buildSuccessCriteria(eligible),
  }
  const pilot = {
    id: 'pilot-revision-helper',
    version: 1,
    resolvedStartDate: null,
    proposal: null,
    successCriteria: pilotTerms.criteria,
    revisions: [
      {
        pilotId: 'pilot-revision-helper',
        version: 1,
        baseVersion: 0,
        committedAt: '2026-08-01T00:00:00.000Z',
        terms: pilotTerms,
        changes: [],
      },
    ],
    draft: createPilotDraft({
      terms: {...pilotTerms, startDate: '2026-09-01'},
      baseVersion: 1,
      actor: 'ava@studio.example',
    }),
  }
  const nextTerms: PilotMutableTerms = {
    ...pilotTerms,
    startDate: '2026-09-01',
    valueConfirmed: true,
  }

  const committed = commitPilotTermRevision({
    pilot: pilot as Parameters<typeof commitPilotTermRevision>[0]['pilot'],
    nextTerms,
    actor: 'ava@studio.example',
    baseVersion: 1,
    at: '2026-08-02T00:00:00.000Z',
  })

  assert.equal(committed.version, 2)
  assert.equal(committed.draft?.baseVersion, 2)
  assert.equal(committed.draft?.changes.length, 0)
  assert.equal(committed.revisions.length, 2)
  assert.equal(committed.revisions[1].version, 2)
  assert.deepEqual(pilotTermsFromDraft(committed.draft, pilotTerms), nextTerms)
  assert.deepEqual(
    committed.changes.map((change) => change.field),
    ['startDate', 'valueConfirmed'],
  )
})

test('draft autosaves do not queue pilot-room notification emails', async () => {
  const pilot = await createEligiblePilot()
  const base = pilotMutableTermsFromState(pilot)
  const draft = updatePilotDraft({
    draft: pilot.draft,
    baseTerms: base,
    baseVersion: pilot.version,
    nextTerms: {...base, startDate: '2026-09-01'},
    actor: 'ava@studio.example',
  })

  await updatePilot(pilot.id, {draft})

  const queued = (await takeDueOutbox()).filter((row) => row.action_key.startsWith(`${pilot.id}:`))
  assert.deepEqual(queued, [])
})

test('pilot-room term notifications dedupe recipients and route section owners', async () => {
  const pilot = await createEligiblePilot()
  await ensurePilotRecipientAccess({
    pilotId: pilot.id,
    email: 'participant@studio.example',
    displayName: 'Participant',
    pilotRole: 'participant',
  })
  const updated = await updatePilot(pilot.id, {
    answers: {
      ...pilot.answers,
      signerEmail: 'signer@studio.example',
    },
    reviewers: pilot.reviewers.map((reviewer) =>
      reviewer.role === 'production_owner'
        ? {
            ...reviewer,
            email: 'owner.section@studio.example',
            status: 'invited' as const,
          }
        : reviewer,
    ),
  })
  const changes = [
    {
      field: 'startDate',
      label: 'Pilot start date',
      kind: 'structured' as const,
      value: '2026-09-01',
      updatedAt: '2026-08-02T00:00:00.000Z',
    },
  ]

  await notifyPilotRoomEvent({
    pilot: updated,
    event: 'terms_changed',
    sections: pilotRoomSectionsForChanges(changes),
    eventKey: 'terms-event-one',
  })
  await notifyPilotRoomEvent({
    pilot: updated,
    event: 'terms_changed',
    sections: pilotRoomSectionsForChanges(changes),
    eventKey: 'terms-event-one',
  })
  await notifyPilotRoomEvent({
    pilot: updated,
    event: 'terms_changed',
    sections: pilotRoomSectionsForChanges(changes),
    eventKey: 'terms-event-two',
  })

  const queued = (await takeDueOutbox()).filter((row) => row.action_key.startsWith(`${pilot.id}:`))
  assert.equal(
    queued.filter((row) => row.action_key.includes(':event:terms-event-one')).length,
    4,
    'one event queues owner, participant, signer, and section owner once each',
  )
  assert.equal(
    queued.filter((row) => row.action_key.includes(':event:terms-event-two')).length,
    4,
    'a distinct event key queues the same committed change again',
  )
  assert.ok(
    queued.some((row) =>
      row.action_key.includes(':pilot_email:scope_changed:owner.section@studio.example:event:terms-event-one'),
    ),
    'the scope section owner gets the section-specific variant',
  )
  assert.ok(
    queued.some((row) =>
      row.action_key.includes(':pilot_email:terms_changed:participant@studio.example:event:terms-event-one'),
    ),
    'shared room members get the general term-change variant',
  )
  assert.equal(
    queued.some((row) => row.action_key.includes('ops@portals.test')),
    false,
    'the Portals inbox is not included in general term-change member sends',
  )
})

test('pilot-room stage notifications route owner and Portals only once per recipient', async () => {
  const pilot = await createEligiblePilot()

  await notifyPilotRoomEvent({
    pilot,
    event: 'reviewer_invited',
    eventKey: 'reviewer-stage-one',
  })
  await notifyPilotRoomEvent({
    pilot,
    event: 'reviewer_invited',
    eventKey: 'reviewer-stage-one',
  })

  const queued = (await takeDueOutbox()).filter((row) => row.action_key.startsWith(`${pilot.id}:`))
  assert.deepEqual(
    queued.map((row) => row.action_key).sort(),
    [
      `${pilot.id}:pilot_email:reviewer_invited:ava@studio.example:event:reviewer-stage-one`,
      `${pilot.id}:pilot_email:reviewer_invited:ops@portals.test:event:reviewer-stage-one`,
    ],
  )
})

test('pilot room field changes map full-form revisions to notification sections', async () => {
  const pilot = await createEligiblePilot()
  const changes = changedPilotRoomFields({
    before: pilot,
    after: {
      answers: {
        ...pilot.answers,
        pilotWorkflow: 'asset variant production',
        annualDeploymentOption: 'enterprise',
        securityRequirements: 'security review required',
        approverEmail: 'approver@studio.example',
        signerEmail: 'signer@studio.example',
      },
      securityDecisions: [
        ...pilot.securityDecisions,
        {key: 'custom', label: 'Custom review', decision: 'exception', note: ''},
      ],
    },
  })

  assert.deepEqual(
    pilotRoomSectionsForChanges(changes).sort(),
    ['commercial', 'procurement', 'scope', 'security', 'signature'],
  )
})
