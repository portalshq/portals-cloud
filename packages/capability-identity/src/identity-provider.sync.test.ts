import { describe, expect, it, vi } from "vitest";
import { IdentityProvider, type IdentityStore } from "./identity-provider.js";
import { ApplicationIdentityStore } from "./postgres-store.js";
import { CentralIdentityStore } from "./central-store.js";

const gateway = () => ({ getUserInfo: vi.fn(async (_resource: string, _userId: string) => ({ userId: "u", displayName: "Ada" })) });
const query = () => vi.fn(async (_text: string, _values?: unknown[]) => ({ rowCount: 1, rows: [] as Record<string, unknown>[] }));
describe("explicit profile sync", () => {
  it.each([ApplicationIdentityStore, CentralIdentityStore])("persists through %s", async (Store) => {
    const db = { query: query() }; const auth = gateway();
    await new IdentityProvider(async () => "u", new Store(db)).syncFromAuthGateway("u", auth, "app");
    expect(auth.getUserInfo).toHaveBeenCalledWith("app", "u");
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("display_name"), ["u", "Ada"]);
    expect(db.query.mock.calls[0][0]).not.toContain("status =");
  });
  it("requires application provisioning", async () => {
    const store = new ApplicationIdentityStore({ query: async () => ({ rowCount: 0, rows: [] }) });
    await expect(store.syncFromAuthGateway("u", "Ada")).rejects.toThrow("provisioned");
  });
  it("rejects unsupported stores before querying auth", async () => {
    const auth = gateway();
    const provider = new IdentityProvider(async () => "u", {} as IdentityStore);
    await expect(provider.syncFromAuthGateway("u", auth, "app")).rejects.toThrow("does not support");
    expect(auth.getUserInfo).not.toHaveBeenCalled();
  });
  it("rejects invalid inputs and mismatched upstream data without writing", async () => {
    const db = { query: query() }; const auth = gateway();
    const provider = new IdentityProvider(async () => "u", new CentralIdentityStore(db));
    for (const [id, resource] of [["", "app"], ["u", " "]]) await expect(provider.syncFromAuthGateway(id, auth, resource)).rejects.toThrow(TypeError);
    auth.getUserInfo.mockResolvedValue({ userId: "other", displayName: "Ada" });
    await expect(provider.syncFromAuthGateway("u", auth, "app")).rejects.toThrow("mismatched");
    expect(db.query).not.toHaveBeenCalled();
  });
  it("propagates upstream and storage failures", async () => {
    const db = { query: query() }; const auth = gateway();
    const provider = new IdentityProvider(async () => "u", new CentralIdentityStore(db));
    auth.getUserInfo.mockRejectedValueOnce(new Error("offline"));
    await expect(provider.syncFromAuthGateway("u", auth, "app")).rejects.toThrow("offline");
    expect(db.query).not.toHaveBeenCalled();
    db.query.mockRejectedValueOnce(new Error("database"));
    await expect(provider.syncFromAuthGateway("u", auth, "app")).rejects.toThrow("database");
  });
});
