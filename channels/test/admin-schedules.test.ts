import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/admin/schedules/route";
import { DELETE, PATCH } from "../app/api/admin/schedules/[id]/route";
import {
  adminRequest,
  makePool,
  resetPools,
  stubAdminEnv,
  usePools,
} from "./helpers";

const ruleRow = {
  id: "rule-1",
  station_id: "station-1",
  program_id: "bears-live",
  channel_id: "bears",
  schedule: {
    scheduledDays: ["monday"],
    scheduledTime: "19:00",
    timezone: "America/Denver",
    episodeDurationMs: 1_800_000,
    ambientDurationMs: 900_000,
  },
  enabled: true,
  next_run_at: new Date("2026-11-07T02:00:00Z"),
  created_at: new Date("2026-11-01T00:00:00Z"),
  updated_at: new Date("2026-11-01T00:00:00Z"),
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => stubAdminEnv());
afterEach(() => {
  resetPools();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/admin/schedules", () => {
  it("lists rules mapped to DTOs", async () => {
    const central = makePool(() => ({ rows: [ruleRow] }));
    usePools({ central });
    const res = await GET(adminRequest("/api/admin/schedules"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: "rule-1",
      stationId: "station-1",
      programId: "bears-live",
      channelId: "bears",
      enabled: true,
      nextRunAt: "2026-11-07T02:00:00.000Z",
    });
    expect(central.query).toHaveBeenCalledWith(expect.stringContaining("station_schedule_rules"), []);
  });

  it("applies channel/station/program/enabled filters", async () => {
    const central = makePool(() => ({ rows: [] }));
    usePools({ central });
    await GET(adminRequest("/api/admin/schedules?channelId=bears&stationId=s1&programId=p1&enabled=false"));
    const [text, values] = central.query.mock.calls[0];
    expect(text).toContain("channel_id = $1");
    expect(text).toContain("station_id = $2");
    expect(text).toContain("program_id = $3");
    expect(text).toContain("enabled = false");
    expect(values).toEqual(["bears", "s1", "p1"]);
  });

  it("returns 503 when the central DB is unconfigured", async () => {
    stubAdminEnv({ ADMIN_CENTRAL_DATABASE_URL: undefined });
    const res = await GET(adminRequest("/api/admin/schedules"));
    expect(res.status).toBe(503);
  });
});

describe("POST /api/admin/schedules", () => {
  it("creates a rule and returns 201", async () => {
    const central = makePool(() => ({ rows: [{ ...ruleRow, next_run_at: null }] }));
    usePools({ central });
    const res = await POST(
      adminRequest("/api/admin/schedules", {
        method: "POST",
        body: {
          stationId: "station-1",
          programId: "bears-live",
          channelId: "bears",
          schedule: ruleRow.schedule,
        },
      }),
    );
    expect(res.status).toBe(201);
    const [text, values] = central.query.mock.calls[0];
    expect(text).toContain("INSERT INTO station_schedule_rules");
    expect(values[1]).toBe("station-1");
    expect(values[2]).toBe("bears-live");
    expect(values[3]).toBe("bears");
    expect(JSON.parse(values[4])).toEqual(ruleRow.schedule);
  });

  it("rejects missing programId/channelId and invalid schedules", async () => {
    usePools({ central: makePool(() => ({ rows: [] })) });
    const cases = [
      { channelId: "bears", schedule: ruleRow.schedule },
      { programId: "p", schedule: ruleRow.schedule },
      { programId: "p", channelId: "bears", schedule: { scheduledTime: "7pm" } },
    ];
    for (const body of cases) {
      const res = await POST(adminRequest("/api/admin/schedules", { method: "POST", body }));
      expect(res.status).toBe(400);
    }
  });
});

describe("PATCH /api/admin/schedules/:id", () => {
  it("merges the schedule and nulls next_run_at", async () => {
    const central = makePool((text) =>
      text.startsWith("SELECT") ? { rows: [ruleRow] } : { rows: [ruleRow] },
    );
    usePools({ central });
    const res = await PATCH(
      adminRequest("/api/admin/schedules/rule-1", {
        method: "PATCH",
        body: { schedule: { scheduledTime: "20:30" } },
      }),
      params("rule-1"),
    );
    expect(res.status).toBe(200);
    const update = central.query.mock.calls.find(([t]) => t.startsWith("UPDATE"))!;
    expect(update[0]).toContain("next_run_at = NULL");
    expect(JSON.parse(update[1][1])).toMatchObject({ scheduledTime: "20:30", scheduledDays: ["monday"] });
  });

  it("toggles enabled without a schedule patch", async () => {
    const central = makePool(() => ({ rows: [ruleRow] }));
    usePools({ central });
    const res = await PATCH(
      adminRequest("/api/admin/schedules/rule-1", { method: "PATCH", body: { enabled: false } }),
      params("rule-1"),
    );
    expect(res.status).toBe(200);
    const update = central.query.mock.calls.find(([t]) => t.startsWith("UPDATE"))!;
    expect(update[1][2]).toBe(false);
  });

  it("404s unknown rules and 400s empty patches", async () => {
    const emptyPool = makePool(() => ({ rows: [] }));
    usePools({ central: emptyPool });
    expect(
      (await PATCH(adminRequest("/api/admin/schedules/nope", { method: "PATCH", body: { enabled: false } }), params("nope"))).status,
    ).toBe(404);

    const pool = makePool(() => ({ rows: [ruleRow] }));
    usePools({ central: pool });
    expect(
      (await PATCH(adminRequest("/api/admin/schedules/rule-1", { method: "PATCH", body: {} }), params("rule-1"))).status,
    ).toBe(400);
  });
});

describe("DELETE /api/admin/schedules/:id", () => {
  it("disables the rule instead of deleting", async () => {
    const central = makePool(() => ({ rows: [{ ...ruleRow, enabled: false }] }));
    usePools({ central });
    const res = await DELETE(adminRequest("/api/admin/schedules/rule-1", { method: "DELETE" }), params("rule-1"));
    expect(res.status).toBe(200);
    const [text] = central.query.mock.calls[0];
    expect(text).toContain("enabled = false");
    expect(text).not.toContain("DELETE FROM");
  });

  it("404s unknown rules", async () => {
    usePools({ central: makePool(() => ({ rows: [] })) });
    const res = await DELETE(adminRequest("/api/admin/schedules/nope", { method: "DELETE" }), params("nope"));
    expect(res.status).toBe(404);
  });
});
