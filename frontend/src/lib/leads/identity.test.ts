import assert from 'node:assert/strict'
import test from 'node:test'
import {companyDomain, normalizeDomain, validateIdentityForCapture} from './identity'

test('business email determines company identity without a website', () => {
  const identity = {
    email: 'Person@Studio.Example',
    company: 'Studio',
    role: 'producer',
    website: '',
  }
  assert.equal(validateIdentityForCapture(identity), null)
  assert.equal(companyDomain(identity), 'studio.example')
})

test('public email requires and uses a company website', () => {
  const missingWebsite = {
    email: 'person@gmail.com',
    company: 'Studio',
    role: 'producer',
    website: '',
  }
  assert.match(validateIdentityForCapture(missingWebsite) || '', /website is required/)

  const identity = {...missingWebsite, website: 'https://www.studio.example/work'}
  assert.equal(validateIdentityForCapture(identity), null)
  assert.equal(companyDomain(identity), 'studio.example')
})

test('domain normalization strips only the conventional www prefix', () => {
  assert.equal(normalizeDomain('WWW.Example.com/path'), 'example.com')
  assert.equal(normalizeDomain('studio.example.com'), 'studio.example.com')
})
