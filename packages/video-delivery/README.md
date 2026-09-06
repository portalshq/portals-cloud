# @portalshq/capability-video-delivery

`LiveDelivery` connects one configured HLS playback stream per instance. It
does not create an origin, schedule programs, or define whether content is
"live" or "VOD"; those are application business decisions. It verifies the
configured manifest on start, retries connection failures, and continues to
monitor its health while active.

`HlsPlaybackSession` is the common, token-free descriptor for an HLS-capable
application player. Queue Broadcast returns this descriptor after its trusted
backend has talked to the queue control plane; the player receives only the
public/unlisted manifest URL.

## Sidecar captions

Captions are a `video-delivery` feature: it validates supplied WebVTT URLs or
timed cues, returns them with the playback descriptor, and mounts native HTML
`<track>` elements in the viewer. They are never pixels burned into the stream.
For supplied cues, the package creates and later revokes a browser-local WebVTT
source. A cross-origin caption host must permit the player origin with the
appropriate CORS headers.

```ts
const playback = await client.getPlayback({
  captionTracks: [{
    id: "en",
    label: "English",
    language: "en",
    cues: [
      { startTimeSeconds: 0, endTimeSeconds: 2.5, text: "Welcome." },
    ],
    default: true,
  }],
});
```

```ts
import { mountPlaybackCaptions } from "@portalshq/capability-video-delivery/browser";

const video = document.querySelector("video")!;
video.src = playback.playbackManifestUrl;
const mountedCaptions = mountPlaybackCaptions(video, playback);

// Remove these package-managed tracks when this playback session is replaced.
mountedCaptions.remove();
```

Use `src` instead of `cues` when the consuming app already hosts a `.vtt` file.
`createWebVtt(cues)` is also available when it needs VTT content for a custom
storage flow.

## Realtime live captions

For a live HLS timeline, use `createLiveCaptionController` rather than a fixed
VTT cue list. It creates a native browser text track, forces it visible, and
timestamps each supplied event at the player's current media time.

```ts
import { createLiveCaptionController } from "@portalshq/capability-video-delivery/browser";

const captions = createLiveCaptionController(video, {
  id: "en-live",
  label: "English",
  language: "en",
});

captionEvents.subscribe(({ text, durationSeconds }) => {
  captions.publish({ text, durationSeconds });
});

// Call when replacing the player/session.
captions.dispose();
```

## Scheduled and dual-format programming

Create separate delivery objects for independent stream windows. For example,
an application can start a `morning` instance for a 9am–12pm manifest and an
`afternoon` instance for a 1pm–5pm manifest. The application owns that clock,
its routing, and any VOD-versus-live presentation rules; each `LiveDelivery`
object only observes and returns its one configured HLS stream.

```ts
const morning = new LiveDelivery({
  sessionId: "morning-stream",
  playbackManifestUrl: "https://media.example/morning/index.m3u8",
});
const afternoon = new LiveDelivery({
  sessionId: "afternoon-stream",
  playbackManifestUrl: "https://media.example/afternoon/index.m3u8",
});

await morning.start();
// Application-owned scheduler later calls morning.stop() and afternoon.start().
```
