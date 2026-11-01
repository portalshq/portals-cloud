import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {GET as download} from './download/route'
import {POST as recordInstall} from './install/route'
import {installerForPlatform} from './telemetry-config'

const release = 'https://github.com/portalshq/px/releases/latest/download/'

test('installer routing only accepts the fixed Unix and Windows release assets', () => {
  assert.equal(installerForPlatform(null), `${release}install.sh`)
  assert.equal(installerForPlatform('unix'), `${release}install.sh`)
  assert.equal(installerForPlatform('windows'), `${release}install.ps1`)
  assert.equal(installerForPlatform('https://attacker.example'), null)
  assert.equal(installerForPlatform('../install.ps1'), null)
})

test('download route redirects only to the fixed Unix and Windows assets', async () => {
  const originalError = console.error
  console.error = () => {}
  try {
    const unix = await download(new Request('https://portals.works/api/px/download?platform=unix'))
    const windows = await download(new Request('https://portals.works/api/px/download?platform=windows'))
    const invalid = await download(new Request('https://portals.works/api/px/download?platform=https://attacker.example'))
    assert.equal(unix.status, 302)
    assert.equal(unix.headers.get('Location'), `${release}install.sh`)
    assert.equal(windows.status, 302)
    assert.equal(windows.headers.get('Location'), `${release}install.ps1`)
    assert.equal(invalid.status, 400)
    assert.equal(invalid.headers.get('Location'), null)
  } finally {
    console.error = originalError
  }
})

test('successful-install endpoint rejects malformed IDs before storage', async () => {
  const response = await recordInstall(new Request('https://portals.works/api/px/install', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({install_id: 'not-a-random-profile-id', platform: 'x86_64-unknown-linux-gnu', version: '1.0.0'}),
  }))
  assert.equal(response.status, 400)
})

test('successful-install endpoint rejects oversized payloads before storage', async () => {
  const response = await recordInstall(new Request('https://portals.works/api/px/install', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Content-Length': '4097'},
    body: '{}',
  }))
  assert.equal(response.status, 413)
})

test('PX telemetry migration is idempotent and deduplicates each event profile', async () => {
  const sql = await readFile(new URL('../../../migrations/016_px_telemetry.sql', import.meta.url), 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS px_telemetry_events/)
  assert.match(sql, /CREATE INDEX IF NOT EXISTS px_telemetry_events_type_created_idx/)
  assert.match(sql, /PRIMARY KEY \(event_type, anonymous_id\)/)
})
