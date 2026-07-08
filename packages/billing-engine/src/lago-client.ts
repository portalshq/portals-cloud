/**
 * Lago REST API client.
 *
 * Lago self-hosted runs in-cluster on LKE (see infra/k8s/base/lago.yaml).
 * LAGO_API_URL and LAGO_API_KEY are set as K8s secrets and injected as env vars.
 *
 * Lago's role in the stack:
 *   OpenMeter aggregates raw events → this client reports usage to Lago →
 *   Lago applies the plan's pricing rules → Lago generates invoices →
 *   invoices are pushed to Stripe for payment collection.
 */

export interface LagoCustomer {
  externalId: string;   // your tenantId / developerId — Lago's external_id
  name: string;
  email?: string;
  planCode?: string;
}

export interface LagoUsageRecord {
  externalCustomerId: string;
  externalSubscriptionId: string;
  code: string;         // billable metric code
  timestamp: string;    // ISO 8601
  quantity: number;
}

export class LagoClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config?: { baseUrl?: string; apiKey?: string }) {
    this.baseUrl = config?.baseUrl ?? process.env.LAGO_API_URL ?? "http://lago-api.portals-platform.svc.cluster.local:3000";
    this.apiKey = config?.apiKey ?? process.env.LAGO_API_KEY ?? "";
  }

  private async request(path: string, method: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`Lago API error ${res.status} on ${method} ${path}: ${await res.text()}`);
    }
    return res.json();
  }

  /** Upsert a customer (developer/tenant) in Lago. Call on developer onboarding. */
  async upsertCustomer(customer: LagoCustomer): Promise<void> {
    await this.request("/customers", "POST", { customer });
  }

  /** Assign a plan to a customer (creates a Lago subscription). */
  async assignPlan(externalCustomerId: string, planCode: string): Promise<void> {
    await this.request("/subscriptions", "POST", {
      subscription: {
        external_customer_id: externalCustomerId,
        plan_code: planCode,
        external_id: `${externalCustomerId}__${planCode}`,
      },
    });
  }

  /**
   * Report usage to Lago from OpenMeter's aggregated metrics.
   * Called by the billing sync job (see billing-sync-cronjob.yaml) on a
   * per-billing-period schedule, not in-line with events — this is a
   * reporting push, not a real-time call.
   */
  async reportUsage(records: LagoUsageRecord[]): Promise<void> {
    // Lago batch usage event ingest
    for (const record of records) {
      await this.request("/events", "POST", { event: record });
    }
  }

  /** Trigger immediate invoice generation for a customer (e.g. post live-event). */
  async generateInvoice(externalCustomerId: string): Promise<void> {
    await this.request(`/customers/${externalCustomerId}/finalize_invoice`, "POST");
  }

  /** Fetch current period usage for a customer — powers developer dashboards. */
  async getCurrentUsage(externalCustomerId: string): Promise<unknown> {
    return this.request(`/customers/${externalCustomerId}/current_usage`, "GET");
  }
}
