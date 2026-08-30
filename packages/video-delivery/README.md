# @portalshq/capability-video-delivery

Live + VOD behind one interface so branching-film, game-show, and any
future video-bearing channel type share the same delivery capability
instead of each integrating their own transcoding/CDN stack. Edge target
is Akamai (see infra/terraform/akamai-cdn) — chosen for video-egress cost,
which the platform economics review flags as the dominant linear cost
driver at audience scale.

`HlsPlaybackSession` is the common, token-free descriptor for an HLS-capable
application player. Queue Broadcast returns this descriptor after its trusted
backend has talked to the queue control plane; the player receives only the
public/unlisted manifest URL.
