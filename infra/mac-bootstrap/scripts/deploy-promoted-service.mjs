#!/usr/bin/env node
import {chmodSync, copyFileSync, existsSync, readFileSync, renameSync, statSync, writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const SERVICES = {
  'auth-gateway': {
    bomBlock: 'control-plane',
    imageKey: 'AUTH_GATEWAY_IMAGE_DIGEST',
    receiptService: 'auth-gateway',
    composeService: 'auth-gateway',
    container: 'templates-auth-gateway-1',
    imagePrefix: 'portalshq/auth-gateway@sha256:',
  },
  lore: {
    bomBlock: 'lore',
    imageKey: 'LORE_IMAGE_DIGEST',
    receiptService: 'lore',
    composeService: 'lore',
    container: 'templates-lore-1',
    imagePrefix: 'portalshq/lore@sha256:',
  },
}

export function readUniqueReleaseValue(contents, key) {
  const matches = contents.split(/\r?\n/).filter(line => line.startsWith(`${key}=`))
  if (matches.length !== 1) throw new Error(`Release manifest must contain exactly one ${key}`)
  const value = matches[0].slice(key.length + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
  if (!value || /__REPLACE_[A-Z0-9_]+__|[\r\n]/.test(value)) throw new Error(`${key} is empty or unresolved`)
  return value
}

export function validateAuthAccessTokenLifetime(contents) {
  const ttl = readUniqueReleaseValue(contents, 'AUTH_ACCESS_TOKEN_TTL_SECONDS')
  if (ttl !== '900') throw new Error('Auth production changeover requires AUTH_ACCESS_TOKEN_TTL_SECONDS=900')
}

export function resolveRollbackImage({configuredImage, runningImage, targetImage}) {
  if (configuredImage !== runningImage && configuredImage !== targetImage) {
    throw new Error('Release image pin must match either the running rollback image or the promoted target image')
  }
  return runningImage
}

export function replaceUniqueReleaseValue(contents, key, expected, replacement) {
  const rows = contents.split(/\r?\n/)
  const matches = rows.map((line, index) => ({line, index})).filter(({line}) => line.startsWith(`${key}=`))
  if (matches.length !== 1 || matches[0].line !== `${key}=${expected}`) {
    throw new Error(`${key} changed or is duplicated; refusing manifest update`)
  }
  rows[matches[0].index] = `${key}=${replacement}`
  return rows.join(contents.includes('\r\n') ? '\r\n' : '\n')
}

export function readBomBlock(contents, blockName) {
  const lines = contents.split(/\r?\n/)
  const start = lines.indexOf(`${blockName}:`)
  if (start < 0) throw new Error(`BOM has no ${blockName} block`)
  const fields = {}
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line && !/^\s/.test(line)) break
    const match = line.match(/^  ([a-z_]+):\s*(?:"([^"]*)"|([^\s#]+))\s*(?:#.*)?$/)
    if (match) fields[match[1]] = match[2] ?? match[3]
  }
  return fields
}

export function validateImageReceipt({image, block, receipt, service}) {
  if (!/^.+@sha256:[a-f0-9]{64}$/.test(image) || !image.startsWith(service.imagePrefix)) {
    throw new Error(`Promoted ${service.receiptService} image must be an immutable approved-repository digest`)
  }
  if (!block.source_commit || block.image !== image) throw new Error('Promoted image does not match its BOM source record')
  if (service.bomBlock === 'lore' && !block.packaging_commit) throw new Error('Lore BOM record has no packaging commit')
  if (service.bomBlock === 'control-plane' && !block.protocol_commit) throw new Error('Auth Gateway BOM record has no protocol commit')
  if (receipt?.service !== service.receiptService || receipt?.platform !== block.platform || receipt?.platform !== 'linux/amd64') {
    throw new Error('Image receipt service/platform does not match the BOM or this Intel Mac deployment target')
  }
  if (receipt.indexDigest !== image.slice(image.indexOf('@') + 1) || receipt.sourceCommit !== block.source_commit) {
    throw new Error('Image receipt digest/source does not match the BOM')
  }
  if (service.bomBlock === 'lore' && receipt.packagingCommit !== block.packaging_commit) throw new Error('Lore packaging receipt does not match the BOM')
  if (service.bomBlock === 'control-plane' && receipt.protocolCommit !== block.protocol_commit) throw new Error('Auth protocol receipt does not match the BOM')
  if (receipt.signature?.issuer !== 'https://token.actions.githubusercontent.com' || receipt.signature?.verifiedFromRegistry !== true) {
    throw new Error('Image receipt lacks verified GitHub Actions registry signature evidence')
  }
  if (receipt.trivyScan?.critical !== 0 || receipt.trivyScan?.high !== 0) throw new Error('Image receipt has unresolved HIGH/CRITICAL scan findings')
}

export function validateRollbackReceipt({image, receipt, service}) {
  if (!/^.+@sha256:[a-f0-9]{64}$/.test(image) || !image.startsWith(service.imagePrefix)) throw new Error('Rollback image is not an immutable approved-repository digest')
  if (receipt?.service !== service.receiptService || receipt?.platform !== 'linux/amd64' || receipt.indexDigest !== image.slice(image.indexOf('@') + 1)) {
    throw new Error('Rollback image has no matching verified platform receipt')
  }
  if (receipt.signature?.issuer !== 'https://token.actions.githubusercontent.com' || receipt.signature?.verifiedFromRegistry !== true) throw new Error('Rollback image signature evidence is not verified')
  if (receipt.trivyScan?.critical !== 0 || receipt.trivyScan?.high !== 0) throw new Error('Rollback image receipt has unresolved HIGH/CRITICAL scan findings')
}

export function withImageOverride(baseEnvironment, imageKey, image) {
  const environment = {...baseEnvironment}
  for (const key of Object.values(SERVICES).map(service => service.imageKey)) delete environment[key]
  return {...environment, [imageKey]: image}
}

function run(command, args, env, options = {}) {
  const result = spawnSync(command, args, {env, encoding: 'utf8', stdio: options.inherit ? 'inherit' : 'pipe'})
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = options.inherit ? '' : (result.stderr || '').trim()
    throw new Error(`${command} ${args[0] ?? ''} failed${detail ? `: ${detail}` : ''}`)
  }
  return (result.stdout || '').trim()
}

function atomicWrite(file, contents, mode) {
  const temp = join(dirname(file), `.${file.split('/').at(-1)}.deploy-${process.pid}`)
  writeFileSync(temp, contents, {mode})
  chmodSync(temp, mode)
  renameSync(temp, file)
}

async function probe(service, runtime) {
  const urls = service.receiptService === 'lore'
    ? ['http://127.0.0.1:41339/health_check']
    : ['http://127.0.0.1:8085/healthz', 'http://127.0.0.1:8085/.well-known/jwks.json']
  for (const url of urls) {
    const response = await fetch(url, {signal: AbortSignal.timeout(4000)})
    if (!response.ok) throw new Error(`${service.receiptService} readiness probe returned HTTP ${response.status}`)
    if (url.endsWith('jwks.json')) {
      const jwks = await response.json()
      if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) throw new Error('Auth JWKS has no public signing keys')
    }
  }
  if (service.receiptService === 'lore' && runtime.requireAuthDiscovery !== false) {
    run(process.execPath, [
      join(runtime.root, 'scripts/check-lore-discovery.mjs'),
      `ucs-auth://${runtime.authDomain}`,
    ], runtime.env)
  }
}

function imageId(docker, env, image) {
  return run(docker, ['image', 'inspect', '--format', '{{.Id}}', image], env)
}

function containerImageId(docker, env, name) {
  return run(docker, ['inspect', '--format', '{{.Image}}', name], env)
}

function containerHealth(docker, env, name) {
  return run(docker, ['inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}', name], env)
}

async function waitReady(docker, env, service, expectedImageId, runtime) {
  let lastProblem = 'container did not report healthy'
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      if (containerImageId(docker, env, service.container) !== expectedImageId) {
        lastProblem = 'container image ID does not match the selected digest'
      } else if (containerHealth(docker, env, service.container) !== 'healthy') {
        lastProblem = 'container health is not healthy'
      } else {
        await probe(service, runtime)
        return
      }
    } catch (error) {
      lastProblem = error.message
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 2000))
  }
  throw new Error(`${service.receiptService} failed image/health/readiness verification: ${lastProblem}`)
}

function parseCli(args) {
  if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--plan')) {
    throw new Error('Usage: deploy-promoted-service.mjs <auth-gateway|lore> [--plan]')
  }
  const service = SERVICES[args[0]]
  if (!service) throw new Error(`Unsupported service ${args[0]}; only BOM-backed Auth Gateway and Lore are deployable`)
  return {service, planOnly: args[1] === '--plan'}
}

async function main(args) {
  const {service, planOnly} = parseCli(args)
  if (run('id', ['-un'], process.env) !== 'portals-svc') {
    throw new Error('Run this deployment as portals-svc; do not grant a general-purpose sudo rule')
  }
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const root = resolve(process.env.MAC_BOOTSTRAP_ROOT || join(scriptDir, '..'))
  const releaseEnv = resolve(process.env.MAC_RELEASE_ENV || '/Users/portals-svc/portals-release.env')
  const bomFile = resolve(process.env.MAC_RELEASE_BOM || join(root, '../lore/versions.yaml'))
  const receiptFile = resolve(process.env.MAC_RELEASE_RECEIPTS || join(root, '../lore/verified-dockerhub-images.json'))
  const composeFile = resolve(process.env.MAC_COMPOSE_FILE || join(root, 'templates/compose.prod.yaml'))
  for (const file of [releaseEnv, bomFile, receiptFile, composeFile]) {
    if (!existsSync(file)) throw new Error(`Required deployment input is missing: ${file}`)
  }
  const docker = process.env.DOCKER_BIN || 'docker'
  const compose = process.env.DOCKER_COMPOSE_BIN || 'docker-compose'
  const bom = readBomBlock(readFileSync(bomFile, 'utf8'), service.bomBlock)
  const release = readBomBlock(readFileSync(bomFile, 'utf8'), 'release')
  if (release.status !== 'approved') throw new Error(`BOM release status is ${release.status || 'missing'}; only approved releases may deploy`)
  const image = bom.image
  if (!image) throw new Error(`BOM ${service.bomBlock} block has no promoted image`)
  const receipts = JSON.parse(readFileSync(receiptFile, 'utf8')).receipts
  const receipt = receipts?.[image]
  validateImageReceipt({image, block: bom, receipt, service})

  const releaseContents = readFileSync(releaseEnv, 'utf8')
  const runtime = {
    root,
    authDomain: readUniqueReleaseValue(releaseContents, 'AUTH_DOMAIN'),
    env: process.env,
  }
  if (service.receiptService === 'auth-gateway') {
    const authEnv = resolve(dirname(releaseEnv), readUniqueReleaseValue(releaseContents, 'AUTH_ENV_FILE'))
    validateAuthAccessTokenLifetime(readFileSync(authEnv, 'utf8'))
  }
  const configuredImage = readUniqueReleaseValue(releaseContents, service.imageKey)
  if (!/^.+@sha256:[a-f0-9]{64}$/.test(configuredImage) || !configuredImage.startsWith(service.imagePrefix)) {
    throw new Error(`Current ${service.imageKey} is not a valid immutable digest for this service`)
  }
  const targetImage = image
  const composeBaseEnv = {...process.env, MAC_RELEASE_ENV: releaseEnv}
  const runningImage = run(docker, ['inspect', '--format', '{{.Config.Image}}', service.container], composeBaseEnv)
  const oldImage = resolveRollbackImage({configuredImage, runningImage, targetImage})
  validateRollbackReceipt({image: oldImage, receipt: receipts?.[oldImage], service})
  const oldImageId = imageId(docker, composeBaseEnv, oldImage)
  if (containerImageId(docker, composeBaseEnv, service.container) !== oldImageId) {
    throw new Error(`Running ${service.receiptService} image ID does not match its reported immutable image`)
  }
  if (containerHealth(docker, composeBaseEnv, service.container) !== 'healthy') {
    throw new Error(`Current ${service.receiptService} is not healthy; refusing a normal changeover`)
  }
  if (oldImage === image) {
    runtime.env = composeBaseEnv
    await waitReady(docker, composeBaseEnv, service, oldImageId, runtime)
    if (configuredImage !== image) {
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
      const backup = `${releaseEnv}.pre-${service.receiptService}-${timestamp}`
      if (existsSync(backup)) throw new Error('Refusing to overwrite an existing release-manifest backup')
      const fileMode = statSync(releaseEnv).mode & 0o777
      copyFileSync(releaseEnv, backup)
      chmodSync(backup, fileMode)
      atomicWrite(releaseEnv, replaceUniqueReleaseValue(releaseContents, service.imageKey, configuredImage, image), fileMode)
    }
    console.log(`DEPLOYMENT_NOOP service=${service.receiptService} image=${image} health=verified`)
    return
  }
  if (planOnly) {
    console.log(`DEPLOYMENT_PLAN service=${service.receiptService} from=${oldImage} to=${image} platform=${bom.platform} rollback=verified-current-image`)
    return
  }

  run(docker, ['pull', image], composeBaseEnv, {inherit: true})
  const targetImageId = imageId(docker, composeBaseEnv, image)
  const platform = run(docker, ['image', 'inspect', '--format', '{{.Os}}/{{.Architecture}}', image], composeBaseEnv)
  if (platform !== bom.platform) throw new Error(`Pulled ${service.receiptService} platform ${platform} does not match BOM ${bom.platform}`)

  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const backup = `${releaseEnv}.pre-${service.receiptService}-${timestamp}`
  if (existsSync(backup)) throw new Error('Refusing to overwrite an existing release-manifest backup')
  const fileMode = statSync(releaseEnv).mode & 0o777
  copyFileSync(releaseEnv, backup)
  chmodSync(backup, fileMode)
  // Keep the known-good running image pinned until the promoted image passes
  // readiness. The manifest may already contain the target from preflight.
  if (configuredImage !== oldImage) {
    atomicWrite(releaseEnv, replaceUniqueReleaseValue(releaseContents, service.imageKey, configuredImage, oldImage), fileMode)
  }

  let changed = false
  try {
    const targetEnv = withImageOverride(composeBaseEnv, service.imageKey, image)
    run(compose, ['--env-file', releaseEnv, '-f', composeFile, 'config', '--quiet'], targetEnv)
    changed = true
    run(compose, ['--env-file', releaseEnv, '-f', composeFile, 'up', '-d', '--no-deps', service.composeService], targetEnv, {inherit: true})
    runtime.env = targetEnv
    await waitReady(docker, targetEnv, service, targetImageId, runtime)
    const currentContents = readFileSync(releaseEnv, 'utf8')
    const activePin = readUniqueReleaseValue(currentContents, service.imageKey)
    if (activePin !== oldImage) throw new Error('Rollback pin changed during deployment; refusing to finalize release manifest')
    atomicWrite(releaseEnv, replaceUniqueReleaseValue(currentContents, service.imageKey, oldImage, image), fileMode)
    console.log(`DEPLOYMENT_PASS service=${service.receiptService} image=${image} platform=${platform} rollback_backup=${backup}`)
  } catch (deployError) {
    try {
      const currentContents = readFileSync(releaseEnv, 'utf8')
      const activePin = readUniqueReleaseValue(currentContents, service.imageKey)
      if (activePin === image) {
        atomicWrite(releaseEnv, replaceUniqueReleaseValue(currentContents, service.imageKey, image, oldImage), fileMode)
      } else if (activePin !== oldImage) {
        throw new Error('Active release image pin changed unexpectedly; refusing automatic rollback')
      }
      const rollbackEnv = withImageOverride(composeBaseEnv, service.imageKey, oldImage)
      if (changed) {
        run(compose, ['--env-file', releaseEnv, '-f', composeFile, 'up', '-d', '--no-deps', service.composeService], rollbackEnv, {inherit: true})
        // A pre-existing discovery defect must not make a healthy prior image
        // look unavailable during rollback; target acceptance remains strict.
        runtime.requireAuthDiscovery = false
        runtime.env = rollbackEnv
        await waitReady(docker, rollbackEnv, service, oldImageId, runtime)
      }
      console.error(`DEPLOYMENT_ROLLBACK_PASS service=${service.receiptService} prior_image=${oldImage}`)
    } catch (rollbackError) {
      throw new Error(`${deployError.message}; ROLLBACK FAILED: ${rollbackError.message}. Preserve the backup ${backup} and inspect the host immediately.`)
    }
    throw deployError
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`DEPLOYMENT_FAILED ${error.message}`)
    process.exitCode = 1
  })
}
