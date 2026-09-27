# Portals App Builder TODOs

The current skill is safe and composable, but not yet reliable enough to autonomously produce complete interactive Portals apps from natural-language requests.

## Template App Integration

- Add a concrete reference to the template app, its entrypoints, setup commands, and supported extension seams.
- Define the PX/template-app configuration path, including when PX is needed and how an app should configure it.

## Capability Selection

- Add a natural-language capability matrix that deterministically maps common requests to package modules.
- Cover combined requests such as livestream audience chat (`video-delivery` + `realtime-fanout` + `queue-broadcast`) and paid members-only shows (add monetization and entitlement handling).
- Generate capability availability from package metadata or implementation status instead of maintaining the parent skill's stub warning manually.

## Implementation Guidance

- Add end-to-end recipes for common app shapes, including server routes, React state, channel-registry edits, and package wiring.
- Add runtime/API examples; package-agent modules are boundary guardrails, not integration instructions.

## Verification

- Extend verification beyond typechecking to cover startup, registry validation, browser interaction, reconnect behavior, payment/webhook handling, mobile behavior, and reduced-motion support.
