/**
 * Bearer-token guard shared by every /api/admin/* route.
 *
 * Two token kinds grant access, and the presented token decides the scope:
 *
 *  - The env superuser `CHANNELS_ADMIN_TOKEN` — every channel, every route.
 *  - A scoped token row in the central `channel_admin_tokens` table, matched
 *    by sha256(token) hex. Its `channel_ids` array is the scope: the token
 *    only sees and mutates those channels.
 *
 * When neither the env token nor the central database is configured the
 * whole surface is disabled (503) — silently open admin routes are never
 * acceptable.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { centralDb } from "./db";
import { adminEnv } from "./env";
import { jsonError } from "./http";

/** What the presented token may touch. A scoped token with an empty
 *  `channelIds` array simply has nothing to administer. */
export type AdminScope = { allChannels: true } | { allChannels: false; channelIds: string[] };

export type AdminAuth = { ok: true; scope: AdminScope } | { ok: false; response: Response };

interface ScopedTokenRow {
  channel_ids: string[];
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/** Constant-time compare that tolerates different-length inputs. */
function tokenMatches(candidate: string, expected: string): boolean {
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function scopedTokenScope(token: string): Promise<AdminScope | null> {
  const { centralDatabaseUrl } = adminEnv();
  if (!centralDatabaseUrl) return null;
  try {
    const { rows } = await centralDb().query<ScopedTokenRow>(
      "SELECT channel_ids FROM channel_admin_tokens WHERE token_hash = $1 AND revoked_at IS NULL",
      [sha256Hex(token)],
    );
    const channelIds = rows[0]?.channel_ids;
    return channelIds ? { allChannels: false, channelIds } : null;
  } catch (error) {
    // A broken central DB must not silently open or 500 the admin — report
    // and fall through to the 401 path below.
    console.error("[admin] channel_admin_tokens lookup failed:", error);
    return null;
  }
}

export async function authenticateAdmin(request: Request): Promise<AdminAuth> {
  const { adminToken, centralDatabaseUrl } = adminEnv();
  if (!adminToken && !centralDatabaseUrl) {
    return { ok: false, response: jsonError(503, "Admin API is not configured") };
  }
  const token = bearerToken(request);
  if (!token) return { ok: false, response: jsonError(401, "Unauthorized") };

  if (adminToken && tokenMatches(token, adminToken)) {
    return { ok: true, scope: { allChannels: true } };
  }
  const scope = await scopedTokenScope(token);
  if (scope) return { ok: true, scope };
  return { ok: false, response: jsonError(401, "Unauthorized") };
}
