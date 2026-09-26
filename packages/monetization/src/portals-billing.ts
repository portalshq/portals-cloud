import Stripe from "stripe";

import type {
  BillingCatalog, BillingLedgerEntry, BillingOutboxEvent, BillingOutboxEventType, BillingStore,
  BillingTransaction, BillingWebhookResult, CreateCheckoutInput, CreateCheckoutResult, IdGenerator,
  Purchase, PurchaseSettledFacts, TenantBillingProfile, TransfersStatus,
} from "./types.js";
import { createStripePlatformClient } from "./stripe-client.js";

export interface MonetizationOptions {
  /**
   * The platform's Stripe credential. It creates charges on the platform account
   * and transfers them to tenant accounts, so it is a charge-capable key and
   * must be a restricted key scoped to exactly the endpoints used.
   *
   * The end user's `Customer` and payment method also live on this account,
   * which is what lets one payment method be reused across every tenant.
   */
  stripe: Stripe;
  store: BillingStore;
  catalog: BillingCatalog;
  ids: IdGenerator;
  now?: () => Date;
  /**
   * Application policy for reversing a Connect transfer after a dispute. Only
   * invoked when the charge actually produced a transfer, and the reversal uses
   * a stable idempotency key so a retry cannot double-reverse.
   */
  reverseTransferForDispute?: (purchase: Purchase, dispute: Stripe.Dispute) => boolean | Promise<boolean>;
}

export interface EnsureTenantProfileInput {
  tenantId: string;
  ownerId: string;
  email?: string;
  country?: string;
  defaultCurrency?: string;
  displayName?: string;
}

export interface RefundPurchaseInput {
  purchaseId: string;
  tenantId: string;
  amount?: number;
  reason?: Stripe.RefundCreateParams.Reason;
}

/** Outcome of checking what Stripe actually recorded against the expected catalog. */
export type SettlementVerification =
  | { ok: true }
  | { ok: false; reason: "fee_mismatch" | "amount_mismatch"; expected: number; actual: number };

/**
 * Direct-charge checkout and Connect management.
 *
 * The tenant is merchant of record: charges are created on the tenant's own
 * account, so the caller supplies a Stripe credential scoped to that account and
 * the platform never holds a key that can move tenant money. The platform's own
 * credential is limited to Connect management.
 */
export class Monetization {
  private readonly now: () => Date;

  constructor(private readonly options: MonetizationOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async getTenantProfile(tenantId: string): Promise<TenantBillingProfile | undefined> {
    return this.options.store.getTenantProfile(required(tenantId, "tenantId"));
  }

  /**
   * Creates the tenant's connected account via **Accounts v2**
   * (`stripe.v2.core.accounts`), configured as a recipient for destination charges.
   *
   * The v1 `stripe.accounts.create({ type: "express" })` form is deprecated and
   * is not used. `losses_collector: "application"` is required for destination
   * charges: the platform must hold the negative balance so a dispute transfer
   * can be reversed. The cost is that the platform carries dispute liability.
   */
  async ensureTenantProfile(input: EnsureTenantProfileInput): Promise<TenantBillingProfile> {
    const tenantId = required(input.tenantId, "tenantId");
    const ownerId = required(input.ownerId, "ownerId");
    const existing = await this.options.store.getTenantProfile(tenantId);
    if (existing) {
      if (existing.ownerId !== ownerId) throw new Error("Tenant billing owner mismatch");
      return existing;
    }
    const metadata = { tenantId, ownerId };
    const account = await this.options.stripe.v2.core.accounts.create({
      ...(input.displayName ? { display_name: input.displayName } : {}),
      ...(input.email ? { contact_email: input.email } : {}),
      metadata,
      dashboard: "express",
      // Recipient configuration receives the destination-charge transfer.
      // `stripe_transfers` on `stripe_balance` must be requested explicitly —
      // without it the capability never activates and every checkout is refused.
      // `configuration.merchant` is deliberately not requested: the tenant is
      // not merchant of record and does not accept direct charges.
      configuration: {
        recipient: {
          capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
        },
      },
      defaults: {
        ...(input.defaultCurrency ? { currency: normalizeCurrency(input.defaultCurrency) } : {}),
        // Required for destination charges: the platform must hold the negative
        // balance so a dispute transfer can be reversed. The cost of this model
        // is that the platform carries dispute liability across tenant volume.
        responsibilities: { fees_collector: "application", losses_collector: "application" },
      },
    }, { idempotencyKey: `tenant-account:${tenantId}` });

    const timestamp = this.now().toISOString();
    const profile: TenantBillingProfile = {
      tenantId, ownerId, stripeAccountId: account.id,
      transfersStatus: readTransfersStatus(account),
      defaultCurrency: input.defaultCurrency ? normalizeCurrency(input.defaultCurrency) : "usd",
      ...(input.country ? { country: input.country } : {}),
      createdAt: timestamp, updatedAt: timestamp,
    };
    await this.options.store.saveTenantProfile(profile);
    return profile;
  }

  /** Reads the v2 capability path. Never reads the deprecated v1 boolean fields. */
  async refreshTenantCapabilities(tenantId: string): Promise<TenantBillingProfile> {
    const profile = await this.requireReadyProfile(tenantId, false);
    const account = await this.options.stripe.v2.core.accounts.retrieve(profile.stripeAccountId);
    const updated: TenantBillingProfile = {
      ...profile,
      transfersStatus: readTransfersStatus(account),
      updatedAt: this.now().toISOString(),
    };
    await this.options.store.saveTenantProfile(updated);
    return updated;
  }

  async createConnectOnboardingLink(tenantId: string, refreshUrl: string, returnUrl: string): Promise<{ url: string }> {
    const profile = await this.requireReadyProfile(tenantId, false);
    const accountLink = await this.options.stripe.v2.core.accountLinks.create({
      account: profile.stripeAccountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["merchant"],
          refresh_url: validHttpUrl(refreshUrl, "refreshUrl"),
          return_url: validHttpUrl(returnUrl, "returnUrl"),
        },
      },
    });
    return { url: accountLink.url };
  }

  private async tenantClient(): Promise<Stripe> {
    return this.options.stripe;
  }

  /**
   * Creates a destination-charge Checkout Session on the **platform** account,
   * transferring to the tenant's connected account on success.
   *
   * `customerId` is the end user's platform-account `Customer`. Supply it to
   * reuse payment details already saved for another tenant; omit it and Stripe
   * creates a Customer for this session only. This is the mechanism behind
   * "provide payment once, use on any tenant" — a `PaymentMethod` cannot move
   * between connected accounts, so the Customer has to live on the platform.
   *
   * `application_fee_amount` comes from the server-side catalog;
   * `CreateCheckoutInput` has no fee field, so no caller can influence it.
   *
   * `integration_identifier` labels the session in the Dashboard for tracking
   * and comparing checkout flows.
   */
  /**
   * The platform-account `Customer` for this consumer, creating it on first use.
   *
   * Because the platform holds the customer rather than each tenant, one saved
   * payment method pays for purchases across every tenant the consumer buys
   * from. A duplicate is possible if two requests race before either commits, in
   * which case the last write wins and the superseded Customer is orphaned in
   * Stripe; that is a rare, harmless leak rather than a wrong charge, so it is
   * not worth a lock.
   */
  async ensureBillingCustomer(buyerId: string): Promise<{ id: string }> {
    const existing = await this.options.store.getBillingCustomer(buyerId);
    if (existing) return { id: existing };
    const customer = await this.options.stripe.customers.create({
      metadata: { buyerId },
    });
    await this.options.store.saveBillingCustomer(buyerId, customer.id, this.now().toISOString());
    return { id: customer.id };
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const profile = await this.requireReadyProfile(input.tenantId, true);
    const item = normalizeCatalogItem(this.options.catalog.resolve(required(input.productKey, "productKey")));
    const purchaseId = required(input.purchaseId, "purchaseId");
    const buyerId = required(input.buyerId, "buyerId");
    const channelId = required(input.channelId, "channelId");
    const stripe = await this.tenantClient();
    const existing = await this.options.store.getPurchase(purchaseId);
    if (existing) {
      assertSamePurchase(existing, input.tenantId, channelId, buyerId, item);
      if (existing.stripeCheckoutSessionId) {
        const session = await stripe.checkout.sessions.retrieve(existing.stripeCheckoutSessionId);
        return { purchase: existing, sessionId: session.id, url: session.url };
      }
    }
    const now = this.now().toISOString();
    const purchase: Purchase = existing ?? {
      id: purchaseId, tenantId: profile.tenantId, channelId,
      ...(input.sessionId ? { sessionId: required(input.sessionId, "sessionId") } : {}),
      buyerId,
      ...(input.customerId ? { customerId: required(input.customerId, "customerId") } : {}),
      productKey: item.key, kind: item.purchaseKind, amount: item.unitAmount, currency: item.currency,
      platformFeeAmount: item.platformFeeAmount, state: "pending", refundedAmount: 0,
      createdAt: now, updatedAt: now,
    };
    await this.options.store.createPurchase(purchase);
    const metadata = { purchaseId: purchase.id, tenantId: purchase.tenantId, channelId: purchase.channelId, purchaseKind: purchase.kind, schemaVersion: "3" };
    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = item.stripePriceId
      ? { price: item.stripePriceId, quantity: 1 }
      : { price_data: { currency: item.currency, unit_amount: item.unitAmount, product_data: { name: item.name } }, quantity: 1 };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // The end user's Customer lives on the platform account, so a saved
      // payment method is reusable across every tenant they pay.
      ...(input.customerId ? { customer: required(input.customerId, "customerId") } : {}),
      line_items: [lineItem],
      success_url: validHttpUrl(input.successUrl, "successUrl"),
      cancel_url: validHttpUrl(input.cancelUrl, "cancelUrl"),
      client_reference_id: purchase.id,
      metadata,
      integration_identifier: `portalshq-monetization-${randomSuffix()}`,
      payment_intent_data: {
        metadata,
        // Destination charge: funds move to the tenant automatically on
        // success. The fee is read from the server-side catalog, and
        // `CreateCheckoutInput` has no fee field, so no caller can influence it.
        transfer_data: { destination: profile.stripeAccountId },
        ...(item.platformFeeAmount > 0 ? { application_fee_amount: item.platformFeeAmount } : {}),
      },
    }, { idempotencyKey: `checkout:${purchase.id}` });
    const updated: Purchase = { ...purchase, state: "checkout_created", stripeCheckoutSessionId: session.id, updatedAt: this.now().toISOString() };
    // createPurchase implementations must be idempotent upserts for the same purchase id.
    await this.options.store.createPurchase(updated);
    return { purchase: updated, sessionId: session.id, url: session.url };
  }

  async reportMeterEvent(tenantId: string, customerId: string, eventName: string, value: number, identifier: string): Promise<void> {
    const profile = await this.requireReadyProfile(tenantId, false);
    const stripe = await this.tenantClient();
    if (!Number.isFinite(value) || value < 0) throw new TypeError("meter value must be non-negative");
    await stripe.billing.meterEvents.create({
      event_name: required(eventName, "eventName"),
      identifier: required(identifier, "identifier"),
      payload: { stripe_customer_id: required(customerId, "customerId"), value: String(value) },
    });
  }

  /** Customer and portal session both live on the tenant's account. */
  async createCustomerPortalSession(tenantId: string, customerId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session> {
    const profile = await this.requireReadyProfile(tenantId, false);
    const stripe = await this.tenantClient();
    return stripe.billingPortal.sessions.create({
      customer: required(customerId, "customerId"),
      return_url: validHttpUrl(returnUrl, "returnUrl"),
    });
  }

  /**
   * Checks what Stripe actually recorded against the server-side catalog.
   *
   * The platform sets the fee, so this is defense in depth rather than the
   * primary control: it catches a misconfigured catalog, a replayed session, or
   * a manually created charge. Call it before granting entitlements or paying
   * out.
   */
  async verifySettlement(purchaseId: string, actualAmount: number, actualFeeAmount: number | null): Promise<SettlementVerification> {
    const purchase = await this.options.store.getPurchase(required(purchaseId, "purchaseId"));
    if (!purchase) return { ok: false, reason: "amount_mismatch", expected: 0, actual: actualAmount };
    if (actualAmount !== purchase.amount) {
      return { ok: false, reason: "amount_mismatch", expected: purchase.amount, actual: actualAmount };
    }
    const actualFee = actualFeeAmount ?? 0;
    if (actualFee !== purchase.platformFeeAmount) {
      return { ok: false, reason: "fee_mismatch", expected: purchase.platformFeeAmount, actual: actualFee };
    }
    return { ok: true };
  }

  async refundPurchase(input: RefundPurchaseInput): Promise<Stripe.Refund> {
    const profile = await this.requireReadyProfile(required(input.tenantId, "tenantId"), false);
    const stripe = await this.tenantClient();
    const purchase = await this.options.store.getPurchase(required(input.purchaseId, "purchaseId"));
    if (!purchase?.stripePaymentIntentId) throw new Error("Settled purchase with PaymentIntent is required");
    const remaining = purchase.amount - purchase.refundedAmount;
    const amount = input.amount ?? remaining;
    if (!Number.isInteger(amount) || amount < 1 || amount > remaining) throw new TypeError("refund amount exceeds refundable amount");
    const item = normalizeCatalogItem(this.options.catalog.resolve(purchase.productKey));
    return stripe.refunds.create({
      payment_intent: purchase.stripePaymentIntentId,
      amount,
      reverse_transfer: true,
      refund_application_fee: item.refundApplicationFee ?? true,
      ...(input.reason ? { reason: input.reason } : {}),
      metadata: { purchaseId: purchase.id, tenantId: purchase.tenantId, channelId: purchase.channelId },
    }, { idempotencyKey: `refund:${purchase.id}:${purchase.refundedAmount}:${amount}` });
  }

  async handleWebhook(rawBody: string | Buffer, signature: string, secret: string): Promise<BillingWebhookResult> {
    const event = this.options.stripe.webhooks.constructEvent(rawBody, required(signature, "signature"), required(secret, "webhook secret"));
    // A Connect transfer reversal moves money, so it must not run inside the
    // database transaction. Doing it first, under a stable idempotency key,
    // means a retry after a failed commit re-issues the same key and Stripe
    // returns the original reversal instead of clawing back the funds twice.
    const reversal = event.type === "charge.dispute.created" ? await this.maybeReverseTransfer(event) : undefined;
    const status = await this.options.store.processStripeEvent(event, async (transaction) => this.applyEvent(transaction, event, reversal));
    return { eventId: event.id, status };
  }

  /**
   * Reads the purchase and reverses the Connect transfer when policy allows.
   * Runs outside the webhook transaction; the resulting ledger entry is written
   * by `applyEvent` once the transaction commits.
   */
  private async maybeReverseTransfer(
    event: Stripe.Event,
  ): Promise<{ reversalId: string; amount: number; disputeId: string } | undefined> {
    const dispute = event.data.object as Stripe.Dispute;
    const chargeId = typeof dispute.charge === "object" ? dispute.charge.id : dispute.charge;
    const inline = typeof dispute.charge === "object" ? dispute.charge : undefined;
    const purchase = await this.options.store.findPurchaseByStripeReference(chargeId)
      ?? (inline?.metadata?.purchaseId ? await this.options.store.getPurchase(inline.metadata.purchaseId) : undefined);
    if (!purchase?.stripeTransferId) return undefined;
    if (!await this.options.reverseTransferForDispute?.(purchase, dispute)) return undefined;
    const amount = Math.min(dispute.amount, Math.max(0, purchase.amount - purchase.refundedAmount));
    if (amount <= 0) return undefined;
    const reversal = await this.options.stripe.transfers.createReversal(
      purchase.stripeTransferId,
      { amount, metadata: { purchaseId: purchase.id, disputeId: dispute.id } },
      { idempotencyKey: `dispute-reversal:${purchase.id}:${dispute.id}` },
    );
    return { reversalId: reversal.id, amount, disputeId: dispute.id };
  }

  private async applyEvent(
    transaction: BillingTransaction,
    event: Stripe.Event,
    reversal?: { reversalId: string; amount: number; disputeId: string },
  ): Promise<void> {
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
        // The charge is on the platform account, so the platform's own
        // credential reads it. `transfer` is expanded to record the Connect
        // transfer, which is what a dispute reversal needs.
        const intent = await this.options.stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction", "latest_charge.transfer", "latest_charge.application_fee"] });
        const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : undefined;
        chargeId = charge?.id;
        transferId = stripeId(charge?.transfer);
        applicationFeeId = stripeId(charge?.application_fee);
        const balance = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : undefined;
        stripeFee = balance?.fee;
        net = balance?.net;
        // The amount is ours: the Checkout Session was built from the catalog.
        // A mismatch means the session was tampered with or replayed, so the
        // purchase is not settled and nothing is granted.
        if (typeof charge?.amount_captured === "number" && charge.amount_captured > 0 && charge.amount_captured !== purchase.amount) {
          await transaction.savePurchase({ ...purchase, state: "failed", updatedAt: this.now().toISOString() });
          return;
        }
      }
      const settledAt = this.now().toISOString();
      const updated: Purchase = {
        ...purchase, state: "settled", stripeCheckoutSessionId: session.id, settledAt,
        ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
        ...(chargeId ? { stripeChargeId: chargeId } : {}),
        ...(transferId ? { stripeTransferId: transferId } : {}),
        ...(applicationFeeId ? { stripeApplicationFeeId: applicationFeeId } : {}),
        updatedAt: settledAt,
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
      const updated: Purchase = {
        ...purchase,
        refundedAmount,
        stripeChargeId: charge.id,
        ...(stripeId(charge.payment_intent) ? { stripePaymentIntentId: stripeId(charge.payment_intent) } : {}),
        ...(stripeId(charge.application_fee) ? { stripeApplicationFeeId: stripeId(charge.application_fee) } : {}),
        state: refundedAmount >= purchase.amount ? "refunded" : "partially_refunded",
        updatedAt: this.now().toISOString(),
      };
      await transaction.savePurchase(updated);
      await transaction.appendLedger(this.ledger(event, updated, "refund", refundDelta));
      await transaction.appendOutbox(this.outbox(updated, "billing.purchase_refunded"));
      return;
    }
    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;
      // Resolve the purchase from the charge id in the payload. The charge is
      // recorded on the purchase, so this normally needs no API call at all.
      // When it cannot be resolved there is no safe way to continue: fetching
      // the charge would require guessing which tenant's credential to use, and
      // the Connect-management credential must never read a tenant's billing
      // details. The event is skipped rather than read at the wrong scope.
      const chargeId = typeof dispute.charge === "object" ? dispute.charge.id : dispute.charge;
      const inline = typeof dispute.charge === "object" ? dispute.charge : undefined;
      let purchase = await transaction.findPurchaseByStripeReference(chargeId);
      if (!purchase && inline?.metadata?.purchaseId) {
        purchase = await transaction.getPurchase(inline.metadata.purchaseId);
      }
      if (!purchase) return;
      const charge = inline ?? { id: chargeId, amount_refunded: 0, metadata: {} } as unknown as Stripe.Charge;
      const updated: Purchase = { ...purchase, state: "disputed", updatedAt: this.now().toISOString() };
      await transaction.savePurchase(updated);
      await transaction.appendLedger(this.ledger(event, updated, "dispute", dispute.amount));
      // The reversal already happened, outside this transaction, under a
      // stable idempotency key. Recording it here keeps the ledger and the
      // transfer in agreement.
      if (reversal) {
        const entry = this.ledger(event, updated, "transfer_reversal", reversal.amount);
        entry.metadata = { stripeTransferReversalId: reversal.reversalId, stripeDisputeId: reversal.disputeId };
        await transaction.appendLedger(entry);
      }
      await transaction.appendOutbox(this.outbox(updated, "billing.purchase_disputed"));
      return;
    }
    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      const profile = await this.options.store.findTenantProfileByAccount(account.id);
      if (profile) {
        // v1 emitted the deprecated booleans on this event, so capability state
        // is re-read from the v2 path rather than trusted from the payload.
        const refreshed = await this.refreshTenantCapabilities(profile.tenantId);
        if (refreshed.transfersStatus === "active") return;
      }
    }
  }

  private ledger(event: Stripe.Event, purchase: Purchase, kind: BillingLedgerEntry["kind"], amount: number, stripeFee?: number, net?: number): BillingLedgerEntry {
    return { id: this.options.ids.next(), purchaseId: purchase.id, stripeEventId: event.id, kind, amount, currency: purchase.currency, ...(stripeFee === undefined ? {} : { stripeFee }), ...(net === undefined ? {} : { net }), createdAt: this.now().toISOString() };
  }

  private async findPurchaseForCharge(transaction: BillingTransaction, charge: Stripe.Charge): Promise<Purchase | undefined> {
    const byReference = await transaction.findPurchaseByStripeReference(charge.id);
    if (byReference) return byReference;
    const purchaseId = charge.metadata?.purchaseId;
    return purchaseId ? transaction.getPurchase(purchaseId) : undefined;
  }

  /**
   * Settlement facts. Every field an entitlement rule can match on is present
   * here, so a rule is evaluable from the outbox alone without re-reading the
   * purchase. `schemaVersion` was bumped to 2 because the payload gained
   * `tenantId`, `sessionId`, `productKey`, and `settledAt`.
   */
  private outbox(purchase: Purchase, type: BillingOutboxEventType): BillingOutboxEvent {
    const facts: PurchaseSettledFacts = {
      purchaseId: purchase.id,
      tenantId: purchase.tenantId,
      channelId: purchase.channelId,
      sessionId: purchase.sessionId ?? null,
      buyerId: purchase.buyerId,
      kind: purchase.kind,
      productKey: purchase.productKey,
      amount: purchase.amount,
      currency: purchase.currency,
      settledAt: purchase.settledAt ?? purchase.updatedAt,
    };
    return {
      id: this.options.ids.next(), type, aggregateId: purchase.id,
      payload: { ...facts, state: purchase.state, refundedAmount: purchase.refundedAmount },
      createdAt: this.now().toISOString(), attempts: 0,
    };
  }

  private async requireReadyProfile(tenantId: string, requireTransfers: boolean): Promise<TenantBillingProfile> {
    const profile = await this.options.store.getTenantProfile(required(tenantId, "tenantId"));
    if (!profile) throw new Error("Tenant billing profile not found");
    if (requireTransfers && profile.transfersStatus !== "active") {
      throw new Error("Tenant account is not active for transfers");
    }
    return profile;
  }
}

/** v2 capability path. The deprecated v1 booleans are deliberately not read. */
function readTransfersStatus(account: unknown): TransfersStatus {
  const status = (account as {
    configuration?: { recipient?: { capabilities?: { stripe_balance?: { stripe_transfers?: { status?: string } } } } };
  })?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  if (status === "active") return "active";
  if (status === "inactive") return "inactive";
  return "pending";
}

/** 8 random letters, the suffix the Dashboard expects on integration_identifier. */
function randomSuffix(): string {
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }
  return out;
}
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

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
  purchase: Purchase,
  tenantId: string,
  channelId: string,
  buyerId: string,
  item: ReturnType<BillingCatalog["resolve"]>,
): void {
  if (
    purchase.tenantId !== tenantId || purchase.channelId !== channelId || purchase.buyerId !== buyerId
    || purchase.productKey !== item.key || purchase.amount !== item.unitAmount || purchase.currency !== item.currency
    || purchase.platformFeeAmount !== item.platformFeeAmount
  ) {
    throw new Error("purchaseId is already associated with a different purchase");
  }
}
