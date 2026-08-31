import { describe, expect, it } from "vitest";

import { Chat, ExternalChatIngress } from "../src/index.js";

describe("ExternalChatIngress", () => {
  it("uses a stable provider id, namespaced author, and endpoint topic", async () => {
    const published: unknown[] = [];
    const bus = {
      async publish(topic: string, message: unknown) {
        published.push({ topic, message });
      },
      async subscribe() {
        return () => {};
      },
    };
    const ingress = new ExternalChatIngress(new Chat(bus));

    const message = await ingress.ingest({
      streamEndpoint: "https://stream.example/channel/",
      provider: "youtube-live",
      providerMessageId: "provider-message-42",
      authorId: "channel-user-7",
      authorDisplayName: "Ada",
      text: "hello stream",
      sentAt: "2026-08-30T12:34:56.000Z",
    });

    expect(message).toEqual({
      messageId: "external:youtube-live:provider-message-42",
      sessionId: "https://stream.example/channel",
      authorId: "external:youtube-live:channel-user-7",
      authorDisplayName: "Ada",
      text: "hello stream",
      sentAt: "2026-08-30T12:34:56.000Z",
      provenance: { kind: "external", provider: "youtube-live", providerMessageId: "provider-message-42" },
    });
    expect(published).toEqual([{ topic: "chat:https://stream.example/channel", message }]);
  });

  it("rejects endpoint credentials and incomplete provider events", async () => {
    const ingress = new ExternalChatIngress(new Chat({
      async publish() {},
      async subscribe() { return () => {}; },
    }));
    await expect(ingress.ingest({
      streamEndpoint: "https://secret@stream.example",
      provider: "twitch", providerMessageId: "m1", authorId: "u1", text: "hello", sentAt: "2026-08-30T12:34:56Z",
    })).rejects.toThrow("streamEndpoint");
    await expect(ingress.ingest({
      streamEndpoint: "https://stream.example",
      provider: "", providerMessageId: "m1", authorId: "u1", text: "hello", sentAt: "2026-08-30T12:34:56Z",
    })).rejects.toThrow("required");
  });
});
