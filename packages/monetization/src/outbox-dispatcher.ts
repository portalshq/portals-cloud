import type { BillingOutboxEvent, BillingStore } from "./types.js";

export interface BillingOutboxDispatcherOptions {
  store: BillingStore;
  publish(event: BillingOutboxEvent): Promise<void>;
  batchSize?: number;
}

/** Delivers committed billing events without coupling webhooks to a realtime transport. */
export class BillingOutboxDispatcher {
  private readonly batchSize: number;

  constructor(private readonly options: BillingOutboxDispatcherOptions) {
    this.batchSize = options.batchSize ?? 50;
    if (!Number.isInteger(this.batchSize) || this.batchSize < 1 || this.batchSize > 500) {
      throw new TypeError("batchSize must be an integer from 1 to 500");
    }
  }

  async drainOnce(): Promise<{ delivered: number; failed: number }> {
    const events = await this.options.store.claimOutbox(this.batchSize);
    let delivered = 0;
    let failed = 0;
    for (const event of events) {
      try {
        await this.options.publish(event);
        await this.options.store.completeOutbox(event.id);
        delivered += 1;
      } catch (cause) {
        await this.options.store.failOutbox(event.id, cause instanceof Error ? cause.message : String(cause));
        failed += 1;
      }
    }
    return { delivered, failed };
  }
}
