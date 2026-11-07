import { vi } from "vitest";
import type pg from "pg";
import { setPoolsForTest } from "../lib/admin/db";

export const ADMIN_TOKEN = "test-admin-token";

type QueryResult = { rows: unknown[]; rowCount?: number };
type QueryHandler = (text: string, values?: unknown[]) => QueryResult;

/** Fake pg.Pool whose query delegates to a route-on-SQL handler. */
export function makePool(handler: QueryHandler): pg.Pool & { query: ReturnType<typeof vi.fn> } {
  const query = vi.fn(async (text: string, values?: unknown[]) => handler(text, values));
  return { query } as unknown as pg.Pool & { query: ReturnType<typeof vi.fn> };
}

/** Fake pg.PoolClient for the transactional channel create. */
export function makeClient(handler: QueryHandler): pg.PoolClient & { query: ReturnType<typeof vi.fn> } {
  const query = vi.fn(async (text: string, values?: unknown[]) => handler(text, values));
  return { query, release: vi.fn() } as unknown as pg.PoolClient & { query: ReturnType<typeof vi.fn> };
}

export function usePools(pools: { app?: pg.Pool | null; central?: pg.Pool | null }): void {
  setPoolsForTest({ app: pools.app ?? null, central: pools.central ?? null });
}

export function resetPools(): void {
  setPoolsForTest({ app: null, central: null });
}

export function stubAdminEnv(overrides: Record<string, string | undefined> = {}): void {
  vi.stubEnv("CHANNELS_ADMIN_TOKEN", ADMIN_TOKEN);
  vi.stubEnv("ADMIN_APP_DATABASE_URL", "postgres://localhost/bears-app");
  vi.stubEnv("ADMIN_CENTRAL_DATABASE_URL", "postgres://localhost/portals-central");
  vi.stubEnv("BEARS_API_BASE_URL", "http://bears.test");
  vi.stubEnv("BEARS_PRODUCTION_CONTROL_TOKEN", "control-token");
  for (const [key, value] of Object.entries(overrides)) {
    // stubEnv restores originals on unstubAllEnvs; delete directly for "unset" cases.
    if (value === undefined) delete process.env[key];
    else vi.stubEnv(key, value);
  }
}

export function adminRequest(
  path: string,
  init: { method?: string; body?: unknown; token?: string | null } = {},
): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token !== null) headers.authorization = `Bearer ${init.token ?? ADMIN_TOKEN}`;
  return new Request(`https://channels.example${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
