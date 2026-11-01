#!/usr/bin/env node
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { AnalyticsConnector } from './connector.js';
import { createSegmentHttpTransport, createSegmentSink } from './adapters/segment.js';

export interface CliConfig {
  databaseUrl: string;
  writeKey: string;
  appId: string;
  tenantId: string;
  startAt: string;
  batchSize?: number;
  intervalMs?: number;
  contextModule?: string;
}

/** Parses and validates process configuration before any connection or
 *  migration is attempted. Throws a safe error that never includes the values. */
export function parseConnectorEnv(env: NodeJS.ProcessEnv): CliConfig {
  const missing = ['ANALYTICS_DATABASE_URL', 'SEGMENT_SERVER_WRITE_KEY', 'ANALYTICS_APP_ID', 'ANALYTICS_TENANT_ID', 'ANALYTICS_START_AT']
    .filter(name => !env[name]);
  if (missing.length) throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  const startAt = env.ANALYTICS_START_AT!;
  if (!Number.isFinite(Date.parse(startAt)) || !/T/.test(startAt)) {
    throw new Error('ANALYTICS_START_AT must be a UTC ISO-8601 timestamp');
  }
  const parseBounded = (name: string, min: number, max: number): number | undefined => {
    const raw = env[name];
    if (raw === undefined) return undefined;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
    return value;
  };
  return {
    databaseUrl: env.ANALYTICS_DATABASE_URL!,
    writeKey: env.SEGMENT_SERVER_WRITE_KEY!,
    appId: env.ANALYTICS_APP_ID!,
    tenantId: env.ANALYTICS_TENANT_ID!,
    startAt: new Date(startAt).toISOString(),
    batchSize: parseBounded('ANALYTICS_BATCH_SIZE', 1, 500),
    intervalMs: parseBounded('ANALYTICS_INTERVAL_MS', 1000, 3_600_000),
    contextModule: env.ANALYTICS_CONTEXT_MODULE,
  };
}

interface TrustedContextModule {
  resolveWorld?: (worldId: string) => Promise<string | undefined>;
  resolveInteractionIdentity?: (record: Readonly<Record<string, unknown>>) => Promise<{userId: string} | undefined>;
}

async function main() {
  const config = parseConnectorEnv(process.env);
  // The context module is host-owned code: it authorizes world-to-tenant
  // mapping and verifies interaction identities. Without it the connector
  // runs billing-only and reports interaction delivery as unavailable.
  let context: TrustedContextModule | undefined;
  if (config.contextModule) {
    context = await import(pathToFileURL(resolve(config.contextModule)).href) as TrustedContextModule;
    if (typeof context.resolveWorld !== 'function' || typeof context.resolveInteractionIdentity !== 'function') {
      throw new Error('ANALYTICS_CONTEXT_MODULE must export resolveWorld and resolveInteractionIdentity');
    }
  }
  const pool = new pg.Pool({connectionString: config.databaseUrl, max: 3});
  const connector = new AnalyticsConnector({
    db: pool, destination: `segment.${config.appId}.${config.tenantId}`, appId: config.appId, startAt: config.startAt,
    sink: createSegmentSink(createSegmentHttpTransport({writeKey: config.writeKey})),
    authorizeTenant: async value => value === config.tenantId,
    resolveWorld: context?.resolveWorld?.bind(context),
    resolveInteractionIdentity: context?.resolveInteractionIdentity?.bind(context),
    batchSize: config.batchSize, intervalMs: config.intervalMs,
    onError: () => console.error('Analytics delivery failed; inspect portals_analytics_delivery'),
  });
  try {
    await connector.start();
    const status = await connector.status();
    console.log(`Analytics connector running: billing=${status.sources.billing} interaction=${status.sources.interaction}`);
  } catch (error) {
    await pool.end();
    throw error;
  }
  const shutdown = async () => { await connector.stop(); await pool.end(); };
  process.once('SIGTERM', () => { void shutdown(); });
  process.once('SIGINT', () => { void shutdown(); });
}
if (process.env.NODE_ENV !== 'test' && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Analytics connector could not start; check configuration and database access'); process.exitCode = 1; });
}
