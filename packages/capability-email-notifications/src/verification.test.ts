import { describe, expect, it, vi } from "vitest";
import { claimVerifiedEmail, EmailVerificationStore } from "./verification.js";

describe("mailbox verification", () => {
  it("stores only a hash and expires issued tokens after 30 minutes", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = new EmailVerificationStore({ query });
    const token = await store.issue(" Viewer@Example.com ", "u", new Date("2026-01-01T00:00:00Z"));
    expect(query.mock.calls[0][1][0]).not.toBe(token);
    expect(query.mock.calls[0][1][1]).toBe("viewer@example.com");
    expect(query.mock.calls[0][1][3].toISOString()).toBe("2026-01-01T00:30:00.000Z");
  });

  it("links proof and recipient in one transaction without resetting subscriptions", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ email: "viewer@example.com", user_id: "u" }] })
      .mockResolvedValueOnce({ rows: [{ id: "recipient" }] })
      .mockResolvedValue({ rows: [] });
    const release = vi.fn();
    const result = await claimVerifiedEmail({ connect: async () => ({ query, release }) }, "A".repeat(43), "UTC", new Date(), "u");
    expect(result).toEqual({ recipientId: "recipient", email: "viewer@example.com", userId: "u", hasIntent: false });
    expect(query.mock.calls.map(call => call[0])).toEqual([
      "BEGIN", expect.stringContaining("FOR UPDATE"), expect.stringContaining("ON CONFLICT (lower(email))"),
      expect.stringContaining("SET consumed_at"), "COMMIT",
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back if the mailbox belongs to another account", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ email: "viewer@example.com", user_id: "u" }] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValue({ rows: [] });
    const release = vi.fn();
    await expect(claimVerifiedEmail({ connect: async () => ({ query, release }) }, "A".repeat(43), "UTC", new Date(), "u"))
      .rejects.toThrow("another account");
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });
});
