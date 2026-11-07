import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/admin/channels/route";
import { PATCH } from "../app/api/admin/channels/[id]/route";
import { GET as META } from "../app/api/admin/meta/route";
import { GET as INFO } from "../app/api/admin/info/route";
import {
  adminRequest,
  makeClient,
  makePool,
  resetPools,
  stubAdminEnv,
  usePools,
} from "./helpers";

const channelRow = { id: "bears", name: "Bears", created_at: new Date("2026-09-01T00:00:00Z") };
const checkpointRow = {
  channel_id: "bears",
  desired: "running",
  mode: "episode",
  slot_key: "slot-1",
  session_id: "sess-1",
  updated_at: new Date("2026-11-06T18:00:00Z"),
};
const bindingRow = { channel_id: "bears", station_id: "station-1", program_id: "bears-live" };
const nextSlotRow = {
  channel_id: "bears",
  starts_at: new Date("2026-11-08T02:00:00Z"),
  ends_at: new Date("2026-11-08T02:30:00Z"),
  metadata: { title: "Episode 7" },
};

function appHandler(text: string) {
  if (text.includes("FROM channels")) return { rows: [channelRow] };
  if (text.includes("production_checkpoints")) return { rows: [checkpointRow] };
  return { rows: [] };
}

function centralHandler(text: string) {
  if (text.includes("bindings")) return { rows: [bindingRow] };
  if (text.includes("DISTINCT ON (channel_id)")) return { rows: [nextSlotRow] };
  return { rows: [] };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => stubAdminEnv());
afterEach(() => {
  resetPools();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/admin/channels", () => {
  it("joins app channels with checkpoints and central bindings", async () => {
    usePools({ app: makePool(appHandler), central: makePool(centralHandler) });
    const res = await GET(adminRequest("/api/admin/channels"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: "bears",
      name: "Bears",
      stationId: "station-1",
      programId: "bears-live",
      production: { desired: "running", mode: "episode", slotKey: "slot-1", sessionId: "sess-1" },
      nextSession: { title: "Episode 7" },
    });
  });

  it("still returns app channels when central fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = makePool(appHandler);
    const central = makePool(() => {
      throw new Error("connection refused");
    });
    usePools({ app, central });
    const res = await GET(adminRequest("/api/admin/channels"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0]).toMatchObject({ id: "bears", stationId: null, programId: null, nextSession: null });
  });
});

describe("POST /api/admin/channels", () => {
  it("creates a channel plus a stopped checkpoint in one transaction", async () => {
    const client = makeClient((text) =>
      text.startsWith("INSERT INTO channels") ? { rows: [channelRow] } : { rows: [] },
    );
    const app = { connect: vi.fn(async () => client) };
    usePools({ app: app as never });
    const res = await POST(
      adminRequest("/api/admin/channels", { method: "POST", body: { id: "bears", name: "Bears" } }),
    );
    expect(res.status).toBe(201);
    expect(client.query.mock.calls.map(([t]) => t)).toEqual([
      "BEGIN",
      "INSERT INTO channels (id, name) VALUES ($1, $2) RETURNING id, name, created_at",
      expect.stringContaining("INSERT INTO production_checkpoints"),
      "COMMIT",
    ]);
    expect(client.release).toHaveBeenCalled();
  });

  it("rolls back and 400s on a duplicate id", async () => {
    const client = makeClient((text) => {
      if (text.startsWith("INSERT INTO channels")) {
        const err = new Error("duplicate key") as Error & { code: string };
        err.code = "23505";
        throw err;
      }
      return { rows: [] };
    });
    const app = { connect: vi.fn(async () => client) };
    usePools({ app: app as never });
    const res = await POST(
      adminRequest("/api/admin/channels", { method: "POST", body: { id: "bears", name: "Bears" } }),
    );
    expect(res.status).toBe(400);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("validates id format and name", async () => {
    usePools({ app: makePool(() => ({ rows: [] })) });
    for (const body of [
      { id: "Bad ID!", name: "x" },
      { id: "", name: "x" },
      { id: "ok-id", name: "" },
      { id: "ok-id" },
    ]) {
      const res = await POST(adminRequest("/api/admin/channels", { method: "POST", body }));
      expect(res.status).toBe(400);
    }
  });
});

describe("PATCH /api/admin/channels/:id", () => {
  it("renames a channel", async () => {
    const app = makePool(() => ({ rows: [channelRow] }));
    usePools({ app });
    const res = await PATCH(
      adminRequest("/api/admin/channels/bears", { method: "PATCH", body: { name: "Bears HD" } }),
      params("bears"),
    );
    expect(res.status).toBe(200);
    expect(app.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE channels"), ["bears", "Bears HD"]);
  });

  it("400s empty names and 404s unknown channels", async () => {
    usePools({ app: makePool(() => ({ rows: [channelRow] })) });
    expect(
      (await PATCH(adminRequest("/api/admin/channels/bears", { method: "PATCH", body: { name: "  " } }), params("bears"))).status,
    ).toBe(400);
    usePools({ app: makePool(() => ({ rows: [] })) });
    expect(
      (await PATCH(adminRequest("/api/admin/channels/nope", { method: "PATCH", body: { name: "x" } }), params("nope"))).status,
    ).toBe(404);
  });
});

describe("GET /api/admin/meta", () => {
  it("lists stations and programs", async () => {
    const central = makePool((text) =>
      text.includes("FROM stations")
        ? { rows: [{ id: "s1", name: "S1" }] }
        : { rows: [{ id: "p1", name: "P1", tenant_id: "bears" }] },
    );
    usePools({ central });
    const res = await META(adminRequest("/api/admin/meta"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      stations: [{ id: "s1", name: "S1" }],
      programs: [{ id: "p1", name: "P1", tenantId: "bears" }],
    });
  });
});

describe("GET /api/admin/info", () => {
  it("reports configured + connected databases", async () => {
    usePools({ app: makePool(() => ({ rows: [] })), central: makePool(() => ({ rows: [] })) });
    const res = await INFO(adminRequest("/api/admin/info"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.databases).toEqual({
      app: { configured: true, connected: true },
      central: { configured: true, connected: true },
    });
  });

  it("reports failed probes without leaking detail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = makePool(() => {
      throw new Error("refused");
    });
    usePools({ app, central: makePool(() => ({ rows: [] })) });
    const res = await INFO(adminRequest("/api/admin/info"));
    const body = await res.json();
    expect(body.databases.app).toEqual({ configured: true, connected: false });
    expect(body.databases.central).toEqual({ configured: true, connected: true });
  });

  it("reports unconfigured databases", async () => {
    stubAdminEnv({ ADMIN_APP_DATABASE_URL: undefined, ADMIN_CENTRAL_DATABASE_URL: undefined });
    const res = await INFO(adminRequest("/api/admin/info"));
    const body = await res.json();
    expect(body.databases).toEqual({
      app: { configured: false, connected: false },
      central: { configured: false, connected: false },
    });
  });
});
