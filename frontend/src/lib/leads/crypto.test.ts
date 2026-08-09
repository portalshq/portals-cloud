import assert from 'node:assert/strict'
import test from 'node:test'
import {decryptJson, encryptJson} from './crypto'

test('historical encryption keys remain readable after rotation', () => {
  const original = {
    key: process.env.LEADS_ENCRYPTION_KEY,
    keyId: process.env.LEADS_ENCRYPTION_KEY_ID,
    keyring: process.env.LEADS_ENCRYPTION_KEYRING,
  }
  const firstKey = Buffer.alloc(32, 1).toString('base64')
  const secondKey = Buffer.alloc(32, 2).toString('base64')

  try {
    process.env.LEADS_ENCRYPTION_KEY = firstKey
    process.env.LEADS_ENCRYPTION_KEY_ID = 'v1'
    process.env.LEADS_ENCRYPTION_KEYRING = '{}'
    const encrypted = encryptJson({company: 'studio'})

    process.env.LEADS_ENCRYPTION_KEY = secondKey
    process.env.LEADS_ENCRYPTION_KEY_ID = 'v2'
    process.env.LEADS_ENCRYPTION_KEYRING = JSON.stringify({v1: firstKey})

    assert.deepEqual(decryptJson(encrypted), {company: 'studio'})
  } finally {
    if (original.key === undefined) delete process.env.LEADS_ENCRYPTION_KEY
    else process.env.LEADS_ENCRYPTION_KEY = original.key
    if (original.keyId === undefined) delete process.env.LEADS_ENCRYPTION_KEY_ID
    else process.env.LEADS_ENCRYPTION_KEY_ID = original.keyId
    if (original.keyring === undefined) delete process.env.LEADS_ENCRYPTION_KEYRING
    else process.env.LEADS_ENCRYPTION_KEYRING = original.keyring
  }
})
