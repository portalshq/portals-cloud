import assert from 'node:assert/strict'
import test from 'node:test'
import {internalPilotLabels} from './email'

const materialException = {
  kind: 'custom-integration',
  summary: 'custom integration',
  amendment: 'review required',
}

test('internal pilot labels distinguish assisted preference from standard terms', () => {
  assert.deepEqual(internalPilotLabels({mode: 'assisted', exceptions: []}), {
    preferredExperience: 'assisted',
    termsPath: 'standard',
  })
})

test('internal pilot labels distinguish self-serve preference from standard terms', () => {
  assert.deepEqual(internalPilotLabels({mode: 'standard', exceptions: []}), {
    preferredExperience: 'self-serve',
    termsPath: 'standard',
  })
})

test('internal pilot labels route self-serve preference to exception review when terms are material', () => {
  assert.deepEqual(internalPilotLabels({mode: 'standard', exceptions: [materialException]}), {
    preferredExperience: 'self-serve',
    termsPath: 'exception review required',
  })
})

test('internal pilot labels preserve assisted preference when terms require exception review', () => {
  assert.deepEqual(internalPilotLabels({mode: 'assisted', exceptions: [materialException]}), {
    preferredExperience: 'assisted',
    termsPath: 'exception review required',
  })
})
