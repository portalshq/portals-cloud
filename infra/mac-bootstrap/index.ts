import * as pulumi from '@pulumi/pulumi'

const config = new pulumi.Config()
const manifest = {
  architecture: 'mac-amd64',
  nextHosting: 'vercel',
  services: ['auth-gateway', 'lore', 'caddy', 'pinggy'],
  ports: {
    authGrpc: 8084,
    authHttp: 8085,
    authInternal: 8086,
    authRebac: 8087,
    loreTcp: 41337,
    loreQuic: 41337,
  },
  imageDigests: {
    authGateway: config.require('authGatewayImageDigest'),
    lore: config.require('loreImageDigest'),
    caddy: config.require('caddyImageDigest'),
  },
  secretFiles: {
    authEnv: config.get('authEnvFile') ?? '/Users/portals-svc/secrets/auth.env',
    loreEnv: config.get('loreEnvFile') ?? '/Users/portals-svc/secrets/lore.env',
    caddyEnv: config.get('caddyEnvFile') ?? '/Users/portals-svc/secrets/caddy.env',
  },
  backup: {
    sourceDirectory: config.get('backupSourceDirectory') ?? '/Users/portals-svc/recovery',
    retentionNotice: 'off-Mac encrypted storage; provider backups remain separate',
  },
  domains: {
    auth: config.require('authDomain'),
    lore: config.require('loreDomain'),
    quic: config.require('loreQuicDomain'),
  },
}

export const releaseManifest = pulumi.jsonStringify(manifest)
export const composeTemplate = 'templates/compose.prod.yaml'
export const provisioningBoundary = 'local Mac scripts + launchd; external providers remain explicit'
