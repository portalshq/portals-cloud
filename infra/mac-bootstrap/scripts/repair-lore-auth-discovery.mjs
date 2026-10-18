#!/usr/bin/env node
import {chmodSync, copyFileSync, existsSync, lstatSync, readFileSync, renameSync, statSync, writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {dirname, join} from 'node:path'

const ROOT = '/Users/portals-svc/portals/infra/mac-bootstrap'
const RELEASE_FILE = '/Users/portals-svc/portals-release.env'
const LORE_ENV_FILE = '/Users/portals-svc/secrets/lore.env'
const CADDY_ENV_FILE = '/Users/portals-svc/secrets/caddy.env'
const COMPOSE_FILE = `${ROOT}/templates/compose.prod.yaml`
const DOCKER = '/usr/local/bin/docker'
const COMPOSE = '/usr/local/bin/docker-compose'
const CONTAINER = 'templates-lore-1'
const AUTH_KEY = 'LORE__ENVIRONMENT__ENDPOINT__AUTH_URL'

export function setAuthDiscovery(contents, expectedUrl) {
  if (!/^ucs-auth:\/\/[A-Za-z0-9.-]+$/.test(expectedUrl)) throw new Error('Expected Auth discovery URL is invalid')
  const rows = [...contents.matchAll(/^LORE__ENVIRONMENT__ENDPOINT__AUTH_URL=([^\r\n]*)\r?$/gm)]
  if (rows.length > 1) throw new Error('Lore Auth discovery setting is duplicated; refusing an ambiguous edit')
  if (rows.length === 1) {
    const current = rows[0][1]
    if (current === expectedUrl) return {contents, changed: false}
    return {contents: contents.replace(/^LORE__ENVIRONMENT__ENDPOINT__AUTH_URL=[^\r\n]*/m, `${AUTH_KEY}=${expectedUrl}`), changed: true}
  }
  const newline = contents.includes('\r\n') ? '\r\n' : '\n'
  const prefix = contents.length === 0 || contents.endsWith('\n') ? contents : `${contents}${newline}`
  return {contents: `${prefix}${AUTH_KEY}=${expectedUrl}${newline}`, changed: true}
}

function uniqueEnvValue(contents, name) {
  const matches = [...contents.matchAll(new RegExp(`^${name}=([^\\r\\n]*)\\r?$`, 'gm'))]
  if (matches.length !== 1 || !matches[0][1]) throw new Error(`${name} must appear exactly once and be non-empty`)
  return matches[0][1].trim().replace(/^(['"])(.*)\1$/, '$2')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {encoding: 'utf8', timeout: options.timeout ?? 30000, env: process.env})
  if (result.error) throw new Error(`${command} could not run`)
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ''} failed`)
  return (result.stdout || '').trim()
}

function assertPrivateOwnedFile(path) {
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Lore settings must be a regular non-symlink file')
  if (typeof process.getuid === 'function' && info.uid !== process.getuid()) throw new Error('Lore settings must be owned by portals-svc')
  if ((info.mode & 0o077) !== 0) throw new Error('Lore settings permissions are too broad')
}

function writeAtomically(path, contents, mode) {
  const temp = join(dirname(path), `.lore-auth-discovery-${process.pid}.tmp`)
  if (existsSync(temp)) throw new Error('A Lore discovery update temp file already exists; inspect before retrying')
  writeFileSync(temp, contents, {flag: 'wx', mode})
  run('/bin/chmod', ['-N', temp])
  chmodSync(temp, mode)
  renameSync(temp, path)
}

function waitForHealthy() {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      if (run(DOCKER, ['inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}', CONTAINER], {timeout: 5000}) === 'healthy') return
    } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000)
  }
  throw new Error('Lore did not become healthy after the guarded recreation')
}

function recreateLore(requireDiscovery = true) {
  run(COMPOSE, ['--env-file', RELEASE_FILE, '-f', COMPOSE_FILE, 'config', '--quiet'])
  run(COMPOSE, ['--env-file', RELEASE_FILE, '-f', COMPOSE_FILE, 'up', '-d', '--no-deps', 'lore'], {timeout: 120000})
  if (run(DOCKER, ['inspect', '--format', '{{.Config.Image}}', CONTAINER]) !== process.env.LORE_IMAGE_DIGEST) {
    throw new Error('Lore container image does not match its immutable release pin')
  }
  waitForHealthy()
  if (requireDiscovery) {
    const actualEnv = run(DOCKER, ['inspect', '--format', '{{range .Config.Env}}{{println .}}{{end}}', CONTAINER])
    if (!actualEnv.split(/\r?\n/).includes(`${AUTH_KEY}=ucs-auth://auth.portals.works`)) {
      throw new Error('Recreated Lore container did not receive the expected Auth discovery setting')
    }
    run(process.execPath, [`${ROOT}/scripts/check-lore-discovery.mjs`, 'ucs-auth://auth.portals.works'], {timeout: 20000})
  }
}

function main() {
  if (process.argv.length !== 2) throw new Error('This fixed-purpose repair accepts no arguments')
  if (process.env.LORE_ENV_FILE !== LORE_ENV_FILE || process.env.CADDY_ENV_FILE !== CADDY_ENV_FILE) {
    throw new Error('Release manifest must point to the approved Lore and Caddy settings files')
  }
  if (!existsSync(RELEASE_FILE) || !existsSync(LORE_ENV_FILE) || !existsSync(CADDY_ENV_FILE)) throw new Error('A required production settings file is missing')
  if (typeof process.getuid === 'function' && process.getuid() === 0) throw new Error('Run as portals-svc, not root')
  if (run('/usr/bin/id', ['-un']) !== 'portals-svc') throw new Error('This operation must run as portals-svc')

  const caddyEnv = readFileSync(CADDY_ENV_FILE, 'utf8')
  const authDomain = uniqueEnvValue(caddyEnv, 'AUTH_DOMAIN')
  if (authDomain !== 'auth.portals.works') throw new Error('Caddy AUTH_DOMAIN does not match the approved production Auth hostname')
  const expectedUrl = `ucs-auth://${authDomain}`
  const image = uniqueEnvValue(readFileSync(RELEASE_FILE, 'utf8'), 'LORE_IMAGE_DIGEST')
  if (!/^portalshq\/lore@sha256:[a-f0-9]{64}$/.test(image)) throw new Error('Lore release pin is not an immutable approved Docker Hub digest')
  const currentImage = run(DOCKER, ['inspect', '--format', '{{.Config.Image}}', CONTAINER])
  if (currentImage !== image) throw new Error('Running Lore image does not match the release manifest; refusing to recreate')

  assertPrivateOwnedFile(LORE_ENV_FILE)
  const original = readFileSync(LORE_ENV_FILE, 'utf8')
  const update = setAuthDiscovery(original, expectedUrl)
  const mode = statSync(LORE_ENV_FILE).mode & 0o777
  let backup
  let serviceChangeAttempted = false
  if (update.changed) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
    backup = `${LORE_ENV_FILE}.pre-auth-discovery-${stamp}`
    if (existsSync(backup)) throw new Error('Lore settings backup already exists; refusing to overwrite')
    copyFileSync(LORE_ENV_FILE, backup)
    run('/bin/chmod', ['-N', backup])
    chmodSync(backup, mode)
    writeAtomically(LORE_ENV_FILE, update.contents, mode)
  }

  try {
    run(process.execPath, [`${ROOT}/scripts/check-release.mjs`], {timeout: 30000})
    serviceChangeAttempted = true
    recreateLore()
    console.log(`LORE_AUTH_DISCOVERY_REPAIR=PASS changed=${update.changed ? 'yes' : 'no'} backup=${backup ?? 'not-needed'} image=${image}`)
  } catch (error) {
    if (update.changed && backup) {
      try {
        const prior = readFileSync(backup)
        writeAtomically(LORE_ENV_FILE, prior, mode)
        if (serviceChangeAttempted) recreateLore(false)
        throw new Error(`${error.message}; config rollback was restored${serviceChangeAttempted ? ' and prior Lore deployment is healthy' : ''}, but Lore discovery repair remains incomplete`)
      } catch (rollbackError) {
        if (/config rollback was restored/.test(rollbackError.message)) throw rollbackError
        throw new Error(`${error.message}; Lore config rollback/recreate failed; preserve ${backup} and inspect the host`)
      }
    }
    if (serviceChangeAttempted) {
      try {
        recreateLore(false)
        throw new Error(`${error.message}; Lore was recreated on the same pinned image and is healthy, but Auth discovery verification failed`)
      } catch (recoveryError) {
        if (/Lore was recreated/.test(recoveryError.message)) throw recoveryError
        throw new Error(`${error.message}; same-image Lore recovery failed; inspect the host before retrying`)
      }
    }
    throw error
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  try {
    main()
  } catch (error) {
    console.error(`LORE_AUTH_DISCOVERY_REPAIR=FAIL ${error.message}`)
    process.exitCode = 1
  }
}
