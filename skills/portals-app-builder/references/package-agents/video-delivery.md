<!-- doc-module: video-delivery-agent-guide -->
# Video delivery: agent guide
## Load when
Checking an HLS manifest, mounting captions, or attaching HLS playback in browser/React code.
## Use
Keep origin/control credentials server-side; clean up caption and controller resources when replacing playback.
## Do not assume
The package provisions, signs, or hosts an HLS origin, or decides application live/VOD policy.
