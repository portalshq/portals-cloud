import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "../app/api/admin/programs/[id]/route";
import { adminRequest, makePool, resetPools, stubAdminEnv, usePools } from "./helpers";

const params = { params: Promise.resolve({ id: "bears-live" }) };
beforeEach(() => stubAdminEnv());
afterEach(() => { resetPools(); vi.unstubAllEnvs(); });

describe("program promotional copy", () => {
  it("updates the selected program with the authenticated admin", async () => {
    const central = makePool((_sql, values) => ({ rows: [{ description: values?.[1], tagline: values?.[2] }] }));
    usePools({ central });
    const response = await PATCH(adminRequest("/api/admin/programs/bears-live", {
      method: "PATCH", body: { description: " New story. ", tagline: " A tagline. " },
    }), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "bears-live", description: "New story.", tagline: "A tagline." });
    expect(central.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE programs"), ["bears-live", "New story.", "A tagline."]);
  });

  it("rejects unauthenticated, invalid and unknown program edits", async () => {
    const central = makePool(() => ({ rows: [] }));
    usePools({ central });
    expect((await PATCH(adminRequest("/", { method: "PATCH", token: null, body: {} }), params)).status).toBe(401);
    expect((await PATCH(adminRequest("/", { method: "PATCH", body: { description: 1, tagline: "x" } }), params)).status).toBe(400);
    expect((await PATCH(adminRequest("/", { method: "PATCH", body: { description: "", tagline: "" } }), params)).status).toBe(404);
  });
});
