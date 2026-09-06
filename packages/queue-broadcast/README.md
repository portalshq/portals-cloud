# `@portalshq/capability-queue-broadcast`

Server-only producer API for one isolated Queue Broadcast Server endpoint.

The queue is deliberately separate from playback: a trusted application backend
uses this package to enqueue and observe jobs; its browser player gets only the
public HLS manifest returned by `getPlayback()`. Use
`@portalshq/capability-video-delivery`'s `HlsPlaybackSession` in a player or
another stream-delivery integration.

## Backend flow

```ts
import { QueueBroadcastClient } from "@portalshq/capability-queue-broadcast";

const broadcast = new QueueBroadcastClient({
  endpoint: process.env.STREAMER_ENDPOINT!, // no token/query/fragment
  token: process.env.STREAMER_API_TOKEN!,   // backend secret only
});

const slotKey = `${generationRunId}:turn:1`;
const image = await broadcast.stageUpload({
  mediaType: "image",
  asset: { data: finishedImageBlob, filename: "scene.jpg", sha256: imageSha256 },
  imageDuration: 18,
  idempotencyKey: `${slotKey}:image`,
  slotKey,
});
await broadcast.stageUpload({
  mediaType: "audio",
  asset: { data: finishedAudioBlob, filename: "narration.wav", sha256: audioSha256 },
  idempotencyKey: `${slotKey}:audio`,
  slotKey,
});
await broadcast.releaseSlot(slotKey);

for await (const update of broadcast.watchJob(image.id)) {
  if (update.status === "failed") throw new Error(update.error ?? "queue job failed");
}

// Pass this descriptor to the application player; do not send `token` to it.
const playback = await broadcast.getPlayback();
```

`enqueueUpload` is the preferred distributed ingestion path. A trusted backend
sends each completed `image`, `audio`, or `video` asset over authenticated
multipart HTTP to its separately running Queue Broadcast Server. The server
owns the bytes after receipt, checks the supplied SHA-256, and plays eligible
items in FIFO order. Standalone audio is valid for capability consumers; an
application may choose to discard it by policy.

For a multi-asset generation turn or scheduled pre-roll, call `stageUpload` for
each successful asset with the same `slotKey`, then call `releaseSlot(slotKey)`.
Release is idempotent and atomically makes all staged items FIFO-eligible, so a
partially generated turn cannot air early. Adjacent image/audio items can then
be composited by the Streamer; image-only and video items play independently.
The `QueueUploadAsset` SHA-256 field lets the server verify bytes without an
extra producer-side copy. Identical idempotency retries return the original job
receipt; conflicting reuse maps to `QueueBroadcastError` status `409`.

`enqueuePairUpload` and `stagePair` remain supported for legacy producers, but
new applications should use individual uploads and slots.

`enqueueUrl` remains for backwards-compatible server-to-server URL ingestion.
It is not the recommended path for applications that already have the finished
media bytes.

## Availability preflight

Run this immediately before costly generation, archive recovery, or a direct
upload. `health` confirms that the Streamer's media service is ready;
`getPlayback` is authenticated and therefore also detects a bad control URL or
queue bearer token. Both accept an `AbortSignal`, so an operator stop or process
shutdown can cancel a pending availability check promptly.

```ts
const controller = new AbortController();
const health = await broadcast.health({ signal: controller.signal });
if (!health.ok) throw new Error("Streamer media service is unavailable");

const playback = await broadcast.getPlayback({ signal: controller.signal });
// Generate or upload only after both probes have succeeded.
```

Do not treat a queue-capacity response from a later upload as a preflight
failure: it means the service is reachable but has applied normal backpressure.

## `massively-social-ebook` example

Its generation worker owns a per-channel `STREAMER_ENDPOINT` and secret. It
generates image and narration independently in memory, computes SHA-256,
archives canonical media independently, then stages the successful image and
optional narration under one slot before releasing it. If narration fails, it
releases the image alone; if the image fails, it discards lone narration. The chapter page obtains
`getPlayback()` from its backend and gives the resulting HLS manifest to its
existing HLS-capable player. The page never calls queue endpoints or receives
the bearer token.

For chat from another broadcast platform, pass normalized provider events to
`ExternalChatIngress` in `@portalshq/capability-realtime-fanout` with the same
endpoint. That produces the `chat:<normalized endpoint>` topic; platform OAuth,
webhooks, storage, and relays remain outside this capability.

## Generated API

`src/generated/api.ts` is generated from the checked-in
`openapi/streamer.json` contract snapshot using Orval:

```bash
npm run generate -w @portalshq/capability-queue-broadcast
```

Refresh `openapi/streamer.json` from the Streamer repository when updating the
client, and commit the snapshot with the generated changes. This makes release
tests independent of a sibling checkout. The current snapshot comes from
Streamer commit `90b9102` (`openapi.json`). The
hand-written `QueueBroadcastClient` owns authentication, error mapping,
endpoint validation, and polling semantics.

## RTMP frame delivery

`RTMPStreamer` accepts Base64-encoded JPEG frames (a `data:image/jpeg;base64,`
prefix is also accepted) and pipes decoded JPEGs to FFmpeg. Set `ffmpegPath`
when the executable is not available as `ffmpeg` on `PATH`. The streamer owns
one RTMP destination, bounded buffering, process shutdown, and health status;
the consuming application owns generation and starts a separate instance for
each destination.

`GenerationContext.textOverlay` configures FFmpeg's `drawtext` filter. Pass the
same configuration to `RTMPStreamer` and set `audioDurationSeconds` from the
generated audio: the overlay is visible for the audio duration plus 1.5 seconds
at both the head and tail. With no audio it remains visible for five seconds.
The deployment FFmpeg build must include the `drawtext` filter (libfreetype);
set `fontFile` when it has no usable default font.
