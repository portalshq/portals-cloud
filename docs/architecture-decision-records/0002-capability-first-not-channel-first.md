# ADR 0002: Capability-first repo structure for parallel channel-type development

## Status
Accepted

## Context
Four channel types — audience-directed film, live game show, text/image
narrative, VR/social — are being built in parallel with no prioritization
between them. Building each as its own vertical stack would mean ~4x the
infrastructure surface area and no shared hardening.

## Decision
There is no `channels/` directory of per-type implementations in this
repo. There is `packages/capabilities/`, a small fixed set
(realtime-fanout, video-delivery, text-image-delivery, identity,
narrative-engine-adapter) that every channel type composes via a manifest
(`packages/sdk/example-channel.yaml`). A "new channel type" is a new
manifest plus, at most, one new capability package — not a new stack.

## Consequences
- Parallel development across all four channel types is safe specifically
  *because* they share capabilities: a fix or hardening pass on
  `realtime-fanout` benefits the game show and the social-remix channel
  simultaneously.
- This only holds if new channel-specific needs get added as capabilities
  (composable, contract-bound) rather than as channel-specific code paths
  inside `runtime-core`. Watch for that drift in review.
- VR/social as a fourth channel type isn't fully represented by a
  capability package yet — the four packages built here cover the other
  three plus identity. Revisit once VR's specific real-time/spatial
  requirements are clearer; it likely composes `realtime-fanout` +
  `identity` plus a new capability, not a replacement for either.
