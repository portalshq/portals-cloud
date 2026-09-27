# @portalshq/capability-video-delivery

**Reusable agent module:** [integration guide](../../docs/package-agents/video-delivery.md)

HLS playback health checks, browser playback helpers, sidecar captions, and optional application-policy programming. It does not provision an origin, sign manifests, or decide live/VOD product rules.

```ts
import { LiveDelivery } from "@portalshq/capability-video-delivery";

const delivery = new LiveDelivery({ sessionId, playbackManifestUrl });
const playback = await delivery.start(); // fetches and validates the manifest
// Hand only playback.playbackManifestUrl to the viewer.
await delivery.stop();
```

## Exports

- Root: `LiveDelivery`, `HlsPlaybackSession`, caption types/helpers, and programming pipeline types.
- `@portalshq/capability-video-delivery/browser`: `HlsPlaybackController`, `mountPlaybackCaptions`, and `createLiveCaptionController`.
- `@portalshq/capability-video-delivery/react`: `VideoDeliveryPlayer`.

## Usage notes

- `LiveDelivery.start()` retries manifest access (three attempts by default), then performs periodic health checks. Inspect `getStatus()` for health and the last failure.
- Call browser-caption `remove()` or live-caption `dispose()` when replacing a player/session.
- Native HLS is used where available; `hls.js` is an optional peer dependency for other browsers. React is required only for the `/react` entry point.
- The manifest URL must be public/unlisted or otherwise playable by the browser. Do not expose origin/control-plane credentials.
