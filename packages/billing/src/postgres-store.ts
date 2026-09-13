import type { Pool, PoolClient, QueryResultRow } from "pg";
import type Stripe from "stripe";

import type {
  BillingLedgerEntry, BillingOutboxEvent, BillingStore, BillingTransaction,
  ChannelBillingProfile, ChannelPurchase,
} from "./types.js";

/** Durable PostgreSQL adapter. Apply sql/001_billing.sql before use. */
export class PostgresBillingStore implements BillingStore {
  constructor(private readonly pool: Pool) {}

  async getChannelProfile(channelId: string): Promise<ChannelBillingProfile | undefined> {
    const result = await this.pool.query("SELECT * FROM billing_channel_profiles WHERE channel_id = $1", [channelId]);
    return result.rows[0] ? profileFromRow(result.rows[0]) : undefined;
  }

  async findChannelProfileByConnectedAccount(accountId: string): Promise<ChannelBillingProfile | undefined> {
    const result = await this.pool.query("SELECT * FROM billing_channel_profiles WHERE stripe_connected_account_id = $1", [accountId]);
    return result.rows[0] ? profileFromRow(result.rows[0]) : undefined;
  }

  async saveChannelProfile(profile: ChannelBillingProfile): Promise<void> {
    await saveProfile(this.pool, profile);
  }

  async createPurchase(purchase: ChannelPurchase): Promise<ChannelPurchase> {
    await savePurchase(this.pool, purchase);
    return purchase;
  }

  async getPurchase(id: string): Promise<ChannelPurchase | undefined> {
    const result = await this.pool.query("SELECT * FROM billing_channel_purchases WHERE id = $1", [id]);
    return result.rows[0] ? purchaseFromRow(result.rows[0]) : undefined;
  }

  async processStripeEvent(event: Stripe.Event, apply: (transaction: BillingTransaction) => Promise<void>): Promise<"processed" | "duplicate"> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const claimed = await client.query(
        "INSERT INTO billing_stripe_events (id, type, created_at) VALUES ($1, $2, to_timestamp($3)) ON CONFLICT DO NOTHING RETURNING id",
        [event.id, event.type, event.created],
      );
      if (claimed.rowCount === 0) {
        await client.query("ROLLBACK");
        return "duplicate";
      }
      await apply(new PostgresBillingTransaction(client));
      await client.query("UPDATE billing_stripe_events SET processed_at = now() WHERE id = $1", [event.id]);
      await client.query("COMMIT");
      return "processed";
    } catch (cause) {
      await client.query("ROLLBACK");
      throw cause;
    } finally {
      client.release();
    }
  }

  async claimOutbox(limit: number): Promise<readonly BillingOutboxEvent[]> {
    const result = await this.pool.query(
      `UPDATE billing_outbox SET claimed_at = now(), attempts = attempts + 1
       WHERE id IN (
         SELECT id FROM billing_outbox
         WHERE delivered_at IS NULL AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes')
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1
       ) RETURNING *`,
      [limit],
    );
    return result.rows.map(outboxFromRow);
  }

  async completeOutbox(id: string): Promise<void> {
    await this.pool.query("UPDATE billing_outbox SET delivered_at = now(), claimed_at = NULL, last_error = NULL WHERE id = $1", [id]);
  }

  async failOutbox(id: string, error: string): Promise<void> {
    await this.pool.query("UPDATE billing_outbox SET claimed_at = NULL, last_error = $2 WHERE id = $1", [id, error.slice(0, 2_000)]);
  }
}

class PostgresBillingTransaction implements BillingTransaction {
  constructor(private readonly client: PoolClient) {}
  async getPurchase(id: string): Promise<ChannelPurchase | undefined> {
    const result = await this.client.query("SELECT * FROM billing_channel_purchases WHERE id = $1 FOR UPDATE", [id]);
    return result.rows[0] ? purchaseFromRow(result.rows[0]) : undefined;
  }
  async findPurchaseByStripeReference(reference: string): Promise<ChannelPurchase | undefined> {
    if (!reference) return undefined;
    const result = await this.client.query(
      `SELECT * FROM billing_channel_purchases
       WHERE stripe_checkout_session_id = $1 OR stripe_payment_intent_id = $1 OR stripe_charge_id = $1 OR stripe_transfer_id = $1
       LIMIT 1 FOR UPDATE`, [reference],
    );
    return result.rows[0] ? purchaseFromRow(result.rows[0]) : undefined;
  }
  async savePurchase(purchase: ChannelPurchase): Promise<void> { await savePurchase(this.client, purchase); }
  async saveChannelProfile(profile: ChannelBillingProfile): Promise<void> { await saveProfile(this.client, profile); }
  async appendLedger(entry: BillingLedgerEntry): Promise<void> {
    await this.client.query(
      `INSERT INTO billing_ledger (id, purchase_id, stripe_event_id, kind, amount, currency, stripe_fee, net, metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [entry.id, entry.purchaseId, entry.stripeEventId ?? null, entry.kind, entry.amount, entry.currency, entry.stripeFee ?? null, entry.net ?? null, entry.metadata ?? {}, entry.createdAt],
    );
  }
  async appendOutbox(event: BillingOutboxEvent): Promise<void> {
    await this.client.query(
      `INSERT INTO billing_outbox (id, type, aggregate_id, payload, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [event.id, event.type, event.aggregateId, event.payload, event.createdAt],
    );
  }
}

type Queryable = Pick<Pool | PoolClient, "query">;

async function saveProfile(db: Queryable, profile: ChannelBillingProfile): Promise<void> {
  await db.query(
    `INSERT INTO billing_channel_profiles
      (channel_id, owner_id, stripe_customer_id, stripe_connected_account_id, onboarding_complete, charges_enabled, payouts_enabled, default_currency, country, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (channel_id) DO UPDATE SET owner_id=EXCLUDED.owner_id, stripe_customer_id=EXCLUDED.stripe_customer_id,
       stripe_connected_account_id=EXCLUDED.stripe_connected_account_id, onboarding_complete=EXCLUDED.onboarding_complete,
       charges_enabled=EXCLUDED.charges_enabled, payouts_enabled=EXCLUDED.payouts_enabled,
       default_currency=EXCLUDED.default_currency, country=EXCLUDED.country, updated_at=EXCLUDED.updated_at`,
    [profile.channelId, profile.ownerId, profile.stripeCustomerId, profile.stripeConnectedAccountId, profile.onboardingComplete, profile.chargesEnabled, profile.payoutsEnabled, profile.defaultCurrency, profile.country ?? null, profile.createdAt, profile.updatedAt],
  );
}

async function savePurchase(db: Queryable, purchase: ChannelPurchase): Promise<void> {
  await db.query(
    `INSERT INTO billing_channel_purchases
      (id, channel_id, buyer_id, buyer_stripe_customer_id, product_key, kind, amount, currency, platform_fee_amount, state,
       stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id, stripe_transfer_id, stripe_application_fee_id,
       refunded_amount, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (id) DO UPDATE SET state=EXCLUDED.state, stripe_checkout_session_id=EXCLUDED.stripe_checkout_session_id,
       stripe_payment_intent_id=EXCLUDED.stripe_payment_intent_id, stripe_charge_id=EXCLUDED.stripe_charge_id,
       stripe_transfer_id=EXCLUDED.stripe_transfer_id, stripe_application_fee_id=EXCLUDED.stripe_application_fee_id,
       refunded_amount=EXCLUDED.refunded_amount, updated_at=EXCLUDED.updated_at`,
    [purchase.id, purchase.channelId, purchase.buyerId, purchase.buyerStripeCustomerId ?? null, purchase.productKey, purchase.kind,
      purchase.amount, purchase.currency, purchase.platformFeeAmount, purchase.state, purchase.stripeCheckoutSessionId ?? null,
      purchase.stripePaymentIntentId ?? null, purchase.stripeChargeId ?? null, purchase.stripeTransferId ?? null,
      purchase.stripeApplicationFeeId ?? null, purchase.refundedAmount, purchase.createdAt, purchase.updatedAt],
  );
}

function profileFromRow(row: QueryResultRow): ChannelBillingProfile {
  return { channelId: row.channel_id, ownerId: row.owner_id, stripeCustomerId: row.stripe_customer_id,
    stripeConnectedAccountId: row.stripe_connected_account_id, onboardingComplete: row.onboarding_complete,
    chargesEnabled: row.charges_enabled, payoutsEnabled: row.payouts_enabled, defaultCurrency: row.default_currency,
    ...(row.country ? { country: row.country } : {}), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}

function purchaseFromRow(row: QueryResultRow): ChannelPurchase {
  return { id: row.id, channelId: row.channel_id, buyerId: row.buyer_id,
    ...(row.buyer_stripe_customer_id ? { buyerStripeCustomerId: row.buyer_stripe_customer_id } : {}),
    productKey: row.product_key, kind: row.kind, amount: Number(row.amount), currency: row.currency,
    platformFeeAmount: Number(row.platform_fee_amount), state: row.state,
    ...(row.stripe_checkout_session_id ? { stripeCheckoutSessionId: row.stripe_checkout_session_id } : {}),
    ...(row.stripe_payment_intent_id ? { stripePaymentIntentId: row.stripe_payment_intent_id } : {}),
    ...(row.stripe_charge_id ? { stripeChargeId: row.stripe_charge_id } : {}),
    ...(row.stripe_transfer_id ? { stripeTransferId: row.stripe_transfer_id } : {}),
    ...(row.stripe_application_fee_id ? { stripeApplicationFeeId: row.stripe_application_fee_id } : {}),
    refundedAmount: Number(row.refunded_amount), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}

function outboxFromRow(row: QueryResultRow): BillingOutboxEvent {
  return { id: row.id, type: row.type, aggregateId: row.aggregate_id, payload: row.payload, createdAt: iso(row.created_at) };
}

function iso(value: Date | string): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
