import { afterEach, describe, expect, it, vi } from "vitest";
import { requireAdmin } from "../lib/admin/auth";
import { mergeSchedulePatch, parseScheduleConfig } from "../lib/admin/schedule";
import { AdminApiError, adminErrorResponse, badRequest } from "../lib/admin/http";
import { ADMIN_TOKEN, stubAdminEnv } from "./helpers";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireAdmin", () => {
  it("returns 503 when CHANNELS_ADMIN_TOKEN is unset", () => {
    delete process.env.CHANNELS_ADMIN_TOKEN;
    const res = requireAdmin(new Request("https://x.test/api/admin/info"));
    expect(res?.status).toBe(503);
  });

  it("returns 401 for missing, malformed, and wrong tokens", () => {
    stubAdminEnv();
    for (const header of [null, "Bearer", "Bearer wrong", "Basic abc"]) {
      const req = new Request("https://x.test/api/admin/info", {
        headers: header ? { authorization: header } : {},
      });
      expect(requireAdmin(req)?.status).toBe(401);
    }
  });

  it("allows the request when the bearer matches", () => {
    stubAdminEnv();
    const req = new Request("https://x.test/api/admin/info", {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(requireAdmin(req)).toBeNull();
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
});
