import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ApolloRequestError,
  apolloCustomFieldId,
  apolloSourceUrl,
  contactFields,
  finalOperationalList,
  isDeletedApolloContactError,
  mapDealRoles,
  nextAutomatedLifecycle,
  prospectAccount,
  qualificationState,
} from './crm'

test('contact fields preserve active workflow categories and the primary workflow narrative', () => {
  const fields = contactFields({
    id: 'submission-1',
    tier: 'medium',
    identity: {},
    profile: {
      firstTouch: {sourcePage: '/assessment'},
      lastTouch: {sourcePage: '/assessment'},
      marketingConsent: false,
      marketingSuppressed: false,
      analyticsConsent: false,
    },
    response: {nextAction: 'use_case'},
    request: {
      submissionType: 'assessment',
      attribution: {sourcePage: '/assessment'},
      answers: {
        activeWorkflows: ['character-continuity', 'production-handoff'],
        activeWorkflow: 'A live character campaign moving from image generation into video.',
      },
    },
  } as any)

  assert.deepEqual(fields.active_workflows, ['character-continuity', 'production-handoff'])
  assert.equal(fields.active_workflow, 'A live character campaign moving from image generation into video.')
})

const rank = {
  nurture: 0,
  qualified: 1,
  requested: 2,
  paid: 3,
  customer: 4,
}

test('a higher automated qualification replaces stale lower lists', () => {
  assert.equal(finalOperationalList(['nurture'], 'qualified', rank), 'qualified')
})

test('automated intake cannot demote a commercial company', () => {
  assert.equal(finalOperationalList(['paid'], 'nurture', rank), 'paid')
  assert.equal(finalOperationalList(['customer'], 'requested', rank), 'customer')
})

test('the furthest existing state wins when stale memberships coexist', () => {
  assert.equal(
    finalOperationalList(['nurture', 'qualified', 'paid'], 'requested', rank),
    'paid',
  )
})

test('automated lifecycle updates only promote pre-commercial stages', () => {
  assert.equal(nextAutomatedLifecycle(undefined, 'Captured Lead'), 'Captured Lead')
  assert.equal(nextAutomatedLifecycle('Captured Lead', 'Qualified'), 'Qualified')
  assert.equal(nextAutomatedLifecycle('Qualified', 'Assessed'), undefined)
  assert.equal(nextAutomatedLifecycle('Paid Pilot', 'Pilot Requested'), undefined)
  assert.equal(nextAutomatedLifecycle('Nurture', 'Qualified'), undefined)
})

test('qualification state collapses default outcomes into not qualified', () => {
  const base = {request: {submissionType: 'assessment'}}
  assert.equal(qualificationState({...base, tier: undefined} as any), 'not_qualified')
  assert.equal(qualificationState({...base, tier: 'low'} as any), 'not_qualified')
  assert.equal(qualificationState({...base, tier: 'medium'} as any), 'not_qualified')
  assert.equal(qualificationState({...base, tier: 'high'} as any), 'qualified')
})

test('pilot requests are treated as qualified sales motions', () => {
  assert.equal(
    qualificationState({request: {submissionType: 'pilot_request'}, tier: 'low'} as any),
    'qualified',
  )
})

test('Apollo typed custom fields use the raw ID from a namespaced Fields response', () => {
  assert.equal(apolloCustomFieldId('contact.6a7f290879cc0a0014c48989'), '6a7f290879cc0a0014c48989')
  assert.equal(apolloCustomFieldId('account.6a7f290d749b88001036a9d4'), '6a7f290d749b88001036a9d4')
  assert.equal(apolloCustomFieldId('6a7f290879cc0a0014c48989'), '6a7f290879cc0a0014c48989')
})

test('Apollo source fields receive canonical production URLs', () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL
  process.env.NEXT_PUBLIC_SITE_URL = 'https://portals.works'
  assert.equal(apolloSourceUrl('/assessment?from=guide#scope'), 'https://portals.works/assessment?from=guide#scope')
  assert.equal(apolloSourceUrl('https://example.com/referrer'), 'https://example.com/referrer')
  process.env.NEXT_PUBLIC_SITE_URL = previous
})

test('prospect accounts require a company and non-public company domain', () => {
  const submission = {
    identity: {company: 'Example Studio'},
    profile: {companyDomain: 'example.studio'},
  } as any
  assert.deepEqual(prospectAccount(submission), {name: 'Example Studio', domain: 'example.studio'})
  assert.equal(prospectAccount({...submission, profile: {companyDomain: 'gmail.com'}}), null)
  assert.equal(prospectAccount({...submission, identity: {company: ''}}), null)
})

test('Apollo deleted-contact errors are recognized as stale mappings', () => {
  const deleted = new ApolloRequestError({
    method: 'PATCH',
    path: '/api/v1/contacts/abc',
    status: 422,
    bodyText: '{"error":"Cannot update contact as it is deleted.","deleted_contact_ids":["abc"]}',
  })
  const gone = new ApolloRequestError({
    method: 'PATCH',
    path: '/api/v1/contacts/abc',
    status: 410,
    bodyText: '',
  })
  const missing = new ApolloRequestError({
    method: 'PATCH',
    path: '/api/v1/contacts/abc',
    status: 404,
    bodyText: '',
  })
  const validation = new ApolloRequestError({
    method: 'PATCH',
    path: '/api/v1/contacts/abc',
    status: 422,
    bodyText: '{"error":"email is invalid"}',
  })
  const accountMissing = new ApolloRequestError({
    method: 'PATCH',
    path: '/api/v1/accounts/abc',
    status: 404,
    bodyText: '',
  })
  assert.equal(isDeletedApolloContactError(deleted, 'abc'), true)
  assert.equal(isDeletedApolloContactError(gone, 'abc'), true)
  assert.equal(isDeletedApolloContactError(missing, 'abc'), true)
  assert.equal(isDeletedApolloContactError(validation, 'abc'), false)
  assert.equal(isDeletedApolloContactError(accountMissing, 'abc'), false)
  assert.equal(isDeletedApolloContactError(new Error('rate limit'), 'abc'), false)
})

test('deal role mapping includes identity as Initial Contact when present', () => {
  const submission = {
    identity: {name: 'Jane Doe', email: 'jane@example.com'},
    request: {answers: {}},
  } as any
  const roles = mapDealRoles(submission)
  assert.equal(roles.length, 1)
  assert.equal(roles[0].role, 'Initial Contact')
  assert.equal(roles[0].name, 'Jane Doe')
  assert.equal(roles[0].email, 'jane@example.com')
})

test('deal role mapping includes production owner as Project Manager when email present', () => {
  const submission = {
    identity: {name: 'Jane Doe', email: 'jane@example.com'},
    request: {
      answers: {
        productionOwner: 'John Smith',
        productionOwnerEmail: 'john@example.com',
      },
    },
  } as any
  const roles = mapDealRoles(submission)
  assert.equal(roles.length, 2)
  assert.equal(roles[1].role, 'Project Manager')
  assert.equal(roles[1].name, 'John Smith')
  assert.equal(roles[1].email, 'john@example.com')
})

test('deal role mapping excludes production owner without email', () => {
  const submission = {
    identity: {name: 'Jane Doe', email: 'jane@example.com'},
    request: {
      answers: {
        productionOwner: 'John Smith',
      },
    },
  } as any
  const roles = mapDealRoles(submission)
  assert.equal(roles.length, 1)
  assert.equal(roles[0].role, 'Initial Contact')
})

test('deal role mapping includes economic buyer as Buyer when email present', () => {
  const submission = {
    identity: {name: 'Jane Doe', email: 'jane@example.com'},
    request: {
      answers: {
        economicBuyer: 'Sarah Johnson',
        economicBuyerEmail: 'sarah@example.com',
      },
    },
  } as any
  const roles = mapDealRoles(submission)
  assert.equal(roles.length, 2)
  assert.equal(roles[1].role, 'Buyer')
  assert.equal(roles[1].name, 'Sarah Johnson')
  assert.equal(roles[1].email, 'sarah@example.com')
})

test('deal role mapping includes technical evaluator as Evaluator when email present', () => {
  const submission = {
    identity: {name: 'Jane Doe', email: 'jane@example.com'},
    request: {
      answers: {
        technicalEvaluator: 'Mike Chen',
        technicalEvaluatorEmail: 'mike@example.com',
      },
    },
  } as any
  const roles = mapDealRoles(submission)
  assert.equal(roles.length, 2)
  assert.equal(roles[1].role, 'Evaluator')
  assert.equal(roles[1].name, 'Mike Chen')
  assert.equal(roles[1].email, 'mike@example.com')
})

test('deal role mapping includes approver as Decision Maker when email present', () => {
  const submission = {
    identity: {name: 'Jane Doe', email: 'jane@example.com'},
    request: {
      answers: {
        approverName: 'Alex Turner',
        approverEmail: 'alex@example.com',
      },
    },
  } as any
  const roles = mapDealRoles(submission)
  assert.equal(roles.length, 2)
  assert.equal(roles[1].role, 'Decision Maker')
  assert.equal(roles[1].name, 'Alex Turner')
  assert.equal(roles[1].email, 'alex@example.com')
})

test('deal role mapping includes signer as Contract Signer when email present', () => {
  const submission = {
    identity: {name: 'Jane Doe', email: 'jane@example.com'},
    request: {
      answers: {
        signerName: 'Pat Wilson',
        signerEmail: 'pat@example.com',
      },
    },
  } as any
  const roles = mapDealRoles(submission)
  assert.equal(roles.length, 2)
  assert.equal(roles[1].role, 'Contract Signer')
  assert.equal(roles[1].name, 'Pat Wilson')
  assert.equal(roles[1].email, 'pat@example.com')
})

test('deal role mapping returns empty array when no identity', () => {
  const submission = {
    identity: {},
    request: {answers: {}},
  } as any
  const roles = mapDealRoles(submission)
  assert.equal(roles.length, 0)
})
