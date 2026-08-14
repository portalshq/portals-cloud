import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ApolloRequestError,
  finalOperationalList,
  isDeletedApolloContactError,
  nextAutomatedLifecycle,
  qualificationState,
} from './crm'

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
