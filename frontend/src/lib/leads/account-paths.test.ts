import assert from 'node:assert/strict'
import test from 'node:test'
import {accountPath, pilotRoomPath, pilotRoomPathForPilot, pilotRoomPathForPilotOrFallback, extractLegacyPilotId, isLegacyPilotPath, legacyPilotPath, safeInternalPath} from './account-paths'

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
  assert.throws(() => pilotRoomPathForPilot({id: 'pilot-456'}), /missing customerAccountId/)
  assert.equal(pilotRoomPathForPilotOrFallback({id: 'pilot-456'}), '/account')
})

test('legacy pilot path extraction is robust', () => {
  assert.equal(extractLegacyPilotId('/pilot/room/pilot-123'), 'pilot-123')
  assert.equal(extractLegacyPilotId('/pilot/room/pilot-123/revise'), 'pilot-123')
  assert.equal(extractLegacyPilotId('/pilot/room/pilot-123?session_id=abc'), 'pilot-123')
  assert.equal(extractLegacyPilotId('/paid-pilot/room/pilot-123'), 'pilot-123')
  assert.equal(extractLegacyPilotId('/account/account-123/pilot-room/pilot-456'), null)
  assert.equal(isLegacyPilotPath('/pilot/room/x'), true)
  assert.equal(isLegacyPilotPath('/paid-pilot/room/x'), true)
  assert.equal(isLegacyPilotPath('/account'), false)
  assert.equal(legacyPilotPath('pilot-123', true, '?session_id=abc&foo=bar'), '/pilot/room/pilot-123/revise?session_id=abc&foo=bar')
  assert.equal(safeInternalPath('//example.com'), '/account')
  assert.equal(safeInternalPath('/account/a?tab=pilot'), '/account/a?tab=pilot')
})
