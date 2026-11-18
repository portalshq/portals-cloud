import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/admin/production/status/route";
import { POST } from "../app/api/admin/production/[channelId]/[action]/route";
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

const checkpointRow = {
  channel_id: "bears",
  desired: "running",
  mode: "ambient",
  slot_key: null,
  session_id: null,
  updated_at: new Date("2026-11-06T18:00:00Z"),
};

const gardenRegistration = { channel_id: "garden", app_origin: "https://garden.test", app_config: {} };

/** Central handler covering admin-scope, registry, and control-token reads. */
function centralHandler(text: string) {
  if (text.includes("channel_admin_tokens")) return { rows: [{ channel_ids: SCOPED_CHANNEL_IDS }] };
  if (text.includes("channel_app_control_tokens")) return { rows: [] };
  if (text.includes("DISTINCT ON (bindings.channel_id)")) return { rows: [] };
  return { rows: [] };
}

const params = (channelId: string, action: string) => ({
  params: Promise.resolve({ channelId, action }),
});

beforeEach(() => {
  stubAdminEnv();
  resetChannelAppsForTest();
});
afterEach(() => {
  resetPools();
  resetChannelAppsForTest();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/admin/production/status", () => {
  it("returns per-app snapshots and app-database checkpoints", async () => {
    usePools({
      central: makePool(centralHandler),
      app: makePool(() => ({ rows: [checkpointRow] })),
    });
    const fetchMock = vi.fn(async (url: string | URL) =>
      new Response(JSON.stringify({ url: String(url), ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(adminRequest("/api/admin/production/status"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkpoints).toHaveLength(1);
    expect(body.checkpoints[0]).toMatchObject({ channelId: "bears", desired: "running", mode: "ambient" });
    // bears is registered through BEARS_API_BASE_URL; its control credential
    // falls back to the env token.
    expect(body.apps).toEqual([
      expect.objectContaining({ channelId: "bears", origin: "http://bears.test", controlConfigured: true }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(new URL("http://bears.test/api/health"), expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(new URL("http://bears.test/api/channel"), expect.anything());
  });

  it("lists central-registered apps and marks missing control credentials", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    usePools({
      central: makePool((text) =>
        text.includes("p.app_origin, p.app_config") ? { rows: [gardenRegistration] } : centralHandler(text),
      ),
    });
    const res = await GET(adminRequest("/api/admin/production/status"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const channels = body.apps.map((app: { channelId: string }) => app.channelId).sort();
    expect(channels).toEqual(["bears", "garden"]);
    const garden = body.apps.find((app: { channelId: string }) => app.channelId === "garden");
    expect(garden).toMatchObject({ origin: "https://garden.test", controlConfigured: false });
  });

  it("reports app errors as data, not failures", async () => {
    usePools({ central: makePool(centralHandler), app: makePool(() => ({ rows: [] })) });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }));
    const res = await GET(adminRequest("/api/admin/production/status"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apps[0].health).toEqual({ error: "ECONNREFUSED" });
  });

  it("works without the optional app database", async () => {
    stubAdminEnv({ ADMIN_APP_DATABASE_URL: undefined });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    usePools({ central: makePool(centralHandler) });
    const res = await GET(adminRequest("/api/admin/production/status"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkpoints).toEqual([]);
  });

  it("restricts apps to the scoped token's channels", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    usePools({
      central: makePool((text) =>
        text.includes("DISTINCT ON (bindings.channel_id)") ? { rows: [gardenRegistration] } : centralHandler(text),
      ),
    });
    const res = await GET(adminRequest("/api/admin/production/status", { token: SCOPED_TOKEN }));
    const body = await res.json();
    expect(body.apps.map((app: { channelId: string }) => app.channelId)).toEqual(["bears"]);
  });
});

describe("POST /api/admin/production/:channelId/:action", () => {
  it("proxies to the app's registered origin with the env control token", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ status: "started" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    usePools({ central: makePool(centralHandler) });
    const res = await POST(
      adminRequest("/api/admin/production/bears/start", { method: "POST" }),
      params("bears", "start"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "started" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url).toEqual(new URL("http://bears.test/api/production/start"));
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer control-token");
  });

  it("prefers the database control token over the env fallback", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "started" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    usePools({
      central: makePool((text) =>
        text.includes("channel_app_control_tokens")
          ? { rows: [{ control_token: "db-control-token" }] }
          : centralHandler(text),
      ),
    });
    await POST(
      adminRequest("/api/admin/production/bears/start", { method: "POST" }),
      params("bears", "start"),
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer db-control-token");
  });

  it("forwards app error statuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "off air" }), { status: 503 })));
    usePools({ central: makePool(centralHandler) });
    const res = await POST(
      adminRequest("/api/admin/production/bears/stop", { method: "POST" }),
      params("bears", "stop"),
    );
    expect(res.status).toBe(503);
  });

  it("rejects unknown actions and unknown channels", async () => {
    usePools({ central: makePool(centralHandler) });
    expect(
      (await POST(adminRequest("/api/admin/production/bears/nuke", { method: "POST" }), params("bears", "nuke"))).status,
    ).toBe(400);
    expect(
      (await POST(adminRequest("/api/admin/production/garden/start", { method: "POST" }), params("garden", "start"))).status,
    ).toBe(404);
  });

  it("403s channels outside the token's scope", async () => {
    usePools({
      central: makePool((text) =>
        text.includes("DISTINCT ON (bindings.channel_id)") ? { rows: [gardenRegistration] } : centralHandler(text),
      ),
    });
    const res = await POST(
      adminRequest("/api/admin/production/garden/start", { method: "POST", token: SCOPED_TOKEN }),
      params("garden", "start"),
    );
    expect(res.status).toBe(403);
  });

  it("503s when no control credential is configured for the channel", async () => {
    stubAdminEnv({ BEARS_PRODUCTION_CONTROL_TOKEN: undefined });
    usePools({ central: makePool(centralHandler) });
    const res = await POST(
      adminRequest("/api/admin/production/bears/start", { method: "POST" }),
      params("bears", "start"),
    );
    expect(res.status).toBe(503);
  });

  it("falls back to the env credential when the central lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "started" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    usePools({
      central: makePool((text) => {
        if (text.includes("channel_app_control_tokens")) throw new Error("connection refused");
        return centralHandler(text);
      }),
    });
    const res = await POST(
      adminRequest("/api/admin/production/bears/start", { method: "POST" }),
      params("bears", "start"),
    );
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer control-token");
  });
});
