# @portalshq/capability-video-delivery

**Reusable agent module:** [integration guide](../../docs/package-agents/video-delivery.md)

HLS playback health checks, browser playback helpers, sidecar captions, WebRTC player for Reactor, and optional application-policy programming. It does not provision an origin, sign manifests, or decide live/VOD product rules.

```ts
import { LiveDelivery } from "@portalshq/capability-video-delivery";

const delivery = new LiveDelivery({ sessionId, playbackManifestUrl });
const playback = await delivery.start(); // fetches and validates the manifest
// Hand only playback.playbackManifestUrl to the viewer.
await delivery.stop();
```

## Exports

- Root: `LiveDelivery`, `HlsPlaybackSession`, `WebRTCPlayer`, caption types/helpers, and programming pipeline types.
- `@portalshq/capability-video-delivery/browser`: `HlsPlaybackController`, `mountPlaybackCaptions`, and `createLiveCaptionController`.
- `@portalshq/capability-video-delivery/react`: `VideoDeliveryPlayer`.

## WebRTC Player for Reactor

The `WebRTCPlayer` class provides low-latency WebRTC playback for Reactor live streaming. This is a stub implementation that defines the interface; full implementation requires Reactor's WebRTC signaling protocol.

**Note:** For production Reactor WebRTC connections, use the official `@reactor-team/js-sdk` package. The WebRTCPlayer in this package is provided as a stub for potential custom implementations.

```ts
import { WebRTCPlayer } from "@portalshq/capability-video-delivery";

const player = new WebRTCPlayer({
  media: videoElement,
  signaling: {
    apiUrl: "https://api.reactor.inc",
    sessionId: "reactor-session-id-from-backend",
    token: "reactor-jwt-token",
    modelName: "reactor/helios",
  },
  onObservation: (obs) => console.log("WebRTC state:", obs.state),
});

await player.connect();
```

**Current Status:** Stub implementation. Full implementation requires:
- Reactor signaling protocol implementation
- SDP offer/answer exchange
- ICE candidate handling
- Data channel for commands

**Recommended:** Use `@reactor-team/js-sdk` for Reactor WebRTC connections instead of this stub.

## Usage notes

- `LiveDelivery.start()` retries manifest access (three attempts by default), then performs periodic health checks. Inspect `getStatus()` for health and the last failure.
- Call browser-caption `remove()` or live-caption `dispose()` when replacing a player/session.
- Native HLS is used where available; `hls.js` is an optional peer dependency for other browsers. React is required only for the `/react` entry point.
- The manifest URL must be public/unlisted or otherwise playable by the browser. Do not expose origin/control-plane credentials.
- WebRTC player is a stub; use `@reactor-team/js-sdk` for production Reactor WebRTC connections.
