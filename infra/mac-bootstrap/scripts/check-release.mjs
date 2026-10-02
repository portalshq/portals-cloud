import {existsSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const required = [
  'AUTH_GATEWAY_IMAGE_DIGEST',
  'LORE_IMAGE_DIGEST',
  'CADDY_IMAGE_DIGEST',
  'AUTH_ENV_FILE',
  'AUTH_SECRET_DIR',
  'LORE_ENV_FILE',
  'CADDY_ENV_FILE',
  'CADDY_CERT_DIR',
  'LORE_QUIC_CERT_DIR',
]
const missing = required.filter((name) => !process.env[name])
if (missing.length) throw new Error(`missing release inputs: ${missing.join(', ')}`)
for (const name of required.filter((value) => value.endsWith('_ENV_FILE'))) {
  if (!existsSync(resolve(process.cwd(), process.env[name]))) throw new Error(`${name} does not point to an existing file`)
}
const authSecretDir = resolve(process.cwd(), process.env.AUTH_SECRET_DIR)
for (const file of ['signing-key', 'api-key-pepper']) {
  if (!existsSync(resolve(authSecretDir, file))) throw new Error(`AUTH_SECRET_DIR is missing ${file}`)
}
const certDir = resolve(process.cwd(), process.env.CADDY_CERT_DIR)
for (const file of ['fullchain.pem', 'privkey.pem']) {
  if (!existsSync(resolve(certDir, file))) throw new Error(`CADDY_CERT_DIR is missing ${file}`)
}
const loreQuicCertDir = resolve(process.cwd(), process.env.LORE_QUIC_CERT_DIR)
for (const file of ['fullchain.pem', 'privkey.pem']) {
  if (!existsSync(resolve(loreQuicCertDir, file))) throw new Error(`LORE_QUIC_CERT_DIR is missing ${file}`)
}
for (const name of required.filter((value) => value.endsWith('_IMAGE_DIGEST'))) {
  if (!/^.+@sha256:[a-f0-9]{64}$/.test(process.env[name])) throw new Error(`${name} must be an immutable image digest`)
}
const compose = readFileSync(resolve(process.cwd(), 'templates/compose.prod.yaml'), 'utf8')
const authEnv = readFileSync(resolve(process.cwd(), process.env.AUTH_ENV_FILE), 'utf8')
const loreEnv = readFileSync(resolve(process.cwd(), process.env.LORE_ENV_FILE), 'utf8')
const versions = readFileSync(resolve(process.cwd(), '../lore/versions.yaml'), 'utf8')
const lore = versions.match(/^lore:\n([\s\S]*?)(?=^[^ ])/m)?.[1]
const loreImage = lore?.match(/^  image: "([^"]+)"$/m)?.[1]
const loreSource = lore?.match(/^  source_commit: "([a-f0-9]{40})"$/m)?.[1]
const lorePackaging = lore?.match(/^  packaging_commit: "([a-f0-9]{40})"$/m)?.[1]
const controlPlane = versions.match(/^control-plane:\n([\s\S]*?)(?=^[^ ])/m)?.[1]
const authImage = controlPlane?.match(/^  image: "([^"]+)"$/m)?.[1]
const authSource = controlPlane?.match(/^  source_commit: "([a-f0-9]{40})"$/m)?.[1]
const authProtocol = controlPlane?.match(/^  protocol_commit: "([a-f0-9]{40})"$/m)?.[1]
if (!loreImage || !loreSource || !lorePackaging) throw new Error('lore must be promoted before Mac deployment')
if (!/^portalshq\/lore@sha256:[a-f0-9]{64}$/.test(loreImage)) throw new Error('lore.image must be an immutable Docker Hub digest')
if (process.env.LORE_IMAGE_DIGEST !== loreImage) throw new Error('LORE_IMAGE_DIGEST must match lore.image')
if (!authImage || !authSource || !authProtocol) throw new Error('control-plane image must be promoted before deployment')
if (!/^portalshq\/auth-gateway@sha256:[a-f0-9]{64}$/.test(authImage)) throw new Error('control-plane.image must be promoted to immutable Docker Hub portalshq/auth-gateway before Mac deployment')
if (process.env.AUTH_GATEWAY_IMAGE_DIGEST !== authImage) throw new Error('AUTH_GATEWAY_IMAGE_DIGEST must match the Docker Hub control-plane.image')
const dockerHubReceipts = JSON.parse(readFileSync(resolve(process.cwd(), '../lore/verified-dockerhub-images.json'), 'utf8'))
const dockerHubReceipt = dockerHubReceipts?.receipts?.[loreImage]
if (dockerHubReceipt?.platform !== 'linux/amd64' || dockerHubReceipt?.sourceCommit !== loreSource || dockerHubReceipt?.packagingCommit !== lorePackaging || dockerHubReceipt?.signature?.issuer !== 'https://token.actions.githubusercontent.com' || dockerHubReceipt?.trivyScan?.critical !== 0 || dockerHubReceipt?.trivyScan?.high !== 0) throw new Error('lore Docker Hub receipt is incomplete or mismatched')
const authReceipts = dockerHubReceipts
const authReceipt = authReceipts?.receipts?.[authImage]
if (authReceipt?.service !== 'auth-gateway' || authReceipt?.platform !== 'linux/amd64' || authReceipt?.sourceCommit !== authSource || authReceipt?.protocolCommit !== authProtocol || authReceipt?.signature?.issuer !== 'https://token.actions.githubusercontent.com' || authReceipt?.trivyScan?.critical !== 0 || authReceipt?.trivyScan?.high !== 0) throw new Error('Auth Gateway Docker Hub receipt is incomplete or mismatched')
for (const [name, expected] of [
  ['OIDC_ISSUER', undefined],
  ['OIDC_CLIENT_ID', undefined],
  ['OIDC_REDIRECT_URI', undefined],
  ['JWT_SIGNING_PROVIDER', 'sealed-file'],
  ['JWT_LOCAL_PRIVATE_KEY_PATH', '/run/secrets/auth/signing-key'],
  ['API_KEY_PEPPER_PROVIDER', 'sealed-file'],
  ['API_KEY_PEPPER_FILE_PATH', '/run/secrets/auth/api-key-pepper'],
]) {
  const expression = expected ? `^${name}=${expected}$` : `^${name}=.+`
  if (!new RegExp(expression, 'm').test(authEnv)) throw new Error(`AUTH_ENV_FILE must define ${name}${expected ? `=${expected}` : ''}`)
}
if (/^COGNITO_/m.test(authEnv)) throw new Error('AUTH_ENV_FILE must not select Cognito for the Mac release')
if (!/^LORE_REBAC_URL=http:\/\/auth-gateway:8087$/m.test(loreEnv)) throw new Error('LORE_ENV_FILE must use the Docker-neighbor ReBAC URL')
if (/next/i.test(compose)) throw new Error('Next.js must remain Vercel-hosted')
if (!compose.includes('127.0.0.1:41337:41337/udp')) throw new Error('Lore QUIC must remain UDP-mapped')
if (!compose.includes('127.0.0.1:41339:41339')) throw new Error('Lore health must remain loopback-only')
if (compose.includes('delivery-worker')) throw new Error('ProductCharacters delivery worker must not gate the Portals MVP deployment')
if (/0\.0\.0\.0/.test(compose)) throw new Error('Mac services must not bind wildcard host ports')
const caddy = readFileSync(resolve(process.cwd(), 'templates/Caddyfile'), 'utf8')
const caddyEnv = readFileSync(resolve(process.cwd(), process.env.CADDY_ENV_FILE), 'utf8')
if (/app\./i.test(caddy)) throw new Error('Caddy must not proxy the Vercel application')
for (const forbidden of [':8086', ':8087', ':41339', '/health']) {
  if (caddy.includes(forbidden)) throw new Error(`Caddy must not publish internal endpoint ${forbidden}`)
}
for (const domain of ['AUTH_DOMAIN', 'LORE_DOMAIN']) {
  if (!new RegExp(`\\{\\$${domain}\\}`).test(caddy)) throw new Error(`Caddy must use ${domain}`)
  if (!new RegExp(`^${domain}=.+`, 'm').test(caddyEnv)) throw new Error(`Caddy env must define ${domain}`)
}
if (caddy.includes('auto_https disable')) throw new Error('Caddy TLS cannot be disabled in production')
if (!caddy.includes('/run/secrets/caddy/fullchain.pem') || !caddy.includes('/run/secrets/caddy/privkey.pem')) throw new Error('Caddy must require provisioned TLS certificates')
if (!compose.includes('127.0.0.1:8443:443')) throw new Error('Caddy TLS must be exposed only through the loopback Pinggy target')
if (!compose.includes(':/run/secrets/auth:ro')) throw new Error('Auth sealed secrets must be mounted read-only')
console.log('Mac release manifest checks passed')
