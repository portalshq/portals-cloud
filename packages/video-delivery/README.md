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

The `VideoDeliveryPlayer` React component supports both HLS playback and Reactor WebRTC streaming. Reactor mode is activated by providing `reactorToken`, `reactorSessionId`, and `reactorModelName` props.

**Note:** Reactor WebRTC requires the `@reactor-team/js-sdk` package to be installed (optional peer dependency). The component dynamically imports the SDK when Reactor mode is requested.

```tsx
import { VideoDeliveryPlayer } from "@portalshq/capability-video-delivery/react";

// HLS mode (default)
<VideoDeliveryPlayer
  playback={playbackSession}
  onPlaybackObservation={(obs) => console.log("State:", obs.state)}
/>

// Reactor WebRTC mode
<VideoDeliveryPlayer
  playback={playbackSession}
  reactorToken={reactorJwtToken}
  reactorSessionId={reactorSessionId}
  reactorModelName="reactor/helios"
  onPlaybackObservation={(obs) => console.log("State:", obs.state)}
/>
```

### Reactor Integration

The Reactor WebRTC wrapper:
- Dynamically imports `@reactor-team/js-sdk` when Reactor mode is activated
- Creates Reactor instance with provided model name
- Connects to Reactor via WebRTC using the provided token
- Supports session adoption via `sessionId` option
- Automatically disconnects on component unmount
- Maps Reactor connection states to VideoDeliveryPlayer observation states
- Falls back gracefully if Reactor SDK is not installed

**Current Status:**
- ✅ React component structure with Reactor props
- ✅ Dynamic import of Reactor SDK (optional peer dependency)
- ✅ Production-ready Reactor SDK integration (connect, disconnect, error handling)
- ✅ Session adoption support (connect to existing session)
- ✅ Automatic cleanup on unmount

**Recommended:** Install `@reactor-team/js-sdk` in your application to enable Reactor WebRTC mode. The component provides production-ready SDK integration with proper lifecycle management.

## Usage notes

- `LiveDelivery.start()` retries manifest access (three attempts by default), then performs periodic health checks. Inspect `getStatus()` for health and the last failure.
- Call browser-caption `remove()` or live-caption `dispose()` when replacing a player/session.
- Native HLS is used where available; `hls.js` is an optional peer dependency for other browsers. React is required only for the `/react` entry point.
- The manifest URL must be public/unlisted or otherwise playable by the browser. Do not expose origin/control-plane credentials.
- WebRTC player is a stub; use `@reactor-team/js-sdk` for production Reactor WebRTC connections.
