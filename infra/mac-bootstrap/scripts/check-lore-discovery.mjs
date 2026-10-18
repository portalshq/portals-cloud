#!/usr/bin/env node
import {existsSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'

export function validateLoreDiscoveryResponse(response, expectedAuthUrl, expectedStorageUrl) {
  let payload
  try {
    payload = JSON.parse(response)
  } catch {
    throw new Error('Lore environment discovery returned invalid JSON')
  }
  if (payload?.environment?.endpoint?.authUrl !== expectedAuthUrl) {
    throw new Error('Lore environment discovery is missing the expected Auth endpoint')
  }
  if (expectedStorageUrl && payload?.environment?.endpoint?.storageUrl !== expectedStorageUrl) {
    throw new Error('Lore environment discovery is missing the expected QUIC storage endpoint')
  }
}

export function checkLoreDiscovery({expectedAuthUrl, expectedStorageUrl, grpcurlBin, protoRoot, target = '127.0.0.1:41337', env = process.env}) {
  const protoFile = resolve(protoRoot, 'environment-v1.proto')
  if (!existsSync(protoFile)) throw new Error('Bundled Lore environment discovery proto is missing')

  const grpcurl = grpcurlBin || process.env.GRPCURL_BIN || '/Users/Shared/portals-tools/bin/grpcurl'
  const result = spawnSync(grpcurl, [
    '-plaintext',
    '-import-path', protoRoot,
    '-proto', 'environment-v1.proto',
    '-d', '{}',
    target,
    'lore.environment.v1.EnvironmentService/EnvironmentGet',
  ], {encoding: 'utf8', timeout: 10000, env})
  if (result.error || result.status !== 0) {
    throw new Error('Lore environment discovery RPC failed')
  }
  validateLoreDiscoveryResponse(result.stdout, expectedAuthUrl, expectedStorageUrl)
}

function main() {
  const expectedAuthUrl = process.argv[2]
  const expectedStorageUrl = process.argv[3]
  if (!/^ucs-auth:\/\/[A-Za-z0-9.-]+$/.test(expectedAuthUrl || '')) {
    throw new Error('Usage: check-lore-discovery.mjs ucs-auth://<auth-host> [quics://<storage-host>:<port>]')
  }
  if (expectedStorageUrl && !/^quics:\/\/[A-Za-z0-9.-]+:\d+$/.test(expectedStorageUrl)) {
    throw new Error('Expected storage endpoint must be certificate-verified quics://host:port')
  }
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const repoRoot = resolve(scriptDir, '..')
  const protoRoot = resolve(repoRoot, 'probes')
  checkLoreDiscovery({expectedAuthUrl, expectedStorageUrl, protoRoot})
  console.log(expectedStorageUrl
    ? 'Lore runtime Auth and QUIC storage discovery endpoints verified.'
    : 'Lore runtime Auth discovery endpoint verified.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main()
  } catch (error) {
    console.error(`LORE_DISCOVERY_FAILED ${error.message}`)
    process.exitCode = 1
  }
}
