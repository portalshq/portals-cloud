import type { BillingOutboxEvent, BillingStore, IdGenerator } from "./types.js";
import { BillingOutboxDispatcher } from "./outbox-dispatcher.js";
import {
  applySettlementEvent,
  readSettlementFacts,
  type EntitlementStore,
} from "./entitlements.js";

/** What entitlement handling did to one outbox event. */
export interface SettlementApplication {
  granted: number;
  revoked: number;
  /**
   * Set when the settlement carried no `sessionId`. A purchase with no session
   * cannot match a session-scoped rule, so a non-zero count here means either
   * the integration passes no `sessionId` at checkout, or sessions are not in
   * use. Both are worth seeing rather than inferring.
   */
  withoutSession: boolean;
}

export interface MonetizationDispatcherOptions {
  store: BillingStore;
  /**
   * Required. Entitlement handling is not optional: a paid purchase that never
   * grants anything is a silent failure, not a configuration choice. Supply the
   * store even if you have no rules yet — an empty rule set is a valid state and
   * is recorded as such.
   */
  entitlements: EntitlementStore;
  ids: IdGenerator;
  /**
   * Your own side effects, for example publishing a settled superchat to the
   * live chat. Runs after entitlement handling, inside the same delivery, so a
   * failure marks the event undelivered and it is retried. Never required.
   */
  onEvent?: (event: BillingOutboxEvent, applied: SettlementApplication) => void | Promise<void>;
  now?: () => Date;
  batchSize?: number;
  /**
   * Delivery attempts before an event is parked for an operator. Defaults to 10.
   *
   * A permanently-failing event would otherwise be re-claimed on every drain
   * forever, and because `claimOutbox` orders by `created_at` it would occupy
   * the first slots of every batch — so a few poison events degrade throughput
   * and eventually stall the queue. Parking bounds that.
   *
   * Parking is not deletion: the row is retained with its payload and error, and
   * `requeueDeadOutbox` replays it once the cause is fixed. Set this to a large
   * number to prefer blocking-and-alerting over parking.
   */
  maxAttempts?: number;
  logger?: (message: string, meta: Record<string, unknown>) => void;
}

export interface DrainResult {
  delivered: number;
  failed: number;
  granted: number;
  revoked: number;
  /** Events parked this pass for an operator. Retained, not dropped. */
  parked: number;
  /** Events already past the attempt budget when claimed; parked without an attempt. */
  exhausted: number;
  /** Settlements that arrived without a `sessionId`. See `SettlementApplication`. */
  withoutSession: number;
}

/**
 * Outbox delivery with entitlement handling already wired in.
 *
 * This exists so that the correct wiring is the shortest path. Constructing a
 * `BillingOutboxDispatcher` directly and pointing its `publish` at
 * `applySettlementEvent` is possible but is the footgun that motivated this class:
 * nothing failed when it was forgotten, entitlements simply never granted.
 *
 * Entitlement handling here is unconditional. `onEvent` is the optional part.
 *
 * Run `drainOnce` on a schedule. A worker that stops is indistinguishable from a
 * quiet platform, so `isStale` is provided for a health check.
 */
export class MonetizationDispatcher {
  private readonly dispatcher: BillingOutboxDispatcher;
  private readonly now: () => Date;
  private readonly logger?: (message: string, meta: Record<string, unknown>) => void;
  private readonly maxAttempts: number;
  private lastDrainAtMs: number | undefined;
  private granted = 0;
  private revoked = 0;
  private withoutSession = 0;
  private parked = 0;
  private exhausted = 0;

  constructor(private readonly options: MonetizationDispatcherOptions) {
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger;
    this.maxAttempts = options.maxAttempts ?? 10;
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new TypeError("maxAttempts must be a positive integer");
    }
    this.dispatcher = new BillingOutboxDispatcher({
      store: options.store,
      batchSize: options.batchSize,
      // An event that is already past its budget is parked before any attempt,
      // so it cannot consume a delivery slot and then fail again.
      publish: async (event) => {
        if (event.attempts > this.maxAttempts) {
          await options.store.markOutboxDead(event.id, `exceeded maxAttempts (${this.maxAttempts})`);
          this.exhausted += 1;
          this.logger?.("outbox event parked: attempts exhausted", {
            eventId: event.id, type: event.type, attempts: event.attempts,
          });
          return;
        }
        const applied = await this.applyToEntitlements(event);
        this.granted += applied.granted;
        this.revoked += applied.revoked;
        if (applied.withoutSession) this.withoutSession += 1;
        if (this.options.onEvent) await this.options.onEvent(event, applied);
        if (applied.withoutSession) {
          this.logger?.("settlement arrived without a sessionId", {
            eventId: event.id, purchaseId: event.payload.purchaseId, type: event.type,
          });
        }
      },
    });
  }

  /** @returns a sentinel so an unparseable payload fails delivery and is retried, not silently skipped. */
  private async applyToEntitlements(event: BillingOutboxEvent): Promise<SettlementApplication> {
    const base = { granted: 0, revoked: 0, withoutSession: false };
    if (event.type !== "billing.purchase_settled"
      && event.type !== "billing.purchase_refunded"
      && event.type !== "billing.purchase_disputed") {
      return base;
    }
    // Surface a malformed payload as a delivery failure rather than letting it
    // pass: an event that cannot be evaluated must be retried and alerted, not
    // marked delivered.
    const withoutSession = event.type === "billing.purchase_settled"
      && readSettlementFacts(event.payload).sessionId === null;
    const result = await applySettlementEvent(
      this.options.entitlements,
      event,
      this.options.ids,
      this.now().toISOString(),
    );
    return { ...base, ...result, withoutSession };
  }

  async drainOnce(): Promise<DrainResult> {
    // Counters are per-drain, not cumulative: a caller reading the result wants
    // what this pass did, not a running total.
    this.granted = 0;
    this.revoked = 0;
    this.withoutSession = 0;
    this.parked = 0;
    this.exhausted = 0;
    const result = await this.dispatcher.drainOnce();
    this.lastDrainAtMs = this.now().getTime();
    if (this.parked > 0 || this.exhausted > 0) {
      this.logger?.("outbox events parked for an operator", {
        parked: this.parked, exhausted: this.exhausted, maxAttempts: this.maxAttempts,
      });
    }
    if (result.failed > 0) {
      this.logger?.("outbox delivery had failures", { failed: result.failed, delivered: result.delivered });
    }
    return {
      delivered: result.delivered,
      failed: result.failed,
      granted: this.granted,
      revoked: this.revoked,
      parked: this.parked,
      exhausted: this.exhausted,
      withoutSession: this.withoutSession,
    };
  }

  /**
   * Returns parked events to the queue with a fresh attempt budget. Call this
   * once the cause is fixed — a corrected rule, a repaired payload, a restored
   * dependency. Without it, parking would be silent data loss.
   */
  async requeueParked(limit = 100): Promise<number> {
    const requeued = await this.options.store.requeueDeadOutbox(limit);
    if (requeued > 0) this.logger?.("requeued parked outbox events", { requeued });
    return requeued;
  }

  /** Parked events awaiting an operator, with the error that parked them. */
  async listParked(limit = 100): Promise<readonly BillingOutboxEvent[]> {
    return this.options.store.listDeadOutbox(limit);
  }

  /** ISO timestamp of the last drain, or undefined if it has never run. */
  lastDrainAt(): string | undefined {
    return this.lastDrainAtMs === undefined ? undefined : new Date(this.lastDrainAtMs).toISOString();
  }

  /**
   * True when the dispatcher has never run, or has not run within `maxAgeMs`
   * (default 10 minutes). A stopped worker and a quiet platform look identical
   * from the outside; this is how they are told apart.
   */
  isStale(maxAgeMs = 10 * 60_000): boolean {
    if (this.lastDrainAtMs === undefined) return true;
    return this.now().getTime() - this.lastDrainAtMs > maxAgeMs;
  }
}
