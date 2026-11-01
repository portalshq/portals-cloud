<!-- doc-module: monetization-agent-guide -->
# Monetization: agent guide
## Load when
Building audience checkout, Connect destination-charge settlement, ledger/outbox processing, or entitlements.
## Use
Keep catalog pricing and Stripe secrets server-side; verify raw signed webhooks; run and monitor `MonetizationDispatcher` continuously. A `tenantId` names the channel owner — the Connect recipient that is paid — never the paying end user (consumer) and never the channel.
## Do not assume
Checkout alone grants access, a tenant is transfer-ready before onboarding, or unprocessed/parked outbox events are harmless.
