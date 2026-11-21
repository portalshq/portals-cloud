import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateAdmin } from "../lib/admin/auth";
import { assertChannelInScope, assertProgramEditable, channelInScope, scopedChannelClause } from "../lib/admin/scope";
import { mergeSchedulePatch, parseScheduleConfig } from "../lib/admin/schedule";
import { AdminApiError, adminErrorResponse, badRequest } from "../lib/admin/http";
import { databasePoolConfig } from "../lib/admin/db";
import { ADMIN_TOKEN, SCOPED_CHANNEL_IDS, SCOPED_TOKEN, makePool, resetPools, sha256Hex, stubAdminEnv, usePools } from "./helpers";

beforeEach(() => stubAdminEnv());
afterEach(() => {
  resetPools();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("authenticateAdmin", () => {
  it("returns 503 when neither the env token nor the central database is configured", async () => {
    stubAdminEnv({ CHANNELS_ADMIN_TOKEN: undefined, CENTRAL_DATABASE_URL: undefined });
    const auth = await authenticateAdmin(new Request("https://x.test/api/admin/info"));
    expect(auth.ok).toBe(false);
    expect(!auth.ok && auth.response.status).toBe(503);
  });

  it("returns 401 for missing, malformed, and wrong tokens", async () => {
    usePools({ central: makePool(() => ({ rows: [] })) });
    for (const header of [null, "Bearer", "Bearer wrong", "Basic abc"]) {
      const req = new Request("https://x.test/api/admin/info", {
        headers: header ? { authorization: header } : {},
      });
      const auth = await authenticateAdmin(req);
      expect(auth.ok).toBe(false);
      expect(!auth.ok && auth.response.status).toBe(401);
    }
  });

  it("grants the all-channels scope to the env superuser token", async () => {
    const req = new Request("https://x.test/api/admin/info", {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    await expect(authenticateAdmin(req)).resolves.toEqual({ ok: true, scope: { allChannels: true } });
  });

  it("grants a channel scope from a matching channel_admin_tokens row", async () => {
    usePools({
      central: makePool((text) =>
        text.includes("channel_admin_tokens")
          ? { rows: [{ channel_ids: SCOPED_CHANNEL_IDS }] }
          : { rows: [] },
      ),
    });
    const req = new Request("https://x.test/api/admin/info", {
      headers: { authorization: `Bearer ${SCOPED_TOKEN}` },
    });
    await expect(authenticateAdmin(req)).resolves.toEqual({
      ok: true,
      scope: { allChannels: false, channelIds: SCOPED_CHANNEL_IDS },
    });
  });

  it("looks the token up by sha256 hash", async () => {
    const central = makePool(() => ({ rows: [] }));
    usePools({ central });
    const req = new Request("https://x.test/api/admin/info", {
      headers: { authorization: `Bearer ${SCOPED_TOKEN}` },
    });
    expect((await authenticateAdmin(req)).ok).toBe(false);
    expect(central.query).toHaveBeenCalledWith(
      expect.stringContaining("channel_admin_tokens"),
      [sha256Hex(SCOPED_TOKEN)],
    );
  });

  it("401s on a revoked or unknown scoped token, even when the env token is unset", async () => {
    stubAdminEnv({ CHANNELS_ADMIN_TOKEN: undefined });
    usePools({ central: makePool(() => ({ rows: [] })) });
    const req = new Request("https://x.test/api/admin/info", {
      headers: { authorization: `Bearer ${SCOPED_TOKEN}` },
    });
    const auth = await authenticateAdmin(req);
    expect(auth.ok).toBe(false);
    expect(!auth.ok && auth.response.status).toBe(401);
  });

  it("401s rather than 500s when the token lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubAdminEnv({ CHANNELS_ADMIN_TOKEN: undefined });
    usePools({ central: makePool(() => { throw new Error("connection refused"); }) });
    const req = new Request("https://x.test/api/admin/info", {
      headers: { authorization: `Bearer ${SCOPED_TOKEN}` },
    });
    const auth = await authenticateAdmin(req);
    expect(auth.ok).toBe(false);
    expect(!auth.ok && auth.response.status).toBe(401);
  });
});

describe("databasePoolConfig", () => {
  it("allows a non-Neon database with complete mTLS material", () => {
    const config = databasePoolConfig("postgresql://db.portals.works:5432/channels", "CENTRAL", {
      NODE_ENV: "production",
      CENTRAL_DATABASE_SSL_CA: "-----BEGIN CERTIFICATE-----\\nca\\n-----END CERTIFICATE-----",
      CENTRAL_DATABASE_SSL_CERT: "client-cert",
      CENTRAL_DATABASE_SSL_KEY: "client-key",
    });
    expect(config.max).toBe(2);
    expect(config.ssl).toEqual({
      ca: "-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----",
      cert: "client-cert",
      key: "client-key",
      rejectUnauthorized: true,
    });
  });

  it("rejects production non-Neon connections without mTLS", () => {
    expect(() => databasePoolConfig("postgresql://db.portals.works:5432/channels", "CENTRAL", {
      NODE_ENV: "production",
    })).toThrow(/non-Neon database requires mTLS/);
  });
});

describe("scope helpers", () => {
  const scoped = { allChannels: false as const, channelIds: SCOPED_CHANNEL_IDS };

  it("channelInScope covers the superuser and membership", () => {
    expect(channelInScope({ allChannels: true }, "anything")).toBe(true);
    expect(channelInScope(scoped, "bears")).toBe(true);
    expect(channelInScope(scoped, "garden")).toBe(false);
  });

  it("assertChannelInScope throws a 403 AdminApiError outside the scope", () => {
    expect(() => assertChannelInScope(scoped, "bears")).not.toThrow();
    expect(() => assertChannelInScope(scoped, "garden")).toThrowError(AdminApiError);
    try {
      assertChannelInScope(scoped, "garden");
    } catch (error) {
      expect((error as AdminApiError).status).toBe(403);
    }
  });

  it("scopedChannelClause pushes the channel array as the next bind parameter", () => {
    const values: unknown[] = [];
    expect(scopedChannelClause(scoped, values)).toBe("channel_id = ANY($1)");
    expect(values).toEqual([SCOPED_CHANNEL_IDS]);
    expect(scopedChannelClause({ allChannels: true }, [])).toBeNull();
  });

  it("assertProgramEditable checks every bound channel for scoped tokens", async () => {
    const pool = makePool((text) =>
      text.includes("bindings")
        ? { rows: [{ channel_id: "bears" }, { channel_id: "garden" }] }
        : { rows: [] },
    );
    await expect(assertProgramEditable(scoped, pool, "program-1")).rejects.toThrowError(
      /bound to channels outside this token's scope: garden/,
    );
  });

  it("assertProgramEditable rejects unbound programs for scoped tokens", async () => {
    const pool = makePool(() => ({ rows: [] }));
    await expect(assertProgramEditable(scoped, pool, "program-1")).rejects.toThrowError(
      /not bound to any channel/,
    );
  });

  it("assertProgramEditable is a no-op for the superuser", async () => {
    const pool = makePool(() => ({ rows: [] }));
    await expect(assertProgramEditable({ allChannels: true }, pool, "program-1")).resolves.toBeUndefined();
    expect(pool.query).not.toHaveBeenCalled();
  });
});

const baseSchedule = {
  scheduledDays: ["monday", "wednesday"],
  scheduledTime: "19:00",
  timezone: "America/Denver",
  episodeDurationMs: 1_800_000,
  ambientDurationMs: 900_000,
};

describe("parseScheduleConfig", () => {
  it("accepts a complete config and lowercases days", () => {
    const parsed = parseScheduleConfig({ ...baseSchedule, scheduledDays: ["Monday"] });
    expect(parsed.scheduledDays).toEqual(["monday"]);
    expect(parsed.scheduledTime).toBe("19:00");
  });

  it("allows omitted scheduledDays (every day)", () => {
    const { scheduledDays: _days, ...rest } = baseSchedule;
    expect(parseScheduleConfig(rest).scheduledDays).toBeUndefined();
  });

  it("rejects non-object, bad days, bad time, bad timezone, bad durations", () => {
    const cases: unknown[] = [
      null,
      "x",
      { ...baseSchedule, scheduledDays: ["funday"] },
      { ...baseSchedule, scheduledDays: "monday" },
      { ...baseSchedule, scheduledTime: "7pm" },
      { ...baseSchedule, scheduledTime: "24:00" },
      { ...baseSchedule, timezone: "Not/AZone" },
      { ...baseSchedule, episodeDurationMs: 0 },
      { ...baseSchedule, ambientDurationMs: 1.5 },
      { ...baseSchedule, episodeDurationMs: "30min" },
      { scheduledTime: "19:00", timezone: "UTC" },
    ];
    for (const input of cases) {
      expect(() => parseScheduleConfig(input)).toThrowError(AdminApiError);
    }
  });
});

describe("mergeSchedulePatch", () => {
  it("merges only provided fields", () => {
    const merged = mergeSchedulePatch(baseSchedule, { scheduledTime: "20:30" });
    expect(merged).toEqual({ ...baseSchedule, scheduledTime: "20:30" });
  });

  it("clears scheduledDays to undefined via null", () => {
    const merged = mergeSchedulePatch(baseSchedule, { scheduledDays: null });
    expect(merged.scheduledDays).toBeUndefined();
  });

  it("rejects empty patches and invalid fields", () => {
    expect(() => mergeSchedulePatch(baseSchedule, {})).toThrowError(AdminApiError);
    expect(() => mergeSchedulePatch(baseSchedule, { scheduledTime: "noon" })).toThrowError(AdminApiError);
    expect(() => mergeSchedulePatch(baseSchedule, 5)).toThrowError(AdminApiError);
  });
});

describe("adminErrorResponse", () => {
  it("maps AdminApiError to its status", async () => {
    const res = adminErrorResponse(badRequest("nope"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "nope" });
  });

  it("hides unexpected error detail behind a 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = adminErrorResponse(new Error("postgres://secret@host/db failed"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ message: "Internal server error" });
  });

  it("reports creator/program ownership conflicts without leaking database detail", async () => {
    const res = adminErrorResponse({
      code: "23503",
      constraint: "station_program_slots_program_channel_owner",
      detail: "Key (program_id, channel_id)=(show, wrong-owner) is not present",
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ message: "The program does not belong to that creator channel." });
  });
});
