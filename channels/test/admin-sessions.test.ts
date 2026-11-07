import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/admin/sessions/route";
import { PATCH } from "../app/api/admin/sessions/[id]/route";
import { POST as CANCEL } from "../app/api/admin/sessions/[id]/cancel/route";
import {
  adminRequest,
  makePool,
  resetPools,
  stubAdminEnv,
  usePools,
} from "./helpers";

const slotRow = {
  id: "slot-1",
  station_id: "station-1",
  program_id: "bears-live",
  channel_id: "bears",
  starts_at: new Date("2026-11-08T02:00:00Z"),
  ends_at: new Date("2026-11-08T02:30:00Z"),
  status: "scheduled",
  metadata: { title: "Episode 7" },
  created_at: new Date("2026-11-01T00:00:00Z"),
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => stubAdminEnv());
afterEach(() => {
  resetPools();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/admin/sessions", () => {
  it("lists upcoming slots by default", async () => {
    const central = makePool(() => ({ rows: [slotRow] }));
    usePools({ central });
    const res = await GET(adminRequest("/api/admin/sessions"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0]).toMatchObject({ id: "slot-1", title: "Episode 7", status: "scheduled" });
    expect(central.query.mock.calls[0][0]).toContain("ends_at > now()");
  });

  it("supports scope=all, status, and channel filters", async () => {
    const central = makePool(() => ({ rows: [] }));
    usePools({ central });
    await GET(adminRequest("/api/admin/sessions?scope=all&status=completed&channelId=bears"));
    const [text, values] = central.query.mock.calls[0];
    expect(text).not.toContain("ends_at > now()");
    expect(text).toContain("status = $2");
    expect(values).toEqual(["bears", "completed"]);
  });

  it("rejects an unknown status filter", async () => {
    usePools({ central: makePool(() => ({ rows: [] })) });
    const res = await GET(adminRequest("/api/admin/sessions?status=bogus"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/sessions", () => {
  const validBody = {
    stationId: "station-1",
    programId: "bears-live",
    channelId: "bears",
    startsAt: "2026-11-09T02:00:00Z",
    endsAt: "2026-11-09T02:30:00Z",
    title: "Special",
  };

  it("creates a one-off slot", async () => {
    const central = makePool(() => ({ rows: [slotRow] }));
    usePools({ central });
    const res = await POST(adminRequest("/api/admin/sessions", { method: "POST", body: validBody }));
    expect(res.status).toBe(201);
    const [text, values] = central.query.mock.calls[0];
    expect(text).toContain("ON CONFLICT (station_id, program_id, starts_at) DO NOTHING");
    expect(JSON.parse(values[7])).toEqual({ title: "Special" });
  });

  it("returns 409 on the unique-slot conflict", async () => {
    usePools({ central: makePool(() => ({ rows: [] })) });
    const res = await POST(adminRequest("/api/admin/sessions", { method: "POST", body: validBody }));
    expect(res.status).toBe(409);
  });

  it("validates required fields and the window", async () => {
    usePools({ central: makePool(() => ({ rows: [] })) });
    const cases = [
      { ...validBody, programId: undefined },
      { ...validBody, channelId: undefined },
      { ...validBody, startsAt: "not-a-date" },
      { ...validBody, endsAt: "2026-11-09T01:00:00Z" },
      { ...validBody, status: "bogus" },
    ];
    for (const body of cases) {
      const res = await POST(adminRequest("/api/admin/sessions", { method: "POST", body }));
      expect(res.status).toBe(400);
    }
  });
});

describe("PATCH /api/admin/sessions/:id", () => {
  it("updates the window, validating ends>starts before writing", async () => {
    const central = makePool((text) =>
      text.startsWith("SELECT") ? { rows: [slotRow] } : { rows: [slotRow] },
    );
    usePools({ central });
    const res = await PATCH(
      adminRequest("/api/admin/sessions/slot-1", {
        method: "PATCH",
        body: { startsAt: "2026-11-08T01:00:00Z" },
      }),
      params("slot-1"),
    );
    expect(res.status).toBe(200);
    const update = central.query.mock.calls.find(([t]) => t.startsWith("UPDATE"))!;
    expect(update[1][1].toISOString()).toBe("2026-11-08T01:00:00.000Z");
    // ends_at falls back to the existing value
    expect(update[1][2].toISOString()).toBe(slotRow.ends_at.toISOString());
  });

  it("rejects a patch that would invert the window", async () => {
    usePools({ central: makePool(() => ({ rows: [slotRow] })) });
    const res = await PATCH(
      adminRequest("/api/admin/sessions/slot-1", {
        method: "PATCH",
        body: { startsAt: "2026-11-08T04:00:00Z" },
      }),
      params("slot-1"),
    );
    expect(res.status).toBe(400);
  });

  it("patches status and title", async () => {
    usePools({ central: makePool(() => ({ rows: [slotRow] })) });
    const res = await PATCH(
      adminRequest("/api/admin/sessions/slot-1", {
        method: "PATCH",
        body: { status: "live", title: "Renamed" },
      }),
      params("slot-1"),
    );
    expect(res.status).toBe(200);
  });

  it("400s empty patches and 404s unknown slots", async () => {
    const pool = makePool(() => ({ rows: [slotRow] }));
    usePools({ central: pool });
    expect(
      (await PATCH(adminRequest("/api/admin/sessions/slot-1", { method: "PATCH", body: {} }), params("slot-1"))).status,
    ).toBe(400);
    expect(
      (await PATCH(
        adminRequest("/api/admin/sessions/slot-1", { method: "PATCH", body: { status: "bogus" } }),
        params("slot-1"),
      )).status,
    ).toBe(400);

    usePools({ central: makePool(() => ({ rows: [] })) });
    expect(
      (await PATCH(
        adminRequest("/api/admin/sessions/nope", { method: "PATCH", body: { status: "live" } }),
        params("nope"),
      )).status,
    ).toBe(404);
  });
});

describe("POST /api/admin/sessions/:id/cancel", () => {
  it("marks the slot cancelled", async () => {
    const central = makePool(() => ({ rows: [{ id: "slot-1" }] }));
    usePools({ central });
    const res = await CANCEL(adminRequest("/api/admin/sessions/slot-1/cancel", { method: "POST" }), params("slot-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "slot-1", status: "cancelled" });
    expect(central.query.mock.calls[0][0]).toContain("status = 'cancelled'");
  });

  it("404s unknown slots", async () => {
    usePools({ central: makePool(() => ({ rows: [] })) });
    const res = await CANCEL(adminRequest("/api/admin/sessions/nope/cancel", { method: "POST" }), params("nope"));
    expect(res.status).toBe(404);
  });
});
