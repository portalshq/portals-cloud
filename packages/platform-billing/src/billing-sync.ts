import { LagoClient, LagoUsageRecord } from "./lago-client.js";

/**
 * Pulls aggregated usage from OpenMeter and pushes it to Lago.
 * Intended to run as a K8s CronJob (see infra/k8s/base/billing-sync-cronjob.yaml)
 * on an hourly or daily schedule — not in the hot path.
 *
 * This is the seam between the two tools:
 *   OpenMeter: "your customers used X units this period"
 *   Lago: "charge them for X units according to their plan"
 */
export class BillingSync {
  constructor(
    private lago: LagoClient,
    private openMeterEndpoint: string,
  ) {}

  async syncTenant(tenantId: string, fromIso: string, toIso: string): Promise<void> {
    // 1. Query OpenMeter for each *tenant-billable* meter for this tenant.
    //
    // `marketplace-gmv-cents` is deliberately absent. It is the basis on which
    // the platform computes its own rake, so billing it to a tenant would charge
    // the tenant for the platform's revenue. Rake is settled on the payout side
    // in `@portalshq/monetization`, using the rates in `@portalshq/policy`.
    const meters = [
      "capability-invocations",
      "session-minutes",
      "storage-written-bytes",
      "peak-concurrent-viewers",
    ];

    const records: LagoUsageRecord[] = [];

    for (const meterCode of meters) {
      const usageRes = await fetch(
        `${this.openMeterEndpoint}/api/v1/meters/${meterCode}/query?subject=${tenantId}&from=${fromIso}&to=${toIso}`,
      );
      if (!usageRes.ok) continue;

      const usage = await usageRes.json() as { data: { total: number }[] };
      const total = usage.data?.[0]?.total ?? 0;
      if (total === 0) continue;

      records.push({
        externalCustomerId: tenantId,
        externalSubscriptionId: `${tenantId}__px-developer-base`,
        code: meterCode,
        timestamp: toIso,
        quantity: total,
      });
    }

    if (records.length > 0) {
      await this.lago.reportUsage(records);
    }
  }
}
