import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "../app/api/admin/programs/[id]/route";
import { SCOPED_CHANNEL_IDS, SCOPED_TOKEN, adminRequest, makePool, resetPools, stubAdminEnv, usePools } from "./helpers";

const params = { params: Promise.resolve({ id: "bears-live" }) };
beforeEach(() => stubAdminEnv());
afterEach(() => { resetPools(); vi.unstubAllEnvs(); });

const updatedRow = {
  name: "Bears Live",
  description: "A story",
  tagline: "A tagline",
  page_title: null,
  social_site_name: null,
  default_share_image: null,
  theme_color: null,
};

describe("program details", () => {
  it("updates the selected program's name, description, and tagline", async () => {
    const central = makePool((_sql, values) => ({
      rows: [{ ...updatedRow, name: values?.[1], description: values?.[2], tagline: values?.[3] }],
    }));
    usePools({ central });
    const response = await PATCH(adminRequest("/api/admin/programs/bears-live", {
      method: "PATCH", body: { name: " Bears Live ", description: " New story. ", tagline: " A tagline. " },
    }), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "bears-live", name: "Bears Live", description: "New story.", tagline: "A tagline." });
    expect(central.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE programs"), ["bears-live", "Bears Live", "New story.", "A tagline."]);
  });

  it("updates only the provided fields", async () => {
    const central = makePool(() => ({ rows: [updatedRow] }));
    usePools({ central });
    const response = await PATCH(adminRequest("/api/admin/programs/bears-live", {
      method: "PATCH", body: { tagline: "Only a tagline" },
    }), params);
    expect(response.status).toBe(200);
    const [sql, values] = central.query.mock.calls[0];
    expect(sql).not.toContain("name =");
    expect(sql).not.toContain("description =");
    expect(values).toEqual(["bears-live", "Only a tagline"]);
  });

  it("rejects unauthenticated, invalid, empty, and unknown program edits", async () => {
    const central = makePool(() => ({ rows: [] }));
    usePools({ central });
    expect((await PATCH(adminRequest("/", { method: "PATCH", token: null, body: {} }), params)).status).toBe(401);
    expect((await PATCH(adminRequest("/", { method: "PATCH", body: { description: 1 } }), params)).status).toBe(400);
    expect((await PATCH(adminRequest("/", { method: "PATCH", body: { name: "  " } }), params)).status).toBe(400);
    expect((await PATCH(adminRequest("/", { method: "PATCH", body: {} }), params)).status).toBe(400);
    expect((await PATCH(adminRequest("/", { method: "PATCH", body: { description: "", tagline: "" } }), params)).status).toBe(404);
  });

  it("403s edits when any bound channel is outside the token's scope", async () => {
    const central = makePool((text) => {
      if (text.includes("channel_admin_tokens")) return { rows: [{ channel_ids: SCOPED_CHANNEL_IDS }] };
      if (text.includes("bindings")) return { rows: [{ channel_id: "garden" }] };
      return { rows: [] };
    });
    usePools({ central });
    const response = await PATCH(adminRequest("/api/admin/programs/bears-live", {
      method: "PATCH", token: SCOPED_TOKEN, body: { tagline: "Nope" },
    }), params);
    expect(response.status).toBe(403);
  });

  it("allows scoped edits when every bound channel is in scope", async () => {
    const central = makePool((text) => {
      if (text.includes("channel_admin_tokens")) return { rows: [{ channel_ids: SCOPED_CHANNEL_IDS }] };
      if (text.includes("bindings")) return { rows: [{ channel_id: "bears" }] };
      return { rows: [updatedRow] };
    });
    usePools({ central });
    const response = await PATCH(adminRequest("/api/admin/programs/bears-live", {
      method: "PATCH", token: SCOPED_TOKEN, body: { tagline: "Scoped edit" },
    }), params);
    expect(response.status).toBe(200);
  });
});
