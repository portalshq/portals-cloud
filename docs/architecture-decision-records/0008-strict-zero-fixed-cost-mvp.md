# ADR 0008: Retired zero-fixed-cost storage assumption

- Status: Superseded by [Mac-hosted production implementation plan](../deployment/mac-hosted-production-implementation-plan.md)
- Date: 2026-09-24

The previous version of this record incorrectly treated a Mac-local Lore data
directory as the production durable store and excluded AWS entirely. The
checked-out `portalshq/lore` production design uses the AWS plugin: S3 plus
DynamoDB for immutable fragments and metadata, mutable state, and locks.
S3-only is invalid.

The current architecture is therefore a Mac-hosted compute bootstrap, not a
zero-cost storage architecture:

- MacBook Pro runs Lore, Auth Gateway, Next.js, Caddy, and Pinggy clients.
- Pinggy Pro supplies the public TLS/TCP and UDP ingress, subject to the
  protocol compatibility gates.
- Neon retains application/lead/CRM data.
- Lore production durability uses least-privilege AWS S3 and DynamoDB.
- Next.js owns browser-facing application domains; Auth Gateway owns PX/Lore
  authentication only.

The implementation plan is the sole release-gate authority for this topology.
