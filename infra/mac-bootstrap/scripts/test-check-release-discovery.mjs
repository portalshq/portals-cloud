import assert from 'node:assert/strict'
import {copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {spawnSync} from 'node:child_process'

const sourceRoot = new URL('..', import.meta.url).pathname
const temporaryRoot = mkdtempSync(join(tmpdir(), 'portals-release-discovery-'))
try {
  const bootstrap = join(temporaryRoot, 'infra', 'mac-bootstrap')
  const scripts = join(bootstrap, 'scripts')
  const templates = join(bootstrap, 'templates')
  const loreRoot = join(temporaryRoot, 'infra', 'lore')
  mkdirSync(scripts, {recursive: true})
  mkdirSync(templates, {recursive: true})
  mkdirSync(loreRoot, {recursive: true})
  copyFileSync(join(sourceRoot, 'scripts/check-release.mjs'), join(scripts, 'check-release.mjs'))
  writeFileSync(join(templates, 'compose.prod.yaml'), [
    'image: ${AUTH_GATEWAY_IMAGE_DIGEST}',
    'image: ${LORE_IMAGE_DIGEST}',
    'image: ${CADDY_IMAGE_DIGEST}',
    '127.0.0.1:41337:41337/udp',
    '127.0.0.1:41339:41339',
    '127.0.0.1:8443:443',
    '${AUTH_SECRET_DIR}:/run/secrets/auth:ro',
    '${LORE_AWS_ENV_FILE}',
  ].join('\n'))
  writeFileSync(join(templates, 'Caddyfile'), '{$AUTH_DOMAIN}\ntls /run/secrets/caddy/fullchain.pem /run/secrets/caddy/privkey.pem\n{$LORE_DOMAIN}\ntls /run/secrets/caddy/fullchain.pem /run/secrets/caddy/privkey.pem\n')

  const loreImage = `portalshq/lore@sha256:${'1'.repeat(64)}`
  const authImage = `portalshq/auth-gateway@sha256:${'2'.repeat(64)}`
  const caddyImage = `caddy@sha256:${'3'.repeat(64)}`
  const loreSource = 'a'.repeat(40), lorePackaging = 'b'.repeat(40)
  const authSource = 'c'.repeat(40), authProtocol = 'd'.repeat(40)
  writeFileSync(join(loreRoot, 'versions.yaml'), `lore:\n  image: "${loreImage}"\n  source_commit: "${loreSource}"\n  packaging_commit: "${lorePackaging}"\ncontrol-plane:\n  image: "${authImage}"\n  source_commit: "${authSource}"\n  protocol_commit: "${authProtocol}"\nnext:\n`)
  const signature = {issuer: 'https://token.actions.githubusercontent.com'}
  writeFileSync(join(loreRoot, 'verified-dockerhub-images.json'), JSON.stringify({receipts: {
    [loreImage]: {service: 'lore', platform: 'linux/amd64', indexDigest: `sha256:${'1'.repeat(64)}`, sourceCommit: loreSource, packagingCommit: lorePackaging, signature, trivyScan: {critical: 0, high: 0}},
    [authImage]: {service: 'auth-gateway', platform: 'linux/amd64', indexDigest: `sha256:${'2'.repeat(64)}`, sourceCommit: authSource, protocolCommit: authProtocol, signature, trivyScan: {critical: 0, high: 0}},
  }}))

  const files = Object.fromEntries(['AUTH_ENV_FILE', 'LORE_ENV_FILE', 'LORE_AWS_ENV_FILE', 'CADDY_ENV_FILE'].map(name => [name, join(temporaryRoot, `${name}.env`)]))
  writeFileSync(files.AUTH_ENV_FILE, [
    'OIDC_ISSUER=https://identity.example.test', 'OIDC_CLIENT_ID=test-client',
    'OIDC_REDIRECT_URI=https://auth.portals.works/callback',
    'JWT_SIGNING_PROVIDER=sealed-file', 'JWT_LOCAL_PRIVATE_KEY_PATH=/run/secrets/auth/signing-key',
    'API_KEY_PEPPER_PROVIDER=sealed-file', 'API_KEY_PEPPER_FILE_PATH=/run/secrets/auth/api-key-pepper',
  ].join('\n'))
  const loreEnv = 'LORE_REBAC_URL=http://auth-gateway:8087\nLORE__ENVIRONMENT__ENDPOINT__AUTH_URL=ucs-auth://auth.portals.works\nLORE__ENVIRONMENT__ENDPOINT__STORAGE_URL=quics://lore.portals.works:49735\n'
  writeFileSync(files.LORE_ENV_FILE, loreEnv)
  writeFileSync(files.LORE_AWS_ENV_FILE, 'AWS_ACCESS_KEY_ID=test\nAWS_SECRET_ACCESS_KEY=test\n')
  writeFileSync(files.CADDY_ENV_FILE, 'AUTH_DOMAIN=auth.portals.works\nLORE_DOMAIN=lore.portals.works\n')

  const authSecretDir = join(temporaryRoot, 'auth-secret')
  const caddyCertDir = join(temporaryRoot, 'caddy-cert')
  const quicCertDir = join(temporaryRoot, 'quic-cert')
  for (const dir of [authSecretDir, caddyCertDir, quicCertDir]) mkdirSync(dir)
  for (const file of ['signing-key', 'api-key-pepper']) writeFileSync(join(authSecretDir, file), 'fixture')
  for (const dir of [caddyCertDir, quicCertDir]) for (const file of ['fullchain.pem', 'privkey.pem']) writeFileSync(join(dir, file), 'fixture')

  const env = {
    ...process.env,
    AUTH_GATEWAY_IMAGE_DIGEST: authImage,
    LORE_IMAGE_DIGEST: loreImage,
    CADDY_IMAGE_DIGEST: caddyImage,
    ...files,
    AUTH_SECRET_DIR: authSecretDir,
    CADDY_CERT_DIR: caddyCertDir,
    LORE_QUIC_CERT_DIR: quicCertDir,
    LORE_QUIC_HOST: 'lore.portals.works',
    LORE_QUIC_PORT: '49735',
  }
  const run = envOverride => spawnSync(process.execPath, [join(scripts, 'check-release.mjs')], {cwd: bootstrap, env: {...env, ...envOverride}, encoding: 'utf8'})

  const valid = run({})
  assert.equal(valid.status, 0, valid.stderr)
  writeFileSync(files.LORE_ENV_FILE, loreEnv.replace(/^LORE__ENVIRONMENT__ENDPOINT__AUTH_URL=.*\n/m, ''))
  assert.match(run({}).stderr, /Lore advertised Auth discovery endpoint/)
  writeFileSync(files.LORE_ENV_FILE, loreEnv.replace('ucs-auth://auth.portals.works', 'ucs-auth://wrong.example.test'))
  assert.match(run({}).stderr, /Lore advertised Auth discovery endpoint/)
  writeFileSync(files.LORE_ENV_FILE, loreEnv)
  assert.match(run({LORE_AWS_ENV_FILE: ''}).stderr, /LORE_AWS_ENV_FILE/)
  writeFileSync(files.LORE_ENV_FILE, loreEnv.replace('quics://lore.portals.works:49735', 'quics://lore.portals.works:41337'))
  assert.match(run({}).stderr, /actual public UDP port/)

  console.log('Release preflight rejects missing/wrong Lore Auth discovery and missing Lore AWS env file; valid fixture passes')
} finally {
  rmSync(temporaryRoot, {recursive: true, force: true})
}
