import {readFileSync} from 'node:fs'

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)))
for (const name of [
  '@portalshq/analytics',
  '@portalshq/capability-email-notifications',
  '@portalshq/capability-identity',
  '@portalshq/capability-video-delivery',
  '@portalshq/channel-registry',
]) {
  const entry = lock.packages[`node_modules/${name}`]
  if (entry?.link || !entry?.resolved?.startsWith('https://registry.npmjs.org/')) {
    throw new Error(`${name} must resolve from the npm registry, not a local workspace link`)
  }
}
