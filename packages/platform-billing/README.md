# @portalshq/platform-billing

**Reusable agent module:** [integration guide](../../docs/package-agents/platform-billing.md)

Tenant infrastructure billing: emit usage to OpenMeter, report aggregated usage to Lago, and support the platform's own Stripe B2B flows. It is not the audience-to-creator payout package; use `@portalshq/monetization` for that.

```ts
import { LagoClient, MeteringClient, MeteringEvents } from "@portalshq/platform-billing";

const metering = new MeteringClient({ endpoint: openMeterEndpoint });
await metering.emit(MeteringEvents.capabilityInvoked({ subject: tenantId, capabilityId, sessionId, channelId }));

const lago = new LagoClient({ apiKey: lagoApiKey, baseUrl: lagoUrl });
await new BillingSync(lago, openMeterEndpoint).syncTenant(tenantId, fromIso, toIso);
```

## Components

- `MeteringEvents`: CloudEvent builders for runtime usage.
- `MeteringClient`: best-effort HTTP emission. It logs and swallows errors so it never blocks a session.
- `LagoClient`: customer, subscription, usage, invoice, and current-usage HTTP client.
- `BillingSync`: scheduled OpenMeter-to-Lago reporter for tenant-billable meters.
- `BillingPlans`: declarative Lago plan definitions.
- `StripePlatformBilling` / `createStripePlatformBilling`: platform-account B2B Stripe helpers.
- `reportTenantRake`: reports policy-calculated marketplace rake; rates come from `@portalshq/policy`.

## Operations and limits

- Inject `LagoClient`'s API key; `MeteringClient` and `LagoClient` may fall back to documented in-cluster endpoint environment variables.
- Create matching OpenMeter meters and Lago customer/subscription records before syncing. `BillingSync` assumes `${tenantId}__px-developer-base` and four fixed meter codes.
- `BillingSync` is a scheduled job, not a hot-path operation. Its OpenMeter queries are unauthenticated and skip failed meter responses; secure the network and monitor sync failures externally.
- `MeteringClient.emitBatch()` currently serializes individual requests. Use a broker pipeline for high-volume events.
- This package has no test coverage. Validate API contracts against your OpenMeter and Lago versions before a production rollout.
