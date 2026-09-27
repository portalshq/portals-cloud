import {existsSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const required = [
  'AUTH_GATEWAY_IMAGE_DIGEST',
  'LORE_IMAGE_DIGEST',
  'DELIVERY_WORKER_IMAGE_DIGEST',
  'CADDY_IMAGE_DIGEST',
  'AUTH_ENV_FILE',
  'LORE_ENV_FILE',
  'WORKER_ENV_FILE',
  'CADDY_ENV_FILE',
  'CADDY_CERT_DIR',
  'LORE_QUIC_CERT_DIR',
]
const missing = required.filter((name) => !process.env[name])
if (missing.length) throw new Error(`missing release inputs: ${missing.join(', ')}`)
for (const name of required.filter((value) => value.endsWith('_ENV_FILE'))) {
  if (!existsSync(resolve(process.cwd(), process.env[name]))) throw new Error(`${name} does not point to an existing file`)
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
const workerEnv = readFileSync(resolve(process.cwd(), process.env.WORKER_ENV_FILE), 'utf8')
const versions = readFileSync(resolve(process.cwd(), '../lore/versions.yaml'), 'utf8')
const macLore = versions.match(/^mac-lore:\n([\s\S]*?)(?=^[^ ])/m)?.[1]
const macLoreImage = macLore?.match(/^  image: "([^"]+)"$/m)?.[1]
const macLoreSource = macLore?.match(/^  source_commit: "([a-f0-9]{40})"$/m)?.[1]
const macLorePackaging = macLore?.match(/^  packaging_commit: "([a-f0-9]{40})"$/m)?.[1]
if (!macLoreImage || !macLoreSource || !macLorePackaging) throw new Error('mac-lore must be promoted before Mac deployment')
if (process.env.LORE_IMAGE_DIGEST !== macLoreImage) throw new Error('LORE_IMAGE_DIGEST must match mac-lore.image')
const dockerHubReceipts = JSON.parse(readFileSync(resolve(process.cwd(), '../lore/verified-dockerhub-images.json'), 'utf8'))
const dockerHubReceipt = dockerHubReceipts?.receipts?.[macLoreImage]
if (dockerHubReceipt?.platform !== 'linux/amd64' || dockerHubReceipt?.sourceCommit !== macLoreSource || dockerHubReceipt?.packagingCommit !== macLorePackaging || dockerHubReceipt?.signature?.issuer !== 'https://token.actions.githubusercontent.com' || dockerHubReceipt?.trivyScan?.critical !== 0 || dockerHubReceipt?.trivyScan?.high !== 0) throw new Error('mac-lore Docker Hub receipt is incomplete or mismatched')
const sdkVersion = versions.match(/\nlore-sdk:\s*\n(?:.*\n)*?\s+version:\s*["']([^"']+)["']/)?.[1]
if (!sdkVersion) throw new Error('versions.yaml must declare lore-sdk.version')
if (!new RegExp(`^LORE_SDK_VERSION=${sdkVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm').test(workerEnv)) throw new Error(`WORKER_ENV_FILE must pin LORE_SDK_VERSION=${sdkVersion}`)
if (/next/i.test(compose)) throw new Error('Next.js must remain Vercel-hosted')
if (!compose.includes('127.0.0.1:41337:41337/udp')) throw new Error('Lore QUIC must remain UDP-mapped')
if (!compose.includes('127.0.0.1:41339:41339')) throw new Error('Lore health must remain loopback-only')
if (!compose.includes('127.0.0.1:8090:8090')) throw new Error('worker wake endpoint must remain loopback-only')
if (/0\.0\.0\.0/.test(compose)) throw new Error('Mac services must not bind wildcard host ports')
const caddy = readFileSync(resolve(process.cwd(), 'templates/Caddyfile'), 'utf8')
const caddyEnv = readFileSync(resolve(process.cwd(), process.env.CADDY_ENV_FILE), 'utf8')
if (/app\./i.test(caddy)) throw new Error('Caddy must not proxy the Vercel application')
if (!caddy.includes('/internal/wake')) throw new Error('Caddy must expose only the signed worker wake path')
for (const forbidden of [':8086', ':8087', ':41339', '/health']) {
  if (caddy.includes(forbidden)) throw new Error(`Caddy must not publish internal endpoint ${forbidden}`)
}
for (const domain of ['AUTH_DOMAIN', 'LORE_DOMAIN', 'WORKER_DOMAIN']) {
  if (!new RegExp(`\\{\\$${domain}\\}`).test(caddy)) throw new Error(`Caddy must use ${domain}`)
  if (!new RegExp(`^${domain}=.+`, 'm').test(caddyEnv)) throw new Error(`Caddy env must define ${domain}`)
}
if (caddy.includes('auto_https disable')) throw new Error('Caddy TLS cannot be disabled in production')
if (!caddy.includes('/run/secrets/caddy/fullchain.pem') || !caddy.includes('/run/secrets/caddy/privkey.pem')) throw new Error('Caddy must require provisioned TLS certificates')
if (!compose.includes('127.0.0.1:8443:443')) throw new Error('Caddy TLS must be exposed only through the loopback Pinggy target')
console.log('Mac release manifest checks passed')
