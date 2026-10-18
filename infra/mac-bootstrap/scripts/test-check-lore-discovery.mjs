import assert from 'node:assert/strict'
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {checkLoreDiscovery, validateLoreDiscoveryResponse} from './check-lore-discovery.mjs'

const root = mkdtempSync(join(tmpdir(), 'lore-discovery-check-'))
try {
  const protoRoot = join(root, 'proto')
  const proto = join(protoRoot, 'environment-v1.proto')
  const grpcurl = join(root, 'grpcurl')
  const argsFile = join(root, 'args.json')
  mkdirSync(protoRoot)
  writeFileSync(proto, 'syntax = "proto3";\n')
  writeFileSync(grpcurl, `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.writeFileSync(process.env.ARGS_FILE, JSON.stringify(args))
process.stdout.write(JSON.stringify({environment:{endpoint:{authUrl:process.env.AUTH_URL,storageUrl:process.env.STORAGE_URL || ''}}}))
`)
  chmodSync(grpcurl, 0o755)

  const env = {...process.env, ARGS_FILE: argsFile, AUTH_URL: 'ucs-auth://auth.portals.works'}
  checkLoreDiscovery({expectedAuthUrl: env.AUTH_URL, grpcurlBin: grpcurl, protoRoot, env})
  const quicUrl = 'quics://lore.portals.works:49735'
  const quicEnv = {...env, STORAGE_URL: quicUrl}
  checkLoreDiscovery({expectedAuthUrl: env.AUTH_URL, expectedStorageUrl: quicUrl, grpcurlBin: grpcurl, protoRoot, env: quicEnv})
  assert.throws(() => checkLoreDiscovery({expectedAuthUrl: env.AUTH_URL, expectedStorageUrl: 'quics://other.example:49735', grpcurlBin: grpcurl, protoRoot, env: quicEnv}), /QUIC storage endpoint/)
  validateLoreDiscoveryResponse(JSON.stringify({environment:{endpoint:{authUrl:env.AUTH_URL,storageUrl:quicUrl}}}), env.AUTH_URL, quicUrl)
  const args = JSON.parse(readFileSync(argsFile, 'utf8'))
  assert.ok(args.includes('-proto'))
  assert.ok(args.includes('environment-v1.proto'))
  assert.ok(args.includes(protoRoot))
  assert.ok(args.includes('127.0.0.1:41337'))
  assert.ok(args.includes('lore.environment.v1.EnvironmentService/EnvironmentGet'))

  assert.throws(() => checkLoreDiscovery({expectedAuthUrl: 'ucs-auth://wrong.example', grpcurlBin: grpcurl, protoRoot, env}), /missing the expected Auth endpoint/)
  rmSync(proto)
  assert.throws(() => checkLoreDiscovery({expectedAuthUrl: env.AUTH_URL, grpcurlBin: grpcurl, protoRoot, env}), /Bundled Lore environment discovery proto is missing/)
  console.log('Lore EnvironmentGet checker uses the bundled proto and validates the live response')
} finally {
  rmSync(root, {recursive: true, force: true})
}
