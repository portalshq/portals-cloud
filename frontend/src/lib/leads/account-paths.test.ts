import assert from 'node:assert/strict'
import test from 'node:test'
import {accountPath, pilotRoomPath, pilotRoomPathForPilot} from './account-paths'

test('account paths keep pilot rooms nested under the account', () => {
  assert.equal(accountPath('account-123'), '/account/account-123')
  assert.equal(
    pilotRoomPath('account-123', 'pilot-456'),
    '/account/account-123/pilot-room/pilot-456',
  )
  assert.equal(
    pilotRoomPathForPilot({customerAccountId: 'account-123', id: 'pilot-456'}),
    '/account/account-123/pilot-room/pilot-456',
  )
  assert.equal(pilotRoomPathForPilot({id: 'pilot-456'}), '/account')
})
