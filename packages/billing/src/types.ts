import type Stripe from "stripe";

export type ChannelPurchaseKind = "super_chat" | "tip" | "channel_product" | (string & {});
export type PurchaseState = "pending" | "checkout_created" | "settled" | "failed" | "partially_refunded" | "refunded" | "disputed";

export interface ChannelBillingProfile {
  channelId: string;
  ownerId: string;
  stripeCustomerId: string;
  stripeConnectedAccountId: string;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  defaultCurrency: string;
  country?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingCatalogItem {
  key: string;
  purchaseKind: ChannelPurchaseKind;
  name: string;
  unitAmount: number;
  currency: string;
  platformFeeAmount: number;
  stripePriceId?: string;
  refundApplicationFee?: boolean;
}

export interface BillingCatalog {
  resolve(productKey: string): BillingCatalogItem;
}

export interface ChannelPurchase {
  id: string;
  channelId: string;
  buyerId: string;
  buyerStripeCustomerId?: string;
  productKey: string;
  kind: ChannelPurchaseKind;
  amount: number;
  currency: string;
  platformFeeAmount: number;
  state: PurchaseState;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  stripeTransferId?: string;
  stripeApplicationFeeId?: string;
  refundedAmount: number;
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

export interface BillingOutboxEvent {
  id: string;
  type: "billing.purchase_settled" | "billing.purchase_refunded" | "billing.purchase_disputed";
  aggregateId: string;
  payload: Readonly<Record<string, unknown>>;
  createdAt: string;
}

export interface BillingTransaction {
  getPurchase(id: string): Promise<ChannelPurchase | undefined>;
  findPurchaseByStripeReference(reference: string): Promise<ChannelPurchase | undefined>;
  savePurchase(purchase: ChannelPurchase): Promise<void>;
  saveChannelProfile(profile: ChannelBillingProfile): Promise<void>;
  appendLedger(entry: BillingLedgerEntry): Promise<void>;
  appendOutbox(event: BillingOutboxEvent): Promise<void>;
}

export interface BillingStore {
  getChannelProfile(channelId: string): Promise<ChannelBillingProfile | undefined>;
  findChannelProfileByConnectedAccount(accountId: string): Promise<ChannelBillingProfile | undefined>;
  saveChannelProfile(profile: ChannelBillingProfile): Promise<void>;
  createPurchase(purchase: ChannelPurchase): Promise<ChannelPurchase>;
  getPurchase(id: string): Promise<ChannelPurchase | undefined>;
  /** Must atomically claim event.id and commit all callback writes. */
  processStripeEvent(event: Stripe.Event, apply: (transaction: BillingTransaction) => Promise<void>): Promise<"processed" | "duplicate">;
  claimOutbox(limit: number): Promise<readonly BillingOutboxEvent[]>;
  completeOutbox(id: string): Promise<void>;
  failOutbox(id: string, error: string): Promise<void>;
}

export interface IdGenerator { next(): string }

export interface CreateChannelCheckoutInput {
  /** Stable application order id. Reuse it when retrying the same checkout. */
  purchaseId: string;
  channelId: string;
  buyerId: string;
  buyerStripeCustomerId?: string;
  productKey: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateChannelCheckoutResult {
  purchase: ChannelPurchase;
  sessionId: string;
  url: string | null;
}

export interface BillingWebhookResult {
  eventId: string;
  status: "processed" | "duplicate";
}
