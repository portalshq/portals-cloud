# Portals Platform — Capability Runtime & Channel Infrastructure

This repo is the **infrastructure layer** that powers `studio-app` and `25thChapter`,
extracted into reusable, versioned packages so any developer — internal or third-party —
can compose a new channel (audience-directed film, live game show, text/image narrative,
VR room, emergent series) out of the same primitives, instead of every channel type
being its own vertical stack.

## Why capability-first, not channel-first

The four target channel types (branching film, live game show, text/image narrative,
VR/social) are being built **in parallel with no prioritization**. That's only cheap if
none of them get a bespoke stack. Every channel type in this repo is assembled from the
same five capability packages — `realtime-fanout`, `video-delivery`,
`text-image-delivery`, `identity`, `narrative-engine-adapter` — plus the resolver/registry
control plane. Building a new channel type should mean writing a manifest, not writing
infrastructure.

## What's new here vs. what already exists

- **NAP protocol (v0)** and the **Narrative Engine (v0, alpha)** already exist and are
  live in `studio-app` and `25thChapter`. This repo does **not** rebuild them. It wraps
  them in capability-contract adapters (`packages/resolver`,
  `packages/capabilities/narrative-engine-adapter`) so they become consumable by *any*
  channel through the same interface, instead of bespoke per-product integrations.
  See `docs/architecture-decision-records/0003-*.md` for the non-breaking integration
  plan.
- **Everything else in `packages/`** — the runtime, registry, real-time fan-out,
  delivery capabilities, identity, SDK — is genuinely greenfield. None of this existed
  before this repo.

## Repo layout

```
packages/
  contracts/                    # Capability contract types + channel manifest schema (zod)
  runtime-core/                 # Control plane: session orchestrator, data-plane gateway
  registry/                     # Capability registry (register/resolve/version)
  resolver/                     # NAP address resolver — adapter over existing NAP v0
  capabilities/
    realtime-fanout/            # Chat + polls + lobby control — one pub/sub primitive
    video-delivery/             # Live + VOD session abstraction
    text-image-delivery/        # 25thChapter-style chapter/text/image delivery
    identity/                   # Cross-channel audience identity & session
    narrative-engine-adapter/   # Adapter over existing Narrative Engine v0
  sdk/                          # Developer CLI + channel manifest loader
infra/
  terraform/linode/             # LKE cluster + Object Storage (cloud-agnostic via K8s)
  terraform/akamai-cdn/         # Edge/CDN config for video + asset delivery
  k8s/base/                     # Base manifests: namespace, runtime-core, registry, NATS
docs/
  architecture-decision-records/
```

## Infra target

Kubernetes-first on **Linode (LKE)**, CDN/edge on **Akamai**. Rationale in
`docs/architecture-decision-records/0001-*.md` — short version: standard K8s underneath
means this is portable to any provider later without a rewrite, Akamai's edge network is
materially cheaper for the video egress that dominates platform unit economics, and
Linode Object Storage is S3-API-compatible so nothing here is locked to a proprietary
storage API.

## Getting started

```bash
pnpm install
pnpm build
pnpm --filter @nap/sdk run dev -- channel init my-first-channel
```

## Status

Pre-alpha. Contracts and runtime are scaffolds, not yet wired to live infra. Treat this
as the structural skeleton the team fills in, not a deployable system yet.
