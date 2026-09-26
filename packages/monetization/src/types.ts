import type Stripe from "stripe";

export type PurchaseKind = "super_chat" | "tip" | "channel_product" | (string & {});
export type PurchaseState = "pending" | "checkout_created" | "settled" | "failed" | "partially_refunded" | "refunded" | "disputed";

/**
 * v2 capability status for the tenant's recipient configuration. Read from
 * `account.configuration.recipient.capabilities.stripe_balance.stripe_transfers.status`.
 * The v1 fields `payouts_enabled` / `charges_enabled` are deprecated and unused.
 */
export type TransfersStatus = "active" | "inactive" | "pending";

/**
 * One Connect account per tenant, created via Accounts v2 as a **recipient**
 * for destination charges.
 *
 * The end user's `Customer` and payment method live on the **platform** account,
 * not the tenant's. A consumer provides payment details once and the same
 * payment method is reused for every tenant they pay, which is the reason
 * destination charges are used rather than direct charges. Funds transfer to the
 * tenant on payment success; `application_fee_amount` is the platform's rake.
 *
 * `losses_collector: "application"` is required here — it is what makes dispute
 * transfer reversals possible — so the platform is merchant of record and
 * carries negative-balance and dispute liability across tenant volume.
 */
export interface TenantBillingProfile {
  tenantId: string;
  ownerId: string;
  /** The tenant's connected account, the destination for transfers. */
  stripeAccountId: string;
  transfersStatus: TransfersStatus;
  defaultCurrency: string;
  country?: string;
  createdAt: string;
  updatedAt: string;
}



/**
 * Something a tenant sells.
 *
 * Named `Product` rather than `BillingCatalogItem` because it is the tenant's
 * product, not a billing implementation detail: the catalog is just where the
 * platform looks it up by key. `key` is the tenant-local identifier the buyer
 * and the purchase record refer to; it need not be globally unique.
 */
export interface Product {
  /** Tenant-local identifier. What `CreateCheckoutInput.productKey` names. */
  key: string;
  purchaseKind: PurchaseKind;
  name: string;
  /**
   * Tenant-authored copy for this product, e.g. what the buyer gets. Carried so
   * a catalog can be rendered to a buyer without a second parallel map. The
   * platform does not interpret it.
   */
  description?: string;
  unitAmount: number;
  currency: string;
  /**
   * Rake withheld via `application_fee_amount`. On direct charges the tenant
   * creates the charge, so it chooses this value; `verifySettlement` checks
   * what Stripe actually recorded before anything is granted or settled.
   */
  platformFeeAmount: number;
  stripePriceId?: string;
  refundApplicationFee?: boolean;
}

/** Where the platform looks up the tenant's products by key. */
export interface BillingCatalog {
  resolve(productKey: string): Product;
}

/**
 * @deprecated Use {@link Product}. Retained so existing catalogs keep compiling.
 */
export type BillingCatalogItem = Product;

/**
 * One audience payment. `tenantId` decides where the money goes; `channelId`
 * is attribution only. Both are kept because a tenant's revenue rollup is
 * reported per channel but paid per tenant.
 */
export interface Purchase {
  id: string;
  tenantId: string;
  channelId: string;
  /** Fact for session-scoped entitlement rules. Absent when the purchase did not occur in a session. */
  sessionId?: string;
  /** The end user who paid. Distinct from `tenantId`, which receives the money. */
  buyerId: string;
  /**
   * The platform-account `Customer` for this end user. Customers and payment
   * methods live on the platform, not per tenant, so one payment method is
   * reused across every tenant this consumer pays.
   */
  customerId?: string;
  productKey: string;
  kind: PurchaseKind;
  amount: number;
  currency: string;
  platformFeeAmount: number;
  state: PurchaseState;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  /** The Connect transfer to the tenant. Reversed on dispute, per Connect's model. */
  stripeTransferId?: string;
  stripeApplicationFeeId?: string;
  refundedAmount: number;
  /** Set when the purchase reaches `settled`. Fact for date-scoped entitlement rules. */
  settledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingLedgerEntry {
  id: string;
  purchaseId: string;
  stripeEventId?: string;
  kind: "settlement" | "refund" | "dispute" | "transfer_reversal";
  amount: number;
  currency: string;
  stripeFee?: number;
  net?: number;
  metadata?: Readonly<Record<string, string>>;
  createdAt: string;
}

export type BillingOutboxEventType =
  | "billing.purchase_settled"
  | "billing.purchase_refunded"
  | "billing.purchase_disputed";

export interface BillingOutboxEvent {
  id: string;
  type: BillingOutboxEventType;
  aggregateId: string;
  payload: Readonly<Record<string, unknown>>;
  createdAt: string;
  /** How many times this event has been claimed for delivery. */
  attempts: number;
  /** Why the last delivery attempt failed, truncated by the store. */
  lastError?: string;
  /** Set when the event exceeded its attempt budget and was parked for an operator. */
  deadAt?: string;
}

/** Every fact an outbox payload must carry for entitlement rules to be evaluable. */
export interface PurchaseSettledFacts {
  purchaseId: string;
  tenantId: string;
  channelId: string;
  sessionId: string | null;
  buyerId: string;
  kind: string;
  productKey: string;
  amount: number;
  currency: string;
  settledAt: string;
}

export interface BillingTransaction {
  getPurchase(id: string): Promise<Purchase | undefined>;
  findPurchaseByStripeReference(reference: string): Promise<Purchase | undefined>;
  savePurchase(purchase: Purchase): Promise<void>;
  saveTenantProfile(profile: TenantBillingProfile): Promise<void>;
  appendLedger(entry: BillingLedgerEntry): Promise<void>;
  appendOutbox(event: BillingOutboxEvent): Promise<void>;
}

export interface BillingStore {
  /**
   * Returns this consumer's platform-held Customer id, or undefined if they have
   * never checked out. Consumers are platform-scoped, not tenant-scoped.
   */
  getBillingCustomer(buyerId: string): Promise<string | undefined>;
  /** Records the Customer created for a consumer. Idempotent per buyer. */
  saveBillingCustomer(buyerId: string, stripeCustomerId: string, createdAt: string): Promise<void>;
  getTenantProfile(tenantId: string): Promise<TenantBillingProfile | undefined>;
  findTenantProfileByAccount(accountId: string): Promise<TenantBillingProfile | undefined>;
  saveTenantProfile(profile: TenantBillingProfile): Promise<void>;
  createPurchase(purchase: Purchase): Promise<Purchase>;
  getPurchase(id: string): Promise<Purchase | undefined>;
  /**
   * Resolves a purchase by any recorded Stripe reference (checkout session,
   * payment intent, charge, or transfer). Available on the store as well as the
   * transaction because work that must happen outside a webhook transaction —
   * such as reversing a Connect transfer — still needs to find its purchase.
   */
  findPurchaseByStripeReference(reference: string): Promise<Purchase | undefined>;
  /** Must atomically claim event.id and commit all callback writes. */
  processStripeEvent(event: Stripe.Event, apply: (transaction: BillingTransaction) => Promise<void>): Promise<"processed" | "duplicate">;
  /** Claims pending events. Dead events are never claimed. */
  claimOutbox(limit: number): Promise<readonly BillingOutboxEvent[]>;
  completeOutbox(id: string): Promise<void>;
  failOutbox(id: string, error: string): Promise<void>;
  /**
   * Parks an event that exceeded its attempt budget. The row is **retained**
   * with its payload and error so nothing is lost: a customer who paid still has
   * a settlement event on record, and it can be replayed.
   */
  markOutboxDead(id: string, error: string): Promise<void>;
  /** Dead events awaiting attention, newest last. For an operator view. */
  listDeadOutbox(limit: number): Promise<readonly BillingOutboxEvent[]>;
  /**
   * Returns dead events to the pending queue with a fresh attempt budget. This
   * is how a fixed rule or a repaired payload is replayed rather than lost.
   */
  requeueDeadOutbox(limit: number): Promise<number>;
}

export interface IdGenerator { next(): string }

export interface CreateCheckoutInput {
  /** Stable application order id. Reuse it when retrying the same checkout. */
  purchaseId: string;
  tenantId: string;
  channelId: string;
  sessionId?: string;
  buyerId: string;
  /**
   * The platform-account `Customer` holding this end user's saved payment
   * method. Omit to let Stripe create one for the session; supply it to reuse
   * payment details the consumer already provided for another tenant.
   */
  customerId?: string;
  productKey: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutResult {
  purchase: Purchase;
  sessionId: string;
  url: string | null;
}

export interface BillingWebhookResult {
  eventId: string;
  status: "processed" | "duplicate";
}
