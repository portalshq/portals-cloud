import assert from "node:assert/strict";
import test from "node:test";

import { Chat, ExternalChatIngress } from "../dist/index.js";

test("external chat uses a stable provider id, namespaced author, and endpoint topic", async () => {
  const published = [];
  const bus = {
    async publish(topic, message) {
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

  assert.deepEqual(message, {
    messageId: "external:youtube-live:provider-message-42",
    sessionId: "https://stream.example/channel",
    authorId: "external:youtube-live:channel-user-7",
    authorDisplayName: "Ada",
    text: "hello stream",
    sentAt: "2026-08-30T12:34:56.000Z",
    provenance: {
      kind: "external",
      provider: "youtube-live",
      providerMessageId: "provider-message-42",
    },
  });
  assert.deepEqual(published, [{ topic: "chat:https://stream.example/channel", message }]);
});

test("external chat rejects endpoint credentials and incomplete provider events", async () => {
  const ingress = new ExternalChatIngress(new Chat({
    async publish() {},
    async subscribe() { return () => {}; },
  }));
  await assert.rejects(
    ingress.ingest({
      streamEndpoint: "https://secret@stream.example",
      provider: "twitch",
      providerMessageId: "m1",
      authorId: "u1",
      text: "hello",
      sentAt: "2026-08-30T12:34:56Z",
    }),
  );
  await assert.rejects(
    ingress.ingest({
      streamEndpoint: "https://stream.example",
      provider: "",
      providerMessageId: "m1",
      authorId: "u1",
      text: "hello",
      sentAt: "2026-08-30T12:34:56Z",
    }),
  );
});
