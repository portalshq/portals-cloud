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

{{package-agent-index}}

Use `references/channel-registry.schema.json` when creating or editing a channel registry. It accepts only environment-variable references for sensitive configuration and supports optional YouTube and Twitch live-chat settings. If a channel declares PX entities and PX tooling is configured, load the PX resolver/update skills to work with them; the Portals resolver package alone is only an application boundary.

For interaction-heavy UI, also load `../apple-design/SKILL.md`. Preserve the app's visual language rather than imitating Apple branding.

## Platform Boundaries

- Treat `capability-identity` and `capability-text-image-delivery` as unavailable runtime capabilities until their non-stub implementations ship.
- Keep origin/control credentials, catalog pricing, Stripe secrets, webhook verification, authorization, moderation, and persistence server-side.
- Do not infer hosting, live/VOD policy, entitlement grants, queue durability, admission control, or PX data resolution from a package interface alone. Follow the loaded module's **Do not assume** section.
- For multi-instance realtime delivery, provide a durable broker-backed fanout implementation. Do not rely on an in-memory bus for production.
