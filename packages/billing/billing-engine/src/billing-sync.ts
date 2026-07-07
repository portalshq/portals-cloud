import { LagoClient, LagoUsageRecord } from "./lago-client";

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
    // 1. Query OpenMeter for each billable meter for this tenant
    const meters = [
      "capability-invocations",
      "session-minutes",
      "storage-written-bytes",
      "peak-concurrent-viewers",
      "marketplace-gmv-cents",
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
        externalSubscriptionId: `${tenantId}__nap-developer-base`,
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
