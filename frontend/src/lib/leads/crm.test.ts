import assert from 'node:assert/strict'
import test from 'node:test'
import {finalOperationalList, nextAutomatedLifecycle} from './crm'

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
