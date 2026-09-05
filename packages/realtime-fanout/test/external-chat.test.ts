import { describe, expect, it, vi } from "vitest";

import { Chat, ExternalChatIngress } from "../src/index.js";

describe("ExternalChatIngress", () => {
  it("can normalize without publishing so callers may persist first", () => {
    const publish = vi.fn();
    const ingress = new ExternalChatIngress(new Chat({
      publish,
      async subscribe() { return () => {}; },
    }));

    const message = ingress.normalize({
      streamEndpoint: "https://stream.example/live",
      provider: "twitch",
      providerMessageId: "msg-1",
      authorId: "user-1",
      authorDisplayName: "Viewer",
      text: "hello",
      sentAt: "2026-08-31T12:00:00.000Z",
    });

    expect(message.messageId).toBe("external:twitch:msg-1");
    expect(publish).not.toHaveBeenCalled();
  });
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
