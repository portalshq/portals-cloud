import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/admin/production/status/route";
import { POST } from "../app/api/admin/production/[action]/route";
import {
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

const params = (action: string) => ({ params: Promise.resolve({ action }) });

beforeEach(() => stubAdminEnv());
afterEach(() => {
  resetPools();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/admin/production/status", () => {
  it("returns checkpoints plus bears health and channel snapshots", async () => {
    usePools({ app: makePool(() => ({ rows: [checkpointRow] })) });
    const fetchMock = vi.fn(async (url: string) =>
      new Response(JSON.stringify({ url, ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(adminRequest("/api/admin/production/status"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkpoints).toHaveLength(1);
    expect(body.checkpoints[0]).toMatchObject({ channelId: "bears", desired: "running", mode: "ambient" });
    expect(fetchMock).toHaveBeenCalledWith("http://bears.test/api/health", expect.anything());
    expect(fetchMock).toHaveBeenCalledWith("http://bears.test/api/channel", expect.anything());
  });

  it("reports bears errors as data, not failures", async () => {
    usePools({ app: makePool(() => ({ rows: [] })) });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }));
    const res = await GET(adminRequest("/api/admin/production/status"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bearsHealth).toEqual({ error: "ECONNREFUSED" });
  });

  it("marks bears unconfigured without BEARS_API_BASE_URL", async () => {
    stubAdminEnv({ BEARS_API_BASE_URL: undefined });
    usePools({ app: makePool(() => ({ rows: [] })) });
    const res = await GET(adminRequest("/api/admin/production/status"));
    const body = await res.json();
    expect(body.bearsHealth).toEqual({ error: "bears API is not configured" });
  });
});

describe("POST /api/admin/production/:action", () => {
  it("proxies start with the server-side control token", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ status: "started" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(
      adminRequest("/api/admin/production/start", { method: "POST" }),
      params("start"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "started" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://bears.test/api/production/start");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer control-token");
  });

  it("forwards bears error statuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "off air" }), { status: 503 })));
    const res = await POST(adminRequest("/api/admin/production/stop", { method: "POST" }), params("stop"));
    expect(res.status).toBe(503);
  });

  it("rejects unknown actions", async () => {
    const res = await POST(adminRequest("/api/admin/production/nuke", { method: "POST" }), params("nuke"));
    expect(res.status).toBe(400);
  });

  it("503s when production control is unconfigured", async () => {
    stubAdminEnv({ BEARS_PRODUCTION_CONTROL_TOKEN: undefined });
    const res = await POST(adminRequest("/api/admin/production/start", { method: "POST" }), params("start"));
    expect(res.status).toBe(503);
  });
});
