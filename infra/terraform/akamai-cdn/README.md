# infra/terraform/akamai-cdn

Placeholder. Akamai's CDN/edge config (Property Manager, edge hostnames,
CP codes) is typically account-provisioned through Akamai Control Center
before it's manageable via Terraform's `akamai/akamai` provider, and the
exact resource shape depends on your Akamai contract tier. Rather than
guess at resource arguments that may not match your account, this is left
as a placeholder with the integration point documented:

- `video-delivery` capability (`packages/capabilities/video-delivery`)
  expects a `playbackManifestUrl` served from an Akamai edge hostname.
- Once an Akamai account/contract is provisioned, add `main.tf` here using
  the `akamai/akamai` Terraform provider, and wire the resulting edge
  hostname into that capability's config.

Do this once there's an actual Akamai account to point Terraform at —
writing speculative resource blocks against an account that doesn't exist
yet is more likely to mislead than help.
