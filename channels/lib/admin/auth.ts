/**
 * Bearer-token guard shared by every /api/admin/* route.
 *
 * `requireAdmin` returns null when the request is allowed, or the Response to
 * send back. When CHANNELS_ADMIN_TOKEN is unset the whole surface is disabled
 * (503) — silently open admin routes are never acceptable.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { adminEnv } from "./env";
import { jsonError } from "./http";

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

export function requireAdmin(request: Request): Response | null {
  const { adminToken } = adminEnv();
  if (!adminToken) {
    return jsonError(503, "Admin API is not configured");
  }
  const token = bearerToken(request);
  if (!token || !tokenMatches(token, adminToken)) {
    return jsonError(401, "Unauthorized");
  }
  return null;
}
