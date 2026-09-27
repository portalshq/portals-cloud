import assert from 'node:assert/strict'
import test from 'node:test'
import {UnconfiguredLoreDeliveryAdapter} from './lore.js'

test('unconfigured Lore delivery fails closed', async () => {
  await assert.rejects(
    () => new UnconfiguredLoreDeliveryAdapter().deliver({} as never),
    /not configured/,
  )
})
