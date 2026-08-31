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

const job = await broadcast.enqueueUrl({
  mediaType: "video",
  url: finishedVideoUrl,
  idempotencyKey: generationRunId,
});

for await (const update of broadcast.watchJob(job.id)) {
  if (update.status === "failed") throw new Error(update.error ?? "queue job failed");
}

// Pass this descriptor to the application player; do not send `token` to it.
const playback = await broadcast.getPlayback();
```

`enqueueUrl` accepts completed `video`, `image`, or `audio` URLs. Image duration
is optional and only valid for images. The server stores an idempotency key and
request fingerprint, so repeating an identical request returns the original job;
reusing a key for different media returns a typed `QueueBroadcastError` with
status `409`.

## `massively-social-ebook` example

Its generation worker should own a per-channel `STREAMER_ENDPOINT` and secret.
After generating a chapter asset, it calls `enqueueUrl` with the generation run
ID as the idempotency key. The chapter page obtains `getPlayback()` from its
backend and gives the resulting HLS manifest to its existing HLS-capable player.
The page never calls queue endpoints or receives the bearer token.

For chat from another broadcast platform, pass normalized provider events to
`ExternalChatIngress` in `@portalshq/capability-realtime-fanout` with the same
endpoint. That produces the `chat:<normalized endpoint>` topic; platform OAuth,
webhooks, storage, and relays remain outside this capability.

## Generated API

`src/generated/api.ts` is generated from the Streamer repository's checked-in
`openapi.json` contract using Orval:

```bash
npm run generate -w @portalshq/capability-queue-broadcast
```

Commit generated changes with the matching Streamer OpenAPI artifact. The
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
