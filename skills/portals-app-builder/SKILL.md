---
name: portals-app-builder
description: Plan and build a Portals-enabled React/Vite plus Node.js/Express channel app. Use for interactive channel experiences, live video, realtime audiences, monetization, channel registries, and PX-backed narratives.
---

# Portals App Builder

Build application code only. Do not modify Portals packages. Keep secrets, tokens, and credentials out of source code, logs, and plans; applications reference environment-variable names only.

## Workflow

1. Read the target app and its existing code before choosing packages.
2. Before editing, give a concise plan covering requested user flows, `channel-registry.json` changes, relevant Portals packages plus app-owned glue, and files to change.
3. Implement after the plan unless the user explicitly asks to stop at planning. Keep the app React/Vite on the client and Node.js/Express on the server.
4. Run the app's typecheck. If no script exists, run the narrowest available TypeScript check and say what was run.

## Capability Modules

Load every relevant generated package module below; these are composable guidance modules, not mutually exclusive subskills.

- [capabilities-redirect.md](references/package-agents/capabilities-redirect.md) - `@portalshq/capabilities-redirect` `0.0.5`
- [contracts.md](references/package-agents/contracts.md) - `@portalshq/contracts` `0.0.5`
- [identity.md](references/package-agents/identity.md) - `@portalshq/capability-identity` `0.1.3`
- [monetization.md](references/package-agents/monetization.md) - `@portalshq/monetization` `0.2.0`
- [platform-billing.md](references/package-agents/platform-billing.md) - `@portalshq/platform-billing` `0.0.5`
- [policy.md](references/package-agents/policy.md) - `@portalshq/policy` `0.0.5`
- [queue-broadcast.md](references/package-agents/queue-broadcast.md) - `@portalshq/capability-queue-broadcast` `0.1.9`
- [realtime-fanout.md](references/package-agents/realtime-fanout.md) - `@portalshq/capability-realtime-fanout` `0.1.8`
- [registry.md](references/package-agents/registry.md) - `@portalshq/registry` `0.0.5`
- [resolver.md](references/package-agents/resolver.md) - `@portalshq/resolver` `0.0.5`
- [runtime-core.md](references/package-agents/runtime-core.md) - `@portalshq/runtime-core` `0.0.9`
- [sdk.md](references/package-agents/sdk.md) - `@portalshq/sdk` `0.0.5`
- [text-image-delivery.md](references/package-agents/text-image-delivery.md) - `@portalshq/capability-text-image-delivery` `0.1.3`
- [video-delivery.md](references/package-agents/video-delivery.md) - `@portalshq/capability-video-delivery` `0.1.8`

Use `references/channel-registry.schema.json` when creating or editing a channel registry. It accepts only environment-variable references for sensitive configuration and supports optional YouTube and Twitch live-chat settings. If a channel declares PX entities and PX tooling is configured, load the PX resolver/update skills to work with them; the Portals resolver package alone is only an application boundary.

For interaction-heavy UI, also load `../apple-design/SKILL.md`. Preserve the app's visual language rather than imitating Apple branding.

## Platform Boundaries

- Treat `capability-identity` and `capability-text-image-delivery` as unavailable runtime capabilities until their non-stub implementations ship.
- Keep origin/control credentials, catalog pricing, Stripe secrets, webhook verification, authorization, moderation, and persistence server-side.
- Do not infer hosting, live/VOD policy, entitlement grants, queue durability, admission control, or PX data resolution from a package interface alone. Follow the loaded module's **Do not assume** section.
- For multi-instance realtime delivery, provide a durable broker-backed fanout implementation. Do not rely on an in-memory bus for production.
