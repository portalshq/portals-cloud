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
