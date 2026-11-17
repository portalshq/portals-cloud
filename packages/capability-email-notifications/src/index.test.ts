import { beforeEach, describe, expect, it, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
import { createResendNotifications } from "./index.js";

describe("Resend notification adapter", () => {
  beforeEach(() => { send.mockReset(); });

  it("passes idempotency and unsubscribe headers to Resend", async () => {
    send.mockResolvedValue({ data: { id: "message" }, error: null });
    const notifications = createResendNotifications({ apiKey: "key", from: "shows@example.test" });
    const result = await notifications.send({ to: "viewer@example.test", subject: "Show", text: "Tonight",
      idempotencyKey: "episode/slot/recipient",
      headers: { "List-Unsubscribe": "<https://example.test/unsubscribe>" } });
    expect(result.messageId).toBe("message");
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      headers: { "List-Unsubscribe": "<https://example.test/unsubscribe>" },
    }), { idempotencyKey: "episode/slot/recipient" });
  });

  it("surfaces provider errors for retry", async () => {
    send.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    const notifications = createResendNotifications({ apiKey: "key", from: "shows@example.test" });
    await expect(notifications.send({ to: "viewer@example.test", subject: "Show", text: "Tonight" }))
      .rejects.toThrow("unavailable");
  });
});
