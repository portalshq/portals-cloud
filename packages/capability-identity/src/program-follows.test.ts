import { describe, expect, it, vi } from "vitest";
import { ProgramFollowsStore } from "./program-follows.js";

describe("ProgramFollowsStore", () => {
  it("scopes follow operations to the user and program", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = new ProgramFollowsStore({ query });
    await store.follow("viewer", "show");
    await store.unfollow("viewer", "show");
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT (user_id, program_id) DO NOTHING");
    expect(query.mock.calls[0][1]).toEqual(["viewer", "show"]);
    expect(query.mock.calls[1][0]).toContain("WHERE user_id = $1 AND program_id = $2");
    expect(query.mock.calls[1][1]).toEqual(["viewer", "show"]);
  });

  it("lists the requested user's program identifiers", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ program_id: "one" }, { program_id: "two" }] });
    expect(await new ProgramFollowsStore({ query }).list("viewer")).toEqual(["one", "two"]);
    expect(query.mock.calls[0][1]).toEqual(["viewer"]);
  });
});
