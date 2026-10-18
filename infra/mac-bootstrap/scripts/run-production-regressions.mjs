#!/usr/bin/env node
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

const root = resolve(import.meta.dirname, '../../..')
const node = process.execPath
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

// Deliberately construct a clean environment. This runner must not inherit
// production database URLs, cloud credentials, API keys, or release secrets.
const safeEnv = {
  PATH: process.env.PATH || '/usr/bin:/bin',
  HOME: process.env.HOME || '',
  TMPDIR: process.env.TMPDIR || '/tmp',
  CI: 'true',
  TZ: 'UTC',
  LEADS_DRY_RUN: 'true',
  NEXT_PUBLIC_SANITY_PROJECT_ID: 'acceptance-fixture',
  NEXT_PUBLIC_SANITY_DATASET: 'acceptance-fixture',
}

const localChecks = [
  ['release-preflight-regression', node, ['infra/mac-bootstrap/scripts/test-check-release-discovery.mjs']],
  ['lore-discovery-regression', node, ['infra/mac-bootstrap/scripts/test-check-lore-discovery.mjs']],
  ['external-tls-gate-regression', node, ['infra/mac-bootstrap/scripts/test-check-external.mjs']],
  ['oidc-provider-contract-regression', node, ['infra/mac-bootstrap/scripts/test-oidc-provider-validation.mjs']],
  ['pinggy-runner-regression', node, ['infra/mac-bootstrap/scripts/test-run-pinggy.mjs']],
  ['px-lore-auth-runner-regression', node, ['infra/mac-bootstrap/scripts/test-network-auth-runner.mjs']],
  ['px-bom-promotion-workflow-regression', node, ['infra/pulumi/scripts/test-px-release-promotion-workflow.mjs']],
  ['frontend-leads-crm-and-account-auth-tests', npm, ['--workspace', 'frontend', 'run', 'test:leads']],
  ['backend-crm-contract-and-health-tests', npm, ['--prefix', 'services/backend-service', 'test']],
]

const productionGates = [
  ['verified-px-lore-release-pair', 'Requires CI-verified PX and Lore release artifacts and merged BOM promotion.'],
  ['browser-oidc-and-token-lifecycle', 'Requires a real browser login fixture and successful callback, 900-second token, refresh/replay, key overlap, and audit evidence.'],
  ['px-production-auth-and-partition-denial', 'Requires the exact approved PX/Lore pair, isolated identities, two real repositories, and live network endpoint.'],
  ['pinggy-quic-and-cross-partition-denial', 'Requires a live UDP mapping, Lore-advertised quics:// endpoint, matching certificate, and authenticated PX QUIC reads/denials.'],
  ['aws-lore-storage-write-deny-and-restore', 'Requires the workload principal, isolated write fixture, explicit denial target, and isolated restore target.'],
  ['neon-migrations-and-invitations', 'Requires a disposable Neon branch, deployed Vercel-to-Backend route, controlled mailbox, and account/pilot fixtures.'],
  ['live-crm-cron-idempotency-and-retry', 'Requires a staging CRM tenant, synthetic lead, Neon outbox, and confirmed scheduler ownership.'],
  ['host-neon-lore-auth-and-dns-recovery-drills', 'Requires isolated recovery targets, approved RPO/RTO, off-Mac keys, and measured restore/reconnect drills.'],
]

function safeSummary(output) {
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const summaries = lines.filter(line => /^# (tests|pass|fail|skipped)\b/.test(line))
  const failure = lines.find(line => /^not ok \d+ - /.test(line))
  const assertion = lines.find(line => /^(AssertionError|Error:|npm error)/.test(line))
  return [...summaries, ...(failure ? [failure] : []), ...(assertion ? [assertion] : [])].slice(-6)
}

function runCheck([name, command, args]) {
  const started = Date.now()
  const result = spawnSync(command, args, {
    cwd: root,
    env: safeEnv,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  })
  const output = `${result.stdout || ''}\n${result.stderr || ''}`
  return {
    name,
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status ?? null,
    signal: result.signal || null,
    durationMs: Date.now() - started,
    summary: safeSummary(output),
    ...(result.error ? {error: result.error.message} : {}),
  }
}

function run() {
  const results = localChecks.map(runCheck)
  const localPassed = results.every(result => result.status === 'passed')
  process.stdout.write(JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scope: 'local-regression-only',
    localRegressionPassed: localPassed,
    productionGatePassed: false,
    checks: results,
    productionGates: productionGates.map(([name, reason]) => ({name, status: 'not-run', reason})),
    safety: {
      inheritedProviderCredentials: false,
      mutatesDnsOrServices: false,
      writesCloudResources: false,
      usesRealProviderFixtures: false,
    },
  }, null, 2) + '\n')
  if (!localPassed) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) run()
