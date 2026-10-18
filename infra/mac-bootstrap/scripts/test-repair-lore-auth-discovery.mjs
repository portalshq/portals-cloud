import assert from 'node:assert/strict'
import {setAuthDiscovery} from './repair-lore-auth-discovery.mjs'

const expected = 'ucs-auth://auth.portals.works'
const original = 'LORE_ENV=prod\nLORE_REBAC_URL=http://auth-gateway:8087\n'
const added = setAuthDiscovery(original, expected)
assert.equal(added.changed, true)
assert.match(added.contents, /LORE__ENVIRONMENT__ENDPOINT__AUTH_URL=ucs-auth:\/\/auth\.portals\.works/)
assert.equal(setAuthDiscovery(added.contents, expected).changed, false)

const wrong = setAuthDiscovery('KEEP=this\nLORE__ENVIRONMENT__ENDPOINT__AUTH_URL=ucs-auth://old.example\n', expected)
assert.equal(wrong.changed, true)
assert.match(wrong.contents, /^KEEP=this\nLORE__ENVIRONMENT__ENDPOINT__AUTH_URL=ucs-auth:\/\/auth\.portals\.works\n$/)
const crlf = setAuthDiscovery('KEEP=this\r\nLORE__ENVIRONMENT__ENDPOINT__AUTH_URL=ucs-auth://old.example\r\n', expected)
assert.equal(crlf.contents, 'KEEP=this\r\nLORE__ENVIRONMENT__ENDPOINT__AUTH_URL=ucs-auth://auth.portals.works\r\n')
const duplicate = `LORE__ENVIRONMENT__ENDPOINT__AUTH_URL=${expected}\nLORE__ENVIRONMENT__ENDPOINT__AUTH_URL=${expected}\n`
assert.throws(() => setAuthDiscovery(duplicate, expected), /duplicated/)
assert.throws(() => setAuthDiscovery(original, 'https://auth.portals.works'), /invalid/)

console.log('Lore Auth discovery config repair: add, replace, idempotence, duplicate rejection, and invalid endpoint tests passed')
