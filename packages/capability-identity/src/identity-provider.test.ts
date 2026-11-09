import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_HISTORY_ENTRIES,
  IdentityProvider,
  INACTIVE_ACCOUNT_ERROR,
  MAX_HISTORY_ENTRIES,
  MAX_IDENTIFIER_LENGTH,
  type AudienceIdentity,
  type ChannelHistoryEntry,
  type ChannelInteraction,
  type IdentityStore,
} from "./identity-provider.js";

function store(overrides: Partial<IdentityStore> = {}): IdentityStore {
  const history: ChannelHistoryEntry[] = [];
  return {
    getIdentity: async (userId): Promise<AudienceIdentity | undefined> =>
      userId === "user-1" ? { userId, displayName: "Ada" } : undefined,
    recordInteraction: async (userId, interaction: ChannelInteraction) => {
      history.push({ ...interaction, lastInteractionAt: "2026-10-15T12:00:00.000Z" });
      void userId;
    },
    getHistory: async (_userId, limit) => history.slice(0, limit),
    ...overrides,
  };
}

const provider = (overrides: Partial<IdentityStore> = {}) =>
  new IdentityProvider(async (token) => {
    if (token !== "valid-token") throw new Error("invalid token");
    return "user-1";
  }, store(overrides));

describe("IdentityProvider", () => {
  it("scopes identity and history to the user resolved from the access token", async () => {
    const recorded: Array<{ userId: string; channelId: string }> = [];
    const subject = provider({
      recordInteraction: async (userId, interaction) => { recorded.push({ userId, channelId: interaction.channelId }); },
    });

    await subject.recordInteraction("valid-token", { channelId: "channel-1", sessionId: "session-1" });

    await expect(subject.getIdentity("valid-token")).resolves.toEqual({ userId: "user-1", displayName: "Ada" });
    expect(recorded).toEqual([{ userId: "user-1", channelId: "channel-1" }]);
  });

  it("never accepts an unverified or inactive identity", async () => {
    await expect(provider().getIdentity("user-1")).rejects.toThrow("invalid token");
    await expect(provider().getIdentity("valid-token")).resolves.toMatchObject({ userId: "user-1" });
    const suspended = new IdentityProvider(async () => "user-2", store());
    await expect(suspended.getIdentity("valid-token")).rejects.toThrow(INACTIVE_ACCOUNT_ERROR);
    await expect(suspended.recordInteraction("valid-token", { channelId: "c", sessionId: "s" })).rejects.toThrow(INACTIVE_ACCOUNT_ERROR);
    await expect(suspended.getHistory("valid-token")).rejects.toThrow(INACTIVE_ACCOUNT_ERROR);
  });

  it.each([
    ["blank channelId", { channelId: "   ", sessionId: "session-1" }],
    ["blank sessionId", { channelId: "channel-1", sessionId: "" }],
    ["oversized channelId", { channelId: "c".repeat(MAX_IDENTIFIER_LENGTH + 1), sessionId: "session-1" }],
    ["oversized sessionId", { channelId: "channel-1", sessionId: "s".repeat(MAX_IDENTIFIER_LENGTH + 1) }],
  ])("rejects %s before touching the store", async (_label, interaction) => {
    const write = vi.fn();
    const subject = provider({ recordInteraction: write });

    await expect(subject.recordInteraction("valid-token", interaction)).rejects.toThrow(TypeError);
    expect(write).not.toHaveBeenCalled();
  });

  it("bounds history reads", async () => {
    const limits: number[] = [];
    const subject = provider({ getHistory: async (_userId, limit) => { limits.push(limit); return []; } });

    await subject.getHistory("valid-token");
    await subject.getHistory("valid-token", MAX_HISTORY_ENTRIES + 500);
    await subject.getHistory("valid-token", 5);

    expect(limits).toEqual([DEFAULT_HISTORY_ENTRIES, MAX_HISTORY_ENTRIES, 5]);
    await expect(subject.getHistory("valid-token", 0)).rejects.toThrow(TypeError);
    await expect(subject.getHistory("valid-token", 1.5)).rejects.toThrow(TypeError);
  });
});

describe("IdentityProvider.resolveActor", () => {
  const guestSecret = "guest-secret";
  const guestId = "guest-33333333-3333-4333-8333-333333333333";
  const guestProvider = () => new IdentityProvider(
    async (token) => {
      if (token !== "valid-token") throw new Error("invalid token");
      return "user-1";
    },
    store(),
    { guestTokenSecret: guestSecret },
  );

  it("resolves a verified Bearer credential to a user actor", async () => {
    await expect(guestProvider().resolveActor({ authorization: "Bearer valid-token" }))
      .resolves.toEqual({ type: "user", userId: "user-1", displayName: "Ada" });
  });

  it("resolves a signed X-Guest-Token to a guest actor", async () => {
    const { mintGuestToken } = await import("./guest-token.js");
    const token = mintGuestToken({ secret: guestSecret, guestId });
    await expect(guestProvider().resolveActor({ "x-guest-token": token }))
      .resolves.toEqual({ type: "guest", actorId: guestId });
  });

  it("falls through to guest when the Bearer credential is invalid", async () => {
    const { mintGuestToken } = await import("./guest-token.js");
    const token = mintGuestToken({ secret: guestSecret, guestId });
    await expect(guestProvider().resolveActor({ authorization: "Bearer forged", "x-guest-token": token }))
      .resolves.toEqual({ type: "guest", actorId: guestId });
  });

  it("returns null when neither credential verifies", async () => {
    await expect(guestProvider().resolveActor({})).resolves.toBeNull();
    await expect(guestProvider().resolveActor({ authorization: "Bearer forged" })).resolves.toBeNull();
    await expect(guestProvider().resolveActor({ "x-guest-token": "gt1.forged" })).resolves.toBeNull();
  });

  it("ignores guest tokens when no secret is configured", async () => {
    const { mintGuestToken } = await import("./guest-token.js");
    const token = mintGuestToken({ secret: guestSecret, guestId });
    const noGuest = new IdentityProvider(async () => "user-1", store());
    await expect(noGuest.resolveActor({ "x-guest-token": token })).resolves.toBeNull();
  });
});
