import Stripe from "stripe";

import type {
  BillingCatalog, BillingLedgerEntry, BillingOutboxEvent, BillingStore, BillingTransaction,
  BillingWebhookResult, ChannelBillingProfile, ChannelPurchase, CreateChannelCheckoutInput,
  CreateChannelCheckoutResult, IdGenerator,
} from "./types.js";
import { createStripePlatformClient } from "./stripe-platform.js";

export interface PortalsBillingOptions {
  stripe: Stripe;
  store: BillingStore;
  catalog: BillingCatalog;
  ids: IdGenerator;
  now?: () => Date;
  /** Application policy for attempting a Connect transfer reversal after a dispute. */
  reverseTransferForDispute?: (purchase: ChannelPurchase, dispute: Stripe.Dispute) => boolean | Promise<boolean>;
}

export interface EnsureChannelProfileInput {
  channelId: string;
  ownerId: string;
  email?: string;
  country?: string;
  defaultCurrency?: string;
}

export interface RefundPurchaseInput {
  purchaseId: string;
  amount?: number;
  reason?: Stripe.RefundCreateParams.Reason;
}

/** Stripe platform and Connect boundary for every Portals billing operation. */
export class PortalsBilling {
  private readonly now: () => Date;

  constructor(private readonly options: PortalsBillingOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async getChannelProfile(channelId: string): Promise<ChannelBillingProfile | undefined> {
    return this.options.store.getChannelProfile(required(channelId, "channelId"));
  }

  async ensureChannelProfile(input: EnsureChannelProfileInput): Promise<ChannelBillingProfile> {
    const channelId = required(input.channelId, "channelId");
    const ownerId = required(input.ownerId, "ownerId");
    const existing = await this.options.store.getChannelProfile(channelId);
    if (existing) {
      if (existing.ownerId !== ownerId) throw new Error("Channel billing owner mismatch");
      return existing;
    }
    const metadata = { channelId, ownerId };
    const customer = await this.options.stripe.customers.create({
      ...(input.email ? { email: input.email } : {}), metadata,
    }, { idempotencyKey: `channel-customer:${channelId}` });
    const account = await this.options.stripe.accounts.create({
      type: "express",
      ...(input.country ? { country: input.country } : {}),
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata,
    }, { idempotencyKey: `channel-connect:${channelId}` });
    const timestamp = this.now().toISOString();
    const profile: ChannelBillingProfile = {
      channelId, ownerId, stripeCustomerId: customer.id, stripeConnectedAccountId: account.id,
      onboardingComplete: account.details_submitted ?? false,
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      defaultCurrency: normalizeCurrency(input.defaultCurrency ?? account.default_currency ?? "usd"),
      ...(account.country ? { country: account.country } : {}),
      createdAt: timestamp, updatedAt: timestamp,
    };
    await this.options.store.saveChannelProfile(profile);
    return profile;
  }

  async createConnectOnboardingLink(channelId: string, refreshUrl: string, returnUrl: string): Promise<Stripe.AccountLink> {
    const profile = await this.requireReadyProfile(channelId, false);
    return this.options.stripe.accountLinks.create({
      account: profile.stripeConnectedAccountId,
      refresh_url: validHttpUrl(refreshUrl, "refreshUrl"),
      return_url: validHttpUrl(returnUrl, "returnUrl"),
      type: "account_onboarding",
    });
  }

  async createConnectDashboardLink(channelId: string): Promise<Stripe.LoginLink> {
    const profile = await this.requireReadyProfile(channelId, false);
    return this.options.stripe.accounts.createLoginLink(profile.stripeConnectedAccountId);
  }

  async createCustomerPortalSession(channelId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session> {
    const profile = await this.requireReadyProfile(channelId, false);
    return this.options.stripe.billingPortal.sessions.create({
      customer: profile.stripeCustomerId,
      return_url: validHttpUrl(returnUrl, "returnUrl"),
    });
  }

  async createChannelCheckout(input: CreateChannelCheckoutInput): Promise<CreateChannelCheckoutResult> {
    const profile = await this.requireReadyProfile(input.channelId, true);
    const item = normalizeCatalogItem(this.options.catalog.resolve(required(input.productKey, "productKey")));
    const purchaseId = required(input.purchaseId, "purchaseId");
    const buyerId = required(input.buyerId, "buyerId");
    const existing = await this.options.store.getPurchase(purchaseId);
    if (existing) {
      assertSamePurchase(existing, profile.channelId, buyerId, item);
      if (existing.stripeCheckoutSessionId) {
        const session = await this.options.stripe.checkout.sessions.retrieve(existing.stripeCheckoutSessionId);
        return { purchase: existing, sessionId: session.id, url: session.url };
      }
    }
    const now = this.now().toISOString();
    const purchase: ChannelPurchase = existing ?? {
      id: purchaseId, channelId: profile.channelId, buyerId,
      ...(input.buyerStripeCustomerId ? { buyerStripeCustomerId: required(input.buyerStripeCustomerId, "buyerStripeCustomerId") } : {}),
      productKey: item.key, kind: item.purchaseKind, amount: item.unitAmount, currency: item.currency,
      platformFeeAmount: item.platformFeeAmount, state: "pending", refundedAmount: 0,
      createdAt: now, updatedAt: now,
    };
    await this.options.store.createPurchase(purchase);
    const metadata = { purchaseId: purchase.id, channelId: purchase.channelId, purchaseKind: purchase.kind, schemaVersion: "1" };
    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = item.stripePriceId
      ? { price: item.stripePriceId, quantity: 1 }
      : { price_data: { currency: item.currency, unit_amount: item.unitAmount, product_data: { name: item.name } }, quantity: 1 };
    const session = await this.options.stripe.checkout.sessions.create({
      mode: "payment",
      ...(purchase.buyerStripeCustomerId ? { customer: purchase.buyerStripeCustomerId } : {}),
      line_items: [lineItem],
      success_url: validHttpUrl(input.successUrl, "successUrl"),
      cancel_url: validHttpUrl(input.cancelUrl, "cancelUrl"),
      client_reference_id: purchase.id,
      metadata,
      payment_intent_data: {
        metadata,
        transfer_data: { destination: profile.stripeConnectedAccountId },
        ...(item.platformFeeAmount > 0 ? { application_fee_amount: item.platformFeeAmount } : {}),
      },
    }, { idempotencyKey: `channel-checkout:${purchase.id}` });
    const updated = { ...purchase, state: "checkout_created" as const, stripeCheckoutSessionId: session.id, updatedAt: this.now().toISOString() };
    // createPurchase implementations must be idempotent upserts for the same purchase id.
    await this.options.store.createPurchase(updated);
    return { purchase: updated, sessionId: session.id, url: session.url };
  }

  async reportMeterEvent(channelId: string, eventName: string, value: number, identifier: string): Promise<void> {
    const profile = await this.requireReadyProfile(channelId, false);
    if (!Number.isFinite(value) || value < 0) throw new TypeError("meter value must be non-negative");
    await this.options.stripe.billing.meterEvents.create({
      event_name: required(eventName, "eventName"),
      identifier: required(identifier, "identifier"),
      payload: { stripe_customer_id: profile.stripeCustomerId, value: String(value) },
    });
  }

  async refundPurchase(input: RefundPurchaseInput): Promise<Stripe.Refund> {
    const purchase = await this.options.store.getPurchase(required(input.purchaseId, "purchaseId"));
    if (!purchase?.stripePaymentIntentId) throw new Error("Settled purchase with PaymentIntent is required");
    const remaining = purchase.amount - purchase.refundedAmount;
    const amount = input.amount ?? remaining;
    if (!Number.isInteger(amount) || amount < 1 || amount > remaining) throw new TypeError("refund amount exceeds refundable amount");
    const item = normalizeCatalogItem(this.options.catalog.resolve(purchase.productKey));
    return this.options.stripe.refunds.create({
      payment_intent: purchase.stripePaymentIntentId,
      amount,
      reverse_transfer: true,
      refund_application_fee: item.refundApplicationFee ?? true,
      ...(input.reason ? { reason: input.reason } : {}),
      metadata: { purchaseId: purchase.id, channelId: purchase.channelId },
    }, { idempotencyKey: `channel-refund:${purchase.id}:${purchase.refundedAmount}:${amount}` });
  }

  async handleWebhook(rawBody: string | Buffer, signature: string, secret: string): Promise<BillingWebhookResult> {
    const event = this.options.stripe.webhooks.constructEvent(rawBody, required(signature, "signature"), required(secret, "webhook secret"));
    const status = await this.options.store.processStripeEvent(event, async (transaction) => this.applyEvent(transaction, event));
    return { eventId: event.id, status };
  }

  private async applyEvent(transaction: BillingTransaction, event: Stripe.Event): Promise<void> {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid") return;
      const purchaseId = session.metadata?.purchaseId ?? session.client_reference_id;
      if (!purchaseId) return;
      const purchase = await transaction.getPurchase(purchaseId);
      if (!purchase || purchase.state === "settled") return;
      const paymentIntentId = stripeId(session.payment_intent);
      let chargeId: string | undefined;
      let transferId: string | undefined;
      let applicationFeeId: string | undefined;
      let stripeFee: number | undefined;
      let net: number | undefined;
      if (paymentIntentId) {
        const intent = await this.options.stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction", "latest_charge.transfer", "latest_charge.application_fee"] });
        const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : undefined;
        chargeId = charge?.id;
        transferId = stripeId(charge?.transfer);
        applicationFeeId = stripeId(charge?.application_fee);
        const balance = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : undefined;
        stripeFee = balance?.fee;
        net = balance?.net;
      }
      const updated: ChannelPurchase = {
        ...purchase, state: "settled", stripeCheckoutSessionId: session.id,
        ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
        ...(chargeId ? { stripeChargeId: chargeId } : {}),
        ...(transferId ? { stripeTransferId: transferId } : {}),
        ...(applicationFeeId ? { stripeApplicationFeeId: applicationFeeId } : {}),
        updatedAt: this.now().toISOString(),
      };
      await transaction.savePurchase(updated);
      await transaction.appendLedger(this.ledger(event, updated, "settlement", updated.amount, stripeFee, net));
      await transaction.appendOutbox(this.outbox(updated, "billing.purchase_settled"));
      return;
    }
    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const id = session.metadata?.purchaseId ?? session.client_reference_id;
      if (!id) return;
      const purchase = await transaction.getPurchase(id);
      if (purchase && purchase.state !== "settled") await transaction.savePurchase({ ...purchase, state: "failed", updatedAt: this.now().toISOString() });
      return;
    }
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const purchase = await this.findPurchaseForCharge(transaction, charge);
      if (!purchase) return;
      const refundedAmount = Math.min(purchase.amount, charge.amount_refunded);
      const refundDelta = Math.max(0, refundedAmount - purchase.refundedAmount);
      if (refundDelta === 0) return;
      const updated = {
        ...purchase,
        refundedAmount,
        stripeChargeId: charge.id,
        ...(stripeId(charge.payment_intent) ? { stripePaymentIntentId: stripeId(charge.payment_intent) } : {}),
        ...(stripeId(charge.transfer) ? { stripeTransferId: stripeId(charge.transfer) } : {}),
        ...(stripeId(charge.application_fee) ? { stripeApplicationFeeId: stripeId(charge.application_fee) } : {}),
        state: refundedAmount >= purchase.amount ? "refunded" as const : "partially_refunded" as const,
        updatedAt: this.now().toISOString(),
      };
      await transaction.savePurchase(updated);
      await transaction.appendLedger(this.ledger(event, updated, "refund", refundDelta));
      await transaction.appendOutbox(this.outbox(updated, "billing.purchase_refunded"));
      return;
    }
    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;
      const charge = typeof dispute.charge === "object"
        ? dispute.charge
        : await this.options.stripe.charges.retrieve(dispute.charge);
      const purchase = await this.findPurchaseForCharge(transaction, charge);
      if (!purchase) return;
      const updated = { ...purchase, state: "disputed" as const, updatedAt: this.now().toISOString() };
      await transaction.savePurchase(updated);
      await transaction.appendLedger(this.ledger(event, updated, "dispute", dispute.amount));
      if (
        updated.stripeTransferId
        && await this.options.reverseTransferForDispute?.(updated, dispute)
      ) {
        const amount = Math.min(dispute.amount, Math.max(0, updated.amount - updated.refundedAmount));
        if (amount > 0) {
          const reversal = await this.options.stripe.transfers.createReversal(
            updated.stripeTransferId,
            { amount, metadata: { purchaseId: updated.id, disputeId: dispute.id } },
            { idempotencyKey: `channel-dispute-reversal:${updated.id}:${dispute.id}` },
          );
          const entry = this.ledger(event, updated, "transfer_reversal", amount);
          entry.metadata = { stripeTransferReversalId: reversal.id, stripeDisputeId: dispute.id };
          await transaction.appendLedger(entry);
        }
      }
      await transaction.appendOutbox(this.outbox(updated, "billing.purchase_disputed"));
      return;
    }
    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      const profile = await this.options.store.findChannelProfileByConnectedAccount(account.id);
      if (profile) await transaction.saveChannelProfile({
        ...profile, onboardingComplete: account.details_submitted ?? false,
        chargesEnabled: account.charges_enabled ?? false, payoutsEnabled: account.payouts_enabled ?? false,
        updatedAt: this.now().toISOString(),
      });
    }
  }

  private ledger(event: Stripe.Event, purchase: ChannelPurchase, kind: BillingLedgerEntry["kind"], amount: number, stripeFee?: number, net?: number): BillingLedgerEntry {
    return { id: this.options.ids.next(), purchaseId: purchase.id, stripeEventId: event.id, kind, amount, currency: purchase.currency, ...(stripeFee === undefined ? {} : { stripeFee }), ...(net === undefined ? {} : { net }), createdAt: this.now().toISOString() };
  }

  private async findPurchaseForCharge(
    transaction: BillingTransaction,
    charge: Stripe.Charge,
  ): Promise<ChannelPurchase | undefined> {
    const byReference = await transaction.findPurchaseByStripeReference(charge.id);
    if (byReference) return byReference;
    const purchaseId = charge.metadata?.purchaseId;
    return purchaseId ? transaction.getPurchase(purchaseId) : undefined;
  }

  private outbox(purchase: ChannelPurchase, type: BillingOutboxEvent["type"]): BillingOutboxEvent {
    return { id: this.options.ids.next(), type, aggregateId: purchase.id, payload: { purchaseId: purchase.id, channelId: purchase.channelId, buyerId: purchase.buyerId, kind: purchase.kind, amount: purchase.amount, refundedAmount: purchase.refundedAmount, currency: purchase.currency, state: purchase.state }, createdAt: this.now().toISOString() };
  }

  private async requireReadyProfile(channelId: string, requirePayouts: boolean): Promise<ChannelBillingProfile> {
    const profile = await this.options.store.getChannelProfile(required(channelId, "channelId"));
    if (!profile) throw new Error("Channel billing profile not found");
    if (requirePayouts && (!profile.onboardingComplete || !profile.chargesEnabled || !profile.payoutsEnabled)) throw new Error("Channel owner is not ready to receive purchases");
    return profile;
  }
}

function normalizeCatalogItem<T extends { key: string; name: string; unitAmount: number; platformFeeAmount: number; currency: string }>(item: T): T {
  required(item.key, "catalog key"); required(item.name, "catalog name");
  if (!Number.isInteger(item.unitAmount) || item.unitAmount < 1) throw new TypeError("unitAmount must be a positive integer");
  if (!Number.isInteger(item.platformFeeAmount) || item.platformFeeAmount < 0 || item.platformFeeAmount > item.unitAmount) throw new TypeError("platformFeeAmount is invalid");
  item.currency = normalizeCurrency(item.currency);
  return item;
}

function required(value: string, name: string): string { const normalized = value.trim(); if (!normalized) throw new TypeError(`${name} is required`); return normalized; }
function normalizeCurrency(value: string): string { const currency = value.trim().toLowerCase(); if (!/^[a-z]{3}$/.test(currency)) throw new TypeError("currency must be a three-letter ISO code"); return currency; }
function validHttpUrl(value: string, name: string): string { const url = new URL(value); if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new TypeError(`${name} must be an http(s) URL without credentials`); return url.toString(); }
function stripeId(value: string | { id: string } | null | undefined): string | undefined { return typeof value === "string" ? value : value?.id; }

function assertSamePurchase(
  purchase: ChannelPurchase,
  channelId: string,
  buyerId: string,
  item: ReturnType<BillingCatalog["resolve"]>,
): void {
  if (
    purchase.channelId !== channelId || purchase.buyerId !== buyerId || purchase.productKey !== item.key
    || purchase.amount !== item.unitAmount || purchase.currency !== item.currency
    || purchase.platformFeeAmount !== item.platformFeeAmount
  ) {
    throw new Error("purchaseId is already associated with a different purchase");
  }
}
