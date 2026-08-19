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

test('public email domains are rejected', () => {
  const publicEmail = {
    email: 'person@gmail.com',
    company: 'Studio',
    role: 'producer',
    website: '',
  }
  assert.match(validateIdentityForCapture(publicEmail) || '', /company email domain is required/)

  // Even with a website, public email is now rejected
  const withWebsite = {...publicEmail, website: 'https://www.studio.example/work'}
  assert.match(validateIdentityForCapture(withWebsite) || '', /company email domain is required/)
})

test('domain normalization strips only the conventional www prefix', () => {
  assert.equal(normalizeDomain('WWW.Example.com/path'), 'example.com')
  assert.equal(normalizeDomain('studio.example.com'), 'studio.example.com')
})
