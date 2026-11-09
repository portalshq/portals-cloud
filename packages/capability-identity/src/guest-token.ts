import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Guest trial tokens: lightweight HMAC-signed credentials (`gt1.<guestId>.<expiresAt>.<sig>`)
 * that let unauthenticated viewers perform a bounded set of free interactions
 * (one vote, a few reactions) before hitting the sign-in wall.
 *
 * The signature is the whole security model: a bare caller-chosen guest id is
 * forgeable, so every guest code path must verify the token — never accept a
 * raw `X-Guest-Id` header. The secret must be stable across restarts and
 * instances or issued tokens stop verifying.
 */

export const GUEST_ID_PATTERN = /^guest-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEFAULT_GUEST_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface MintGuestTokenOptions {
  secret: string;
  /** Defaults to a fresh `guest-<uuid>`. Must match GUEST_ID_PATTERN. */
  guestId?: string;
  nowMs?: number;
  /** Overrides the default 24h life — e.g. reminder deep links mint a token
   *  that lives until the session ends. */
  ttlMs?: number;
}

/** Mints a signed guest token. `ttlMs` defaults to {@link DEFAULT_GUEST_TOKEN_TTL_MS}. */
export function mintGuestToken(options: MintGuestTokenOptions): string {
  const { secret, guestId = `guest-${randomUUID()}`, nowMs = Date.now(), ttlMs = DEFAULT_GUEST_TOKEN_TTL_MS } = options;
  if (!GUEST_ID_PATTERN.test(guestId)) throw new TypeError("guestId must match guest-<uuid>.");
  const expiresAt = nowMs + ttlMs;
  const payload = `gt1.${guestId}.${expiresAt}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export interface VerifyGuestTokenOptions {
  secret: string;
  nowMs?: number;
}

/**
 * Verifies a guest token and returns its embedded `guest-<uuid>` actor id,
 * or `null` if malformed, expired, or forged.
 */
export function verifyGuestToken(token: string | undefined | null, options: VerifyGuestTokenOptions): string | null {
  const { secret, nowMs = Date.now() } = options;
  if (typeof token !== "string" || !token.startsWith("gt1.")) return null;
  const parts = token.trim().split(".");
  if (parts.length !== 4) return null;
  const [, guestId, expiresRaw, suppliedSig] = parts;
  if (!GUEST_ID_PATTERN.test(guestId)) return null;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return null;
  const expectedSig = createHmac("sha256", secret).update(`gt1.${guestId}.${expiresAt}`).digest("hex");
  if (Buffer.byteLength(expectedSig) !== Buffer.byteLength(suppliedSig)) return null;
  if (!timingSafeEqual(Buffer.from(expectedSig), Buffer.from(suppliedSig))) return null;
  return guestId;
}

/**
 * Extracts the verified guest actor id from request headers (`X-Guest-Token`).
 * Returns `null` when the header is absent, malformed, expired, or forged —
 * and when `secret` is null/empty, which is how apps disable guest trials.
 */
export function guestActorIdFromHeaders(
  headers: { "x-guest-token"?: string | string[] | undefined },
  secret: string | null | undefined,
): string | null {
  if (!secret) return null;
  const rawToken = headers["x-guest-token"];
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  if (typeof token !== "string" || !token.trim()) return null;
  return verifyGuestToken(token.trim(), { secret });
}
