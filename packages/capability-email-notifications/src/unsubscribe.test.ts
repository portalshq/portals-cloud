import { describe, expect, it, vi } from "vitest";
import { applyUnsubscribe, unsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe.js";

describe("unsubscribe links", () => {
  const secret = "a sufficiently long secret for tests";
  it("verifies a scoped token and rejects tampering", () => {
    const scope = { recipientId: "r", kind: "program" as const, programId: "show" };
    const token = unsubscribeToken(secret, scope);
    expect(verifyUnsubscribeToken(secret, token)).toEqual(scope);
    expect(verifyUnsubscribeToken(secret, `${token}x`)).toBeNull();
    expect(verifyUnsubscribeToken("different secret that is also long enough", token)).toBeNull();
  });
  it("disables show emails without deleting a follow", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await applyUnsubscribe({ query }, { recipientId: "r", kind: "program", programId: "show" });
    expect(query.mock.calls[0][0]).not.toContain("program_follows");
    expect(query.mock.calls[0][1]).toEqual(["r", "show"]);
  });
});
