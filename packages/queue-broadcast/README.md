# @portalshq/capability-queue-broadcast

**Reusable agent module:** [integration guide](../../docs/package-agents/queue-broadcast.md)

Server-only producer client for one Queue Broadcast Server. It uploads or queues completed media and returns a token-free HLS descriptor for a separate viewer.

```ts
import { QueueBroadcastClient } from "@portalshq/capability-queue-broadcast";

const client = new QueueBroadcastClient({ endpoint, token }); // backend only
await client.stageUpload({ mediaType: "image", asset, imageDuration: 10, slotKey, idempotencyKey });
await client.releaseSlot(slotKey);
const playback = await client.getPlayback();
```

## Primary API

- `health()` and `getPlayback()`: preflight the control plane; pass only `getPlayback()`'s manifest URL to the browser.
- `enqueueUpload()` / `stageUpload()`: upload one `Blob` with lowercase SHA-256 and a stable idempotency key.
- `releaseSlot(slotKey)`: atomically makes staged turn assets FIFO-eligible.
- `watchJob(jobId)`: async polling iterator; pass an `AbortSignal` to stop it.
- `enqueueUrl()` and pair methods remain supported for legacy/server-to-server flows.
- `ContentQueuePipeline` and `RTMPStreamer` are lower-level server infrastructure; prefer `QueueBroadcastClient` unless implementing the producer pipeline itself.

## Guardrails

- Never expose `token`, Queue endpoints, or upload methods to a browser.
- Use a unique, stable idempotency key per logical upload. Reusing one with conflicting data returns HTTP 409 via `QueueBroadcastError`.
- Stage every successful asset in a logical turn before releasing the slot; a slot prevents a partial turn from airing early.
- `src/generated/api.ts` is generated from `openapi/streamer.json`; use `npm run generate -w @portalshq/capability-queue-broadcast` after updating that snapshot.
