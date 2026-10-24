import assert from 'node:assert/strict'
import test from 'node:test'
import {pricingMismatch} from './pricing-congruence'

const annualExpected = {amount: 900000, currency: 'usd', interval: 'year'}

test('matching recurring Stripe price passes', () => {
  assert.equal(pricingMismatch({unit_amount: 900000, currency: 'usd', recurring: {interval: 'year', interval_count: 1}}, annualExpected), null)
})

test('pricing comparison reports amount, currency, and recurring interval mismatches', () => {
  assert.equal(pricingMismatch({unit_amount: 899900, currency: 'usd', recurring: {interval: 'year', interval_count: 1}}, annualExpected), 'amount differs')
  assert.equal(pricingMismatch({unit_amount: 900000, currency: 'eur', recurring: {interval: 'year', interval_count: 1}}, annualExpected), 'currency differs')
  assert.equal(pricingMismatch({unit_amount: 900000, currency: 'usd', recurring: {interval: 'month', interval_count: 12}}, annualExpected), 'billing interval differs')
})

test('one-time prices reject recurring Stripe prices', () => {
  assert.equal(pricingMismatch({unit_amount: 500000, currency: 'usd'}, {amount: 500000, currency: 'usd'}), null)
  assert.equal(pricingMismatch({unit_amount: 500000, currency: 'usd', recurring: {interval: 'month', interval_count: 1}}, {amount: 500000, currency: 'usd'}), 'billing type differs')
})
