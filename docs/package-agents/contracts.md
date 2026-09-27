<!-- doc-module: contracts-agent-guide -->
# Contracts: agent guide
## Load when
Defining a channel manifest, capability contract, trusted tenant context, or content descriptor.
## Use
Parse untrusted manifest data with Zod; obtain tenancy from trusted server state; use `ContentDeliveryAdapter` to require a rating.
## Do not assume
Schema parsing resolves modules, enforces quotas, authorizes a tenant, or provides legal age controls.
