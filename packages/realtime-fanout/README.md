# @portalshq/capability-realtime-fanout

**Reusable agent module:** [integration guide](../../docs/package-agents/realtime-fanout.md)

Process-local pub/sub primitives for chat, lobby updates, polls, and WebSocket-like fanout.

```ts
import { Chat, InMemoryFanoutBus } from "@portalshq/capability-realtime-fanout";

const chat = new Chat(new InMemoryFanoutBus());
const unsubscribe = await chat.onMessage(sessionId, renderMessage);
await chat.send({ messageId, sessionId, authorId, text, sentAt, provenance: { kind: "portals" } });
```

## Choose an entry point

- `InMemoryFanoutBus`: development or one process only; optional bounded diagnostic history.
- `Chat`, `Lobby`, `Polls`: topic conventions over any `FanoutBus`.
- `ExternalChatIngress`: normalizes already-authenticated provider events; it does not implement OAuth, webhooks, persistence, or moderation.
- `FanoutHub`: bounded, ordered delivery for WebSocket-like connections. Use `snapshot` for replaceable state and `reliable` for ordered events.

## Production limits

- `InMemoryFanoutBus` is not durable and does not cross processes; replace `FanoutBus` with a broker-backed implementation for multi-instance deployments.
- `Chat` has no moderation, authorization, or persistence. Do those before publishing.
- `Polls.open()` and `vote()` only publish events. `Polls.close()` always throws because tally aggregation is unimplemented.
- `Lobby.setStatus()` publishes status only; it does not enforce capacity or admission.
- `FanoutHub` disconnects a connection whose reliable queue reaches `maxReliableQueue` (default 100). Authenticate and authorize subscriptions in the application.
