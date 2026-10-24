import assert from 'node:assert/strict'
import test from 'node:test'
import {validateAndNormalizeOffer} from './pilot-offers'

const now = new Date('2026-09-15T12:00:00.000Z')
const offer = {
  _id: 'offer-1',
  _rev: 'rev-1',
  slug: 'fast-start',
  basePackageSlug: 'studio-pilot',
  basePackageAmount: 5000,
  basePackageCurrency: 'USD',
  status: 'active' as const,
  startsAt: '2026-09-01T00:00:00.000Z',
  endsAt: '2026-10-01T00:00:00.000Z',
  pilotPriceAmount: 3750,
  pilotPriceLabel: '$3,750',
  annualCreditAmount: 5000,
  annualCreditLabel: '$5,000',
  pilotDurationDays: 21,
  annualCreditRedemptionPolicy: 'standard-pilot-conversion-window',
}

test('valid active offer keeps price and credit labels congruent with numeric terms', () => {
  const resolved = validateAndNormalizeOffer({...offer}, now)
  assert.equal(resolved.pilotPriceAmount, 3750)
  assert.equal(resolved.pilotPriceLabel, '$3,750')
})

test('expired and not-yet-active offers cannot resolve for new proposals', () => {
  assert.throws(() => validateAndNormalizeOffer({...offer, endsAt: now.toISOString()}, now), /outside its active window/)
  assert.throws(() => validateAndNormalizeOffer({...offer, startsAt: '2026-09-15T12:00:00.001Z'}, now), /outside its active window/)
})

test('offer cannot exceed the base package or carry a mismatched display label', () => {
  assert.throws(() => validateAndNormalizeOffer({...offer, pilotPriceAmount: 5001, pilotPriceLabel: '$5,001'}, now), /exceeds the published Studio Pilot price/)
  assert.throws(() => validateAndNormalizeOffer({...offer, pilotPriceLabel: '$3,700'}, now), /display labels do not match/)
  assert.throws(() => validateAndNormalizeOffer({...offer, annualCreditLabel: '€5,000'}, now), /display labels do not match/)
  assert.throws(() => validateAndNormalizeOffer({...offer, basePackageAmount: undefined}, now), /base price is missing/)
})
