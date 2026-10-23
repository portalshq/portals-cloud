import assert from 'node:assert/strict'
import test from 'node:test'
import {resolvePrefilledIdentity} from './identity-prefill'
import type {KnownLeadContext} from './contracts'

const emptyContext: KnownLeadContext = {
  known: false,
  knownFields: [],
  knownAnswerFields: [],
}

const knownContext: KnownLeadContext = {
  known: true,
  knownFields: ['name', 'email', 'company', 'role'],
  knownAnswerFields: [],
  identity: {
    name: 'Test Producer',
    email: 'producer@studio.test',
    company: 'studio',
    role: 'production-operations',
  },
}

test('returns empty prefill when no source supplies identity', () => {
  const result = resolvePrefilledIdentity(emptyContext)
  assert.deepEqual(result, {identity: {}, fields: []})
})

test('groups server-known identity fields', () => {
  const result = resolvePrefilledIdentity(knownContext)
  assert.equal(result.identity.email, 'producer@studio.test')
  assert.equal(result.identity.name, 'Test Producer')
  assert.deepEqual(result.fields, ['email', 'name', 'company', 'role'])
})

test('groups client URL param identity the same way as server identity', () => {
  const result = resolvePrefilledIdentity(emptyContext, {
    urlParams: {
      email: 'lead@agency.test',
      name: 'Lead Person',
      company: 'agency',
    },
  })
  assert.equal(result.identity.email, 'lead@agency.test')
  assert.equal(result.identity.name, 'Lead Person')
  assert.equal(result.identity.company, 'agency')
  assert.deepEqual(result.fields, ['email', 'name', 'company'])
})

test('groups carried assessment answers like other sources', () => {
  const result = resolvePrefilledIdentity(emptyContext, {
    carriedAnswers: {
      email: 'applicant@studio.test',
      name: 'Applicant',
      pilotWorkflow: 'trailer localization',
    },
  })
  assert.equal(result.identity.email, 'applicant@studio.test')
  assert.equal(result.identity.name, 'Applicant')
  assert.deepEqual(result.fields, ['email', 'name'])
})

test('merges partial sources in precedence order context > carried > url', () => {
  const result = resolvePrefilledIdentity(knownContext, {
    carriedAnswers: {website: 'https://carried.test'},
    urlParams: {website: 'https://param.test', name: 'Param Name'},
  })
  // Context wins for name despite the URL param
  assert.equal(result.identity.name, 'Test Producer')
  // Carried wins for website over URL params
  assert.equal(result.identity.website, 'https://carried.test')
  assert.deepEqual(result.fields, [
    'email',
    'name',
    'company',
    'role',
    'website',
  ])
})

test('a conflicting URL param email disqualifies the server identity', () => {
  const result = resolvePrefilledIdentity(knownContext, {
    urlParams: {email: 'different@other.test'},
  })
  assert.equal(result.identity.email, 'different@other.test')
  // No other context fields leak into the asserted identity
  assert.equal(result.identity.name, undefined)
  assert.equal(result.identity.company, undefined)
  assert.deepEqual(result.fields, ['email'])
})

test('a matching URL param email keeps the server identity', () => {
  const result = resolvePrefilledIdentity(knownContext, {
    urlParams: {email: 'PRODUCER@studio.test'},
  })
  assert.equal(result.identity.name, 'Test Producer')
  assert.equal(result.identity.email, 'producer@studio.test')
})

test('a conflicting URL param email disqualifies carried answers too', () => {
  const result = resolvePrefilledIdentity(emptyContext, {
    carriedAnswers: {email: 'applicant@studio.test', name: 'Applicant'},
    urlParams: {email: 'invitee@other.test'},
  })
  assert.equal(result.identity.email, 'invitee@other.test')
  assert.equal(result.identity.name, undefined)
})

test('missing fields stay ungrouped so inputs still render', () => {
  const result = resolvePrefilledIdentity(knownContext, {
    urlParams: {website: 'https://studio.test'},
  })
  assert.equal(result.identity.website, 'https://studio.test')
  assert.ok(result.fields.includes('website'))
})
