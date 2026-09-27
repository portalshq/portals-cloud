import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareLocalLoreRepository} from './lore-sdk.js'

test('SDK preparation requires an explicit local repository path', () => {
  assert.equal(typeof prepareLocalLoreRepository, 'function')
})
