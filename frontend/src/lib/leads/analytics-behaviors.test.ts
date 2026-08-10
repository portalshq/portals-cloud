import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_DESTINATION_LENGTH,
  cleanLabel,
  linkIsExternal,
  scrollBucket,
} from './analytics-behaviors'

test('scrollBucket returns the deepest reached threshold', () => {
  assert.equal(scrollBucket(0), null)
  assert.equal(scrollBucket(24), null)
  assert.equal(scrollBucket(25), 25)
  assert.equal(scrollBucket(49), 25)
  assert.equal(scrollBucket(50), 50)
  assert.equal(scrollBucket(74), 50)
  assert.equal(scrollBucket(90), 90)
  assert.equal(scrollBucket(100), 100)
})

test('scrollBucket clamps out-of-range depths', () => {
  assert.equal(scrollBucket(-10), null)
  assert.equal(scrollBucket(120), 100)
})

test('cleanLabel collapses whitespace and trims', () => {
  assert.equal(cleanLabel('  How do   reviews   work?  '), 'How do reviews work?')
  assert.equal(cleanLabel(''), '')
})

test('cleanLabel truncates to the configured maximum', () => {
  const long = 'x'.repeat(400)
  assert.equal(cleanLabel(long).length, 120)
  assert.equal(cleanLabel(long, 20).length, 20)
  assert.equal(cleanLabel(long, MAX_DESTINATION_LENGTH).length, 300)
})

test('linkIsExternal classifies relative, hash, and query links as internal', () => {
  const origin = 'https://portals.test'
  assert.equal(linkIsExternal('/paid-pilot', origin), false)
  assert.equal(linkIsExternal('/assessment?from=pricing#scope', origin), false)
  assert.equal(linkIsExternal('#faq', origin), false)
  assert.equal(linkIsExternal('?utm_source=x', origin), false)
})

test('linkIsExternal classifies other hosts and schemes as external', () => {
  const origin = 'https://portals.test'
  assert.equal(linkIsExternal('https://portals.test/roadmap', origin), false)
  assert.equal(linkIsExternal('https://calendly.com/portals', origin), true)
  assert.equal(linkIsExternal('mailto:leads@portals.test', origin), true)
  assert.equal(linkIsExternal('//cdn.portals.test/file.pdf', origin), true)
})