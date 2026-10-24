import assert from 'node:assert/strict'
import test from 'node:test'
import {formatReadableDate} from './utils'

test('formatReadableDate returns null for undefined input', () => {
  assert.equal(formatReadableDate(undefined), null)
})

test('formatReadableDate returns null for null input', () => {
  assert.equal(formatReadableDate(null), null)
})

test('formatReadableDate returns null for empty string', () => {
  assert.equal(formatReadableDate(''), null)
})

test('formatReadableDate formats valid ISO date as DD Mon YYYY', () => {
  assert.equal(formatReadableDate('2026-01-15'), '15 Jan 2026')
  assert.equal(formatReadableDate('2025-12-31'), '31 Dec 2025')
  assert.equal(formatReadableDate('2024-06-01'), '01 Jun 2024')
})

test('formatReadableDate formats ISO datetimes by their calendar date', () => {
  assert.equal(formatReadableDate('2026-10-27T04:00:00.000Z'), '27 Oct 2026')
  assert.equal(formatReadableDate('2026-10-27T23:59:59.999Z'), '27 Oct 2026')
  assert.equal(formatReadableDate('2026-02-04T12:30:00+05:30'), '04 Feb 2026')
})

test('formatReadableDate handles invalid date by returning original string', () => {
  assert.equal(formatReadableDate('invalid-date'), 'invalid-date')
  assert.equal(formatReadableDate('not-a-date'), 'not-a-date')
})

test('formatReadableDate handles malformed date gracefully', () => {
  assert.equal(formatReadableDate('2026-13-01'), '2026-13-01')
  assert.equal(formatReadableDate('2026-01-32'), '2026-01-32')
})
