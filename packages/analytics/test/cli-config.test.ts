import { describe, expect, it } from 'vitest'
import { parseConnectorEnv } from '../src/cli.js'

const base = {
  ANALYTICS_DATABASE_URL: 'postgres://example.invalid/db',
  SEGMENT_SERVER_WRITE_KEY: 'key',
  ANALYTICS_APP_ID: 'app',
  ANALYTICS_TENANT_ID: 'tenant',
  ANALYTICS_START_AT: '2026-06-01T00:00:00Z',
} as NodeJS.ProcessEnv

describe('connector environment validation', () => {
  it('requires all launch configuration including the UTC cutoff', () => {
    expect(() => parseConnectorEnv({} as NodeJS.ProcessEnv)).toThrow(/ANALYTICS_START_AT/)
    for (const key of Object.keys(base)) {
      const env = { ...base } as Record<string, string>
      delete env[key]
      expect(() => parseConnectorEnv(env as NodeJS.ProcessEnv)).toThrow(key)
    }
  })
  it('rejects a malformed cutoff and out-of-range tuning', () => {
    expect(() => parseConnectorEnv({ ...base, ANALYTICS_START_AT: 'yesterday' })).toThrow(/ANALYTICS_START_AT/)
    expect(() => parseConnectorEnv({ ...base, ANALYTICS_BATCH_SIZE: '0' })).toThrow(/ANALYTICS_BATCH_SIZE/)
    expect(() => parseConnectorEnv({ ...base, ANALYTICS_INTERVAL_MS: '10' })).toThrow(/ANALYTICS_INTERVAL_MS/)
  })
  it('normalizes a valid configuration and never echoes secrets', () => {
    const config = parseConnectorEnv({ ...base, ANALYTICS_BATCH_SIZE: '50' })
    expect(config).toMatchObject({ appId: 'app', tenantId: 'tenant', startAt: '2026-06-01T00:00:00.000Z', batchSize: 50 })
    try { parseConnectorEnv({ ...base, SEGMENT_SERVER_WRITE_KEY: '' }) } catch (error) {
      expect(String(error)).not.toContain('postgres://example.invalid')
    }
  })
  it('supports billing-only operation without a context module', () => {
    expect(parseConnectorEnv(base).contextModule).toBeUndefined()
    expect(parseConnectorEnv({ ...base, ANALYTICS_CONTEXT_MODULE: '/opt/context.mjs' }).contextModule).toBe('/opt/context.mjs')
  })
})
