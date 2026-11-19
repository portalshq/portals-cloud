import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/admin/channels/route";
import { GET as META } from "../app/api/admin/meta/route";
import { GET as INFO } from "../app/api/admin/info/route";
import { resetChannelAppsForTest } from "../lib/channel-apps";
import {
  SCOPED_CHANNEL_IDS,
  SCOPED_TOKEN,
  adminRequest,
  makePool,
  resetPools,
  stubAdminEnv,
  usePools,
} from "./helpers";

const bindingRow = {
  channel_id: "bears",
  station_id: "station-1",
  program_id: "bears-live",
  program_name: "Bears Live",
  description: "Bears story",
  tagline: "Bears tagline",
};

const nextSlotRow = {
  channel_id: "bears",
  starts_at: new Date("2026-11-08T02:00:00Z"),
  ends_at: new Date("2026-11-08T02:30:00Z"),
  metadata: { title: "Episode 7" },
};

const checkpointRow = {
  channel_id: "bears",
  desired: "running",
  mode: "episode",
  slot_key: "slot-1",
  session_id: "sess-1",
  updated_at: new Date("2026-11-06T18:00:00Z"),
};

/** Central handler covering the registry, bindings, and next-slot reads. */
function centralHandler(text: string) {
  if (text.includes("channel_admin_tokens")) return { rows: [{ channel_ids: SCOPED_CHANNEL_IDS }] };
  // channel-registry registration read (getChannelApps)
  if (text.includes("DISTINCT ON (bindings.channel_id)")) return { rows: [] };
  // channel list bindings
  if (text.includes("SELECT DISTINCT b.channel_id")) return { rows: [bindingRow] };
  if (text.includes("DISTINCT ON (channel_id) channel_id, starts_at")) return { rows: [nextSlotRow] };
  if (text.includes("FROM stations")) return { rows: [{ id: "s1", name: "S1" }] };
  if (text.includes("FROM programs")) return { rows: [{ id: "p1", name: "P1", tenant_id: "bears" }] };
  return { rows: [] };
}

beforeEach(() => {
  stubAdminEnv();
  resetChannelAppsForTest();
});
afterEach(() => {
  resetPools();
  resetChannelAppsForTest();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/admin/channels", () => {
  it("lists channels from central bindings joined with the app registry", async () => {
    usePools({ central: makePool(centralHandler), app: makePool(() => ({ rows: [checkpointRow] })) });
    const res = await GET(adminRequest("/api/admin/channels"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: "bears",
      // the env-registered bears app supplies the presentation name
      name: "Bears",
      app: { origin: "http://bears.test", name: "Bears" },
      bindings: [{ stationId: "station-1", programId: "bears-live" }],
      programs: [{ id: "bears-live", name: "Bears Live", description: "Bears story", tagline: "Bears tagline" }],
      production: { desired: "running", mode: "episode", slotKey: "slot-1", sessionId: "sess-1" },
      nextSession: { title: "Episode 7" },
    });
  });

  it("lists channels without a registered app from bindings alone", async () => {
    usePools({
      central: makePool((text) => {
        if (text.includes("SELECT DISTINCT b.channel_id")) {
          return { rows: [{ ...bindingRow, channel_id: "chapter" }] };
        }
        return centralHandler(text);
      }),
      app: makePool(() => ({ rows: [] })),
    });
    const body = await (await GET(adminRequest("/api/admin/channels"))).json();
    const chapter = body.find((channel: { id: string }) => channel.id === "chapter");
    expect(chapter).toMatchObject({
      id: "chapter",
      name: "Bears Live",
      app: null,
      production: null,
    });
  });

  it("works without the optional app database (no checkpoint enrichment)", async () => {
    usePools({ central: makePool(centralHandler) });
    const res = await GET(adminRequest("/api/admin/channels"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0]).toMatchObject({ id: "bears", production: null });
  });

  it("keeps listing channels when checkpoint enrichment fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    usePools({ central: makePool(centralHandler), app: makePool(() => { throw new Error("refused"); }) });
    const res = await GET(adminRequest("/api/admin/channels"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0]).toMatchObject({ id: "bears", production: null });
  });

  it("filters the list to the scoped token's channels", async () => {
    const handler = (text: string) => {
      if (text.includes("DISTINCT ON (bindings.channel_id)")) {
        return {
          rows: [
            { channel_id: "garden", app_origin: "https://garden.test", app_config: {} },
          ],
        };
      }
      return centralHandler(text);
    };
    usePools({ central: makePool(handler) });
    const body = await (await GET(
      adminRequest("/api/admin/channels", { token: SCOPED_TOKEN }),
    )).json();
    expect(body.map((channel: { id: string }) => channel.id)).toEqual(["bears"]);
  });
});

describe("GET /api/admin/meta", () => {
  it("lists stations and programs for the superuser", async () => {
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

  it("lists only programs bound to in-scope channels for a scoped token", async () => {
    const central = makePool((text) => {
      if (text.includes("channel_admin_tokens")) return { rows: [{ channel_ids: SCOPED_CHANNEL_IDS }] };
      if (text.includes("FROM stations")) return { rows: [{ id: "s1", name: "S1" }] };
      if (text.includes("bindings")) return { rows: [{ id: "p1", name: "P1", tenant_id: "bears" }] };
      return { rows: [] };
    });
    usePools({ central });
    const res = await META(adminRequest("/api/admin/meta", { token: SCOPED_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.programs).toEqual([{ id: "p1", name: "P1", tenantId: "bears" }]);
    const programsQuery = central.query.mock.calls.find(([text]) => text.includes("ANY($1)"));
    expect(programsQuery?.[1]).toEqual([SCOPED_CHANNEL_IDS]);
  });
});

describe("GET /api/admin/info", () => {
  it("reports scope and configured + connected databases", async () => {
    usePools({ app: makePool(() => ({ rows: [] })), central: makePool(() => ({ rows: [] })) });
    const res = await INFO(adminRequest("/api/admin/info"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scope).toEqual({ allChannels: true, channelIds: null });
    expect(body.databases).toEqual({
      app: { configured: true, connected: true },
      central: { configured: true, connected: true },
    });
  });

  it("reports a scoped token's channel list", async () => {
    usePools({
      app: makePool(() => ({ rows: [] })),
      central: makePool((text) =>
        text.includes("channel_admin_tokens")
          ? { rows: [{ channel_ids: SCOPED_CHANNEL_IDS }] }
          : { rows: [] },
      ),
    });
    const body = await (await INFO(adminRequest("/api/admin/info", { token: SCOPED_TOKEN }))).json();
    expect(body.scope).toEqual({ allChannels: false, channelIds: SCOPED_CHANNEL_IDS });
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
    stubAdminEnv({ CENTRAL_DATABASE_URL: undefined });
    const res = await INFO(adminRequest("/api/admin/info"));
    const body = await res.json();
    expect(body.databases).toEqual({
      app: { configured: false, connected: false },
      central: { configured: false, connected: false },
    });
  });
});
