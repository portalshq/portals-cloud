import { describe, expect, it } from "vitest";
import {
  DEFAULT_GUEST_TOKEN_TTL_MS,
  GUEST_ID_PATTERN,
  guestActorIdFromHeaders,
  mintGuestToken,
  verifyGuestToken,
} from "./guest-token.js";

const SECRET = "test-hmac-secret";
const GUEST_ID = "guest-22222222-2222-4222-8222-222222222222";

describe("guest trial tokens", () => {
  it("mints and verifies a signed token round-trip", () => {
    const token = mintGuestToken({ secret: SECRET, guestId: GUEST_ID, nowMs: 1_000_000 });
    expect(token).toMatch(/^gt1\.guest-[0-9a-f-]{36}\.\d+\.[0-9a-f]{64}$/i);
    expect(verifyGuestToken(token, { secret: SECRET, nowMs: 1_000_500 })).toBe(GUEST_ID);
  });

  it("generates a fresh guest id when none is supplied", () => {
    const token = mintGuestToken({ secret: SECRET, nowMs: 1_000_000 });
    const guestId = token.split(".")[1];
    expect(guestId).toMatch(GUEST_ID_PATTERN);
    expect(verifyGuestToken(token, { secret: SECRET, nowMs: 1_000_500 })).toBe(guestId);
  });

  it("rejects tampered, expired, malformed, and foreign-secret tokens", () => {
    const token = mintGuestToken({ secret: SECRET, guestId: GUEST_ID, nowMs: 1_000_000 });
    expect(verifyGuestToken(token, { secret: "wrong-secret", nowMs: 1_000_500 })).toBeNull();
    expect(verifyGuestToken(`${token}0`, { secret: SECRET, nowMs: 1_000_500 })).toBeNull();
    expect(verifyGuestToken(token, { secret: SECRET, nowMs: 1_000_000 + DEFAULT_GUEST_TOKEN_TTL_MS + 1 })).toBeNull();
    expect(verifyGuestToken("invalid-token", { secret: SECRET })).toBeNull();
    expect(verifyGuestToken("gt1.only-two-parts", { secret: SECRET })).toBeNull();
    expect(verifyGuestToken("gt1.not-a-guest-id.9999999999999.abcd", { secret: SECRET })).toBeNull();
    expect(verifyGuestToken(undefined, { secret: SECRET })).toBeNull();
    expect(verifyGuestToken(null, { secret: SECRET })).toBeNull();
  });

  it("honours a custom ttl for session-lived reminder links", () => {
    const nowMs = 1_000_000;
    const token = mintGuestToken({ secret: SECRET, guestId: GUEST_ID, nowMs, ttlMs: 7 * 24 * 60 * 60 * 1000 });
    expect(verifyGuestToken(token, { secret: SECRET, nowMs: nowMs + 3 * 24 * 60 * 60 * 1000 })).toBe(GUEST_ID);
    expect(verifyGuestToken(token, { secret: SECRET, nowMs: nowMs + 8 * 24 * 60 * 60 * 1000 })).toBeNull();
  });

  it("rejects a guest id that does not match the pattern", () => {
    expect(() => mintGuestToken({ secret: SECRET, guestId: "not-a-guest" })).toThrow(TypeError);
  });
});

describe("guestActorIdFromHeaders", () => {
  it("extracts the verified actor from X-Guest-Token", () => {
    const token = mintGuestToken({ secret: SECRET, guestId: GUEST_ID });
    expect(guestActorIdFromHeaders({ "x-guest-token": token }, SECRET)).toBe(GUEST_ID);
  });

  it("returns null for missing, forged, or disabled-secret requests", () => {
    expect(guestActorIdFromHeaders({}, SECRET)).toBeNull();
    expect(guestActorIdFromHeaders({ "x-guest-token": "gt1.forged" }, SECRET)).toBeNull();
    const token = mintGuestToken({ secret: SECRET, guestId: GUEST_ID });
    expect(guestActorIdFromHeaders({ "x-guest-token": token }, null)).toBeNull();
    expect(guestActorIdFromHeaders({ "x-guest-token": token }, undefined)).toBeNull();
    expect(guestActorIdFromHeaders({ "x-guest-token": [token, "other"] }, SECRET)).toBe(GUEST_ID);
  });
});
