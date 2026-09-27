# @portalshq/runtime-core

**Reusable agent module:** [integration guide](../../docs/package-agents/runtime-core.md)

Lazy-start timer lifecycle for live channels plus monotonic tick context. It does not include an HTTP control plane, data-plane gateway, persistence, billing, or capability invocation.

```ts
import { RealtimeEngine } from "@portalshq/runtime-core";

const engine = new RealtimeEngine({
  async onActivate(channelId) { return hasLiveSession(channelId); },
  async onTick(channelId, tick) {
    broadcast(channelId, { remaining: tick.countdown(endsAt).remainingSeconds });
    return { continue: !tick.countdown(endsAt).expired };
  },
});

await engine.addViewer(channelId, connectionId);
// Always pair connection cleanup with removeViewer(channelId, connectionId).
```

## Lifecycle

- The first viewer calls `onActivate`. Return `true` to begin ticks, `false` when nothing is due, or `{ scheduleRecheckAt }` to schedule one recheck.
- A running session continues after viewers leave. Call `stop()` or return `{ continue: false }` to end it.
- Use `ensureActive()` for scheduled work that must not require a viewer, then `shutdown()` during process termination.

## API notes

- `TimeCounter` / `countdownAt` supply monotonic elapsed and delta time plus wall-clock countdown snapshots.
- `onTick` exceptions are logged and retried on the next tick; make callbacks idempotent and durable work retry-safe.
- `tickIntervalMs` defaults to 1 second. This is a scheduler, not a precise clock.
