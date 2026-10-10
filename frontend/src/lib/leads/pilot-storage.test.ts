import assert from 'node:assert/strict'
import test from 'node:test'
import {JSDOM} from 'jsdom'
import {
  formDraftKey,
  migrateMatchingFormDraft,
  readFormDraft,
  writeFormDraft,
} from './form-draft'
import {
  clearPilotConfirmation,
  readPilotConfirmation,
  writePilotConfirmation,
} from './pilot-confirmation'

test('compatible legacy drafts retain cleared edits while scoped drafts and identities stay separate', (t) => {
  const dom = new JSDOM('', {url: 'https://portals.test/pilot'})
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: dom.window,
  })
  t.after(() => {
    dom.window.close()
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else delete (globalThis as Record<string, unknown>).window
  })
  const legacy = formDraftKey('pilot_request'),
    owned = formDraftKey('pilot_request:owner')
  writeFormDraft(legacy, {
    email: 'owner@studio.test',
    requiredIntegrations: 'Saved path',
    securityRequirements: '',
    annualPriceAcknowledged: '',
  })
  migrateMatchingFormDraft(legacy, owned, 'OWNER@studio.test')
  assert.equal(readFormDraft(owned).requiredIntegrations, 'Saved path')
  assert.equal(readFormDraft(owned).securityRequirements, '')
  assert.equal(readFormDraft(owned).annualPriceAcknowledged, '')
  const other = formDraftKey('pilot_request:other')
  migrateMatchingFormDraft(legacy, other, 'other@studio.test')
  assert.deepEqual(readFormDraft(other), {})
  writeFormDraft(owned, {requiredIntegrations: 'Newer saved edit'})
  migrateMatchingFormDraft(legacy, owned, 'owner@studio.test')
  assert.equal(readFormDraft(owned).requiredIntegrations, 'Newer saved edit')
  writePilotConfirmation({pilotUrl: '/account/owner/pilot-room/test'}, 'owner')
  assert.equal(readPilotConfirmation('other'), null)
  assert.equal(
    readPilotConfirmation('owner')?.pilotUrl,
    '/account/owner/pilot-room/test'
  )
  clearPilotConfirmation()
  assert.equal(readPilotConfirmation('owner'), null)
})
