---
"@portalshq/capability-video-delivery": patch
---

Stop HLS playback reconnecting on the media element's `stalled` event. Chrome fires `stalled` every few seconds on a healthy MSE-backed stream — `readyState` intact, no error, `currentTime` still climbing — so the controller was tearing down hls.js and reloading from zero on a loop, pinning the UI in `reconnecting` and restarting the video every few seconds. A real outage still surfaces as `waiting` (underrun) or a fatal hls.js `NETWORK_ERROR`, and both are unchanged.
