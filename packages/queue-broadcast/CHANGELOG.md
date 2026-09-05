# Changelog

## 0.1.6

- Republish the committed queue-broadcast capability release.

## 0.1.5

- Depend on the matching published realtime-fanout and video-delivery releases.

## 0.1.4

- Prevent recursive npm publish lifecycle execution in the workspace publisher.

## 0.1.3

- Republish the completed independent staged-slot capability after the unavailable 0.1.2 registry release.

## 0.1.2

- Add generic authenticated multipart image, audio, and video upload with SHA-256-backed idempotency.
- Add independent staged slots with typed `getSlot` and idempotent atomic `releaseSlot` APIs.
- Retain direct image/audio pair upload and pair release for legacy producers.
- Keep archive URLs out of the streamer ingestion path; trusted producers send completed bytes directly to their isolated streamer endpoint.
- Allow `health` and authenticated `getPlayback` probes to receive an `AbortSignal` for prompt production-gate cancellation.

## 0.1.1

- Consume the hardened realtime-fanout and video-delivery capabilities.

## 0.1.0

- Initial server-only Queue Broadcast producer capability.
