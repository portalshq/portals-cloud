# @portalshq/capability-video-delivery

## 0.1.9

### Patch Changes

- 99f377d: Stop HLS playback reconnecting on the media element's `stalled` event. Chrome fires `stalled` every few seconds on a healthy MSE-backed stream — `readyState` intact, no error, `currentTime` still climbing — so the controller was tearing down hls.js and reloading from zero on a loop, pinning the UI in `reconnecting` and restarting the video every few seconds. A real outage still surfaces as `waiting` (underrun) or a fatal hls.js `NETWORK_ERROR`, and both are unchanged.

## 0.1.8

### Patch Changes

- a03f1cf: Move reusable live application domains into Portals packages: monotonic tick timing and countdowns, bounded ordered content preparation, isolated realtime fanout, scheduled live delivery and reusable HLS playback, plus Stripe platform and Connect channel billing.
- 749ad63: Standardize public npm publishing and repository metadata for releases through
  GitHub Actions trusted publishing. Remove recursive publish lifecycle hooks.
- Updated dependencies [749ad63]
  - @portalshq/contracts@0.0.5

## 0.1.6

### Patch Changes

- aff6c1d: Standardize public npm publishing and repository metadata for releases through
  GitHub Actions trusted publishing. Remove recursive publish lifecycle hooks.
- Updated dependencies [aff6c1d]
  - @portalshq/contracts@0.0.4

## 0.1.5

### Patch Changes

- Republish the committed video-delivery capability release.

## 0.1.4

### Patch Changes

- Publish the cancellation-safe live delivery session capability to the registry.

## 0.1.3

### Patch Changes

- Make manifest health checks timeout-aware, single-flight, and safe across concurrent start/stop cycles.

## 0.1.1

### Patch Changes

- 8884dd5: feat: add ESM build infrastructure to all packages
- Updated dependencies [8884dd5]
  - @portalshq/contracts@0.0.3
