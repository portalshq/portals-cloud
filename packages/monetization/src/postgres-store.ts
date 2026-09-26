import type { Pool, PoolClient, QueryResultRow } from "pg";
import type Stripe from "stripe";

import type {
  BillingLedgerEntry, BillingOutboxEvent, BillingStore, BillingTransaction, Purchase, TenantBillingProfile,
} from "./types.js";
import type {
  EntitlementGrant, EntitlementRule, EntitlementScope, EntitlementStore,
} from "./entitlements.js";
import { grantAppliesAt, validateRule } from "./entitlements.js";

/** Durable PostgreSQL adapter. Apply sql/001_monetization.sql before use. */
export class PostgresBillingStore implements BillingStore {
  constructor(private readonly pool: Pool) {}

  async getTenantProfile(tenantId: string): Promise<TenantBillingProfile | undefined> {
    const result = await this.pool.query("SELECT * FROM monetization_tenant_profiles WHERE tenant_id = $1", [tenantId]);
    return result.rows[0] ? profileFromRow(result.rows[0]) : undefined;
  }

  async findTenantProfileByAccount(accountId: string): Promise<TenantBillingProfile | undefined> {
    const result = await this.pool.query("SELECT * FROM monetization_tenant_profiles WHERE stripe_account_id = $1", [accountId]);
    return result.rows[0] ? profileFromRow(result.rows[0]) : undefined;
  }

  async getBillingCustomer(buyerId: string): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ stripe_customer_id: string }>(
      `SELECT stripe_customer_id FROM monetization_billing_customers WHERE buyer_id = $1`, [buyerId],
    );
    return rows[0]?.stripe_customer_id;
  }

  async saveBillingCustomer(buyerId: string, stripeCustomerId: string, createdAt: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO monetization_billing_customers (buyer_id, stripe_customer_id, created_at)
       VALUES ($1,$2,$3)
       ON CONFLICT (buyer_id) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id`,
      [buyerId, stripeCustomerId, createdAt],
    );
  }

  async saveTenantProfile(profile: TenantBillingProfile): Promise<void> {
    await saveProfile(this.pool, profile);
  }

  async createPurchase(purchase: Purchase): Promise<Purchase> {
    await savePurchase(this.pool, purchase);
    return purchase;
  }

  async getPurchase(id: string): Promise<Purchase | undefined> {
    const result = await this.pool.query("SELECT * FROM monetization_purchases WHERE id = $1", [id]);
    return result.rows[0] ? purchaseFromRow(result.rows[0]) : undefined;
  }

  async findPurchaseByStripeReference(reference: string): Promise<Purchase | undefined> {
    if (!reference) return undefined;
    const result = await this.pool.query(
      `SELECT * FROM monetization_purchases
       WHERE stripe_checkout_session_id = $1 OR stripe_payment_intent_id = $1
          OR stripe_charge_id = $1 OR stripe_transfer_id = $1
       LIMIT 1`,
      [reference],
    );
    return result.rows[0] ? purchaseFromRow(result.rows[0]) : undefined;
  }

  async processStripeEvent(event: Stripe.Event, apply: (transaction: BillingTransaction) => Promise<void>): Promise<"processed" | "duplicate"> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const claimed = await client.query(
        "INSERT INTO monetization_stripe_events (id, type, created_at) VALUES ($1, $2, to_timestamp($3)) ON CONFLICT DO NOTHING RETURNING id",
        [event.id, event.type, event.created],
      );
      if (claimed.rowCount === 0) {
        await client.query("ROLLBACK");
        return "duplicate";
      }
      await apply(new PostgresBillingTransaction(client));
      await client.query("UPDATE monetization_stripe_events SET processed_at = now() WHERE id = $1", [event.id]);
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
      `UPDATE monetization_outbox SET claimed_at = now(), attempts = attempts + 1
       WHERE id IN (
         SELECT id FROM monetization_outbox
         WHERE delivered_at IS NULL AND dead_at IS NULL
           AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes')
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1
       ) RETURNING *`,
      [limit],
    );
    return result.rows.map(outboxFromRow);
  }

  async completeOutbox(id: string): Promise<void> {
    await this.pool.query("UPDATE monetization_outbox SET delivered_at = now(), claimed_at = NULL, last_error = NULL WHERE id = $1", [id]);
  }

  async failOutbox(id: string, error: string): Promise<void> {
    await this.pool.query("UPDATE monetization_outbox SET claimed_at = NULL, last_error = $2 WHERE id = $1", [id, error.slice(0, 2_000)]);
  }

  /**
   * Parks the event rather than deleting it. `last_error` is kept and the claim
   * is released, so an operator can see what failed and replay it once fixed.
   */
  async markOutboxDead(id: string, error: string): Promise<void> {
    await this.pool.query(
      "UPDATE monetization_outbox SET dead_at = now(), claimed_at = NULL, last_error = $2 WHERE id = $1",
      [id, error.slice(0, 2_000)],
    );
  }

  async listDeadOutbox(limit: number): Promise<readonly BillingOutboxEvent[]> {
    const result = await this.pool.query(
      "SELECT * FROM monetization_outbox WHERE dead_at IS NOT NULL ORDER BY created_at LIMIT $1",
      [limit],
    );
    return result.rows.map(outboxFromRow);
  }

  async requeueDeadOutbox(limit: number): Promise<number> {
    const result = await this.pool.query(
      `UPDATE monetization_outbox SET dead_at = NULL, attempts = 0, claimed_at = NULL
       WHERE id IN (
         SELECT id FROM monetization_outbox
         WHERE dead_at IS NOT NULL
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1
       ) RETURNING id`,
      [limit],
    );
    return result.rowCount ?? 0;
  }
}

class PostgresBillingTransaction implements BillingTransaction {
  constructor(private readonly client: PoolClient) {}
  async getPurchase(id: string): Promise<Purchase | undefined> {
    const result = await this.client.query("SELECT * FROM monetization_purchases WHERE id = $1 FOR UPDATE", [id]);
    return result.rows[0] ? purchaseFromRow(result.rows[0]) : undefined;
  }
  async findPurchaseByStripeReference(reference: string): Promise<Purchase | undefined> {
    if (!reference) return undefined;
    const result = await this.client.query(
      `SELECT * FROM monetization_purchases
       WHERE stripe_checkout_session_id = $1 OR stripe_payment_intent_id = $1 OR stripe_charge_id = $1 OR stripe_transfer_id = $1
       LIMIT 1 FOR UPDATE`, [reference],
    );
    return result.rows[0] ? purchaseFromRow(result.rows[0]) : undefined;
  }
  async savePurchase(purchase: Purchase): Promise<void> { await savePurchase(this.client, purchase); }
  async saveTenantProfile(profile: TenantBillingProfile): Promise<void> { await saveProfile(this.client, profile); }
  async appendLedger(entry: BillingLedgerEntry): Promise<void> {
    await this.client.query(
      `INSERT INTO monetization_ledger (id, purchase_id, stripe_event_id, kind, amount, currency, stripe_fee, net, metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [entry.id, entry.purchaseId, entry.stripeEventId ?? null, entry.kind, entry.amount, entry.currency, entry.stripeFee ?? null, entry.net ?? null, entry.metadata ?? {}, entry.createdAt],
    );
  }
  async appendOutbox(event: BillingOutboxEvent): Promise<void> {
    await this.client.query(
      `INSERT INTO monetization_outbox (id, type, aggregate_id, payload, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [event.id, event.type, event.aggregateId, event.payload, event.createdAt],
    );
  }
}

type Queryable = Pick<Pool | PoolClient, "query">;

async function saveProfile(db: Queryable, profile: TenantBillingProfile): Promise<void> {
  await db.query(
    `INSERT INTO monetization_tenant_profiles
      (tenant_id, owner_id, stripe_account_id, transfers_status, default_currency, country, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (tenant_id) DO UPDATE SET owner_id=EXCLUDED.owner_id, stripe_account_id=EXCLUDED.stripe_account_id,
       transfers_status=EXCLUDED.transfers_status, default_currency=EXCLUDED.default_currency,
       country=EXCLUDED.country, updated_at=EXCLUDED.updated_at`,
    [profile.tenantId, profile.ownerId, profile.stripeAccountId, profile.transfersStatus,
      profile.defaultCurrency, profile.country ?? null, profile.createdAt, profile.updatedAt],
  );
}

async function savePurchase(db: Queryable, purchase: Purchase): Promise<void> {
  await db.query(
    `INSERT INTO monetization_purchases
      (id, tenant_id, channel_id, session_id, buyer_id, customer_id, product_key, kind, amount, currency,
       platform_fee_amount, state, stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id,
       stripe_transfer_id, stripe_application_fee_id, refunded_amount, settled_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     ON CONFLICT (id) DO UPDATE SET state=EXCLUDED.state, stripe_checkout_session_id=EXCLUDED.stripe_checkout_session_id,
       stripe_payment_intent_id=EXCLUDED.stripe_payment_intent_id, stripe_charge_id=EXCLUDED.stripe_charge_id,
       stripe_transfer_id=EXCLUDED.stripe_transfer_id, stripe_application_fee_id=EXCLUDED.stripe_application_fee_id,
       refunded_amount=EXCLUDED.refunded_amount, settled_at=EXCLUDED.settled_at, updated_at=EXCLUDED.updated_at`,
    [purchase.id, purchase.tenantId, purchase.channelId, purchase.sessionId ?? null, purchase.buyerId,
      purchase.customerId ?? null, purchase.productKey, purchase.kind, purchase.amount, purchase.currency, purchase.platformFeeAmount, purchase.state,
      purchase.stripeCheckoutSessionId ?? null, purchase.stripePaymentIntentId ?? null, purchase.stripeChargeId ?? null,
      purchase.stripeTransferId ?? null, purchase.stripeApplicationFeeId ?? null, purchase.refundedAmount,
      purchase.settledAt ?? null, purchase.createdAt, purchase.updatedAt],
  );
}

function profileFromRow(row: QueryResultRow): TenantBillingProfile {
  return { tenantId: row.tenant_id, ownerId: row.owner_id, stripeAccountId: row.stripe_account_id,
    transfersStatus: row.transfers_status, defaultCurrency: row.default_currency,
    ...(row.country ? { country: row.country } : {}), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}

function purchaseFromRow(row: QueryResultRow): Purchase {
  return { id: row.id, tenantId: row.tenant_id, channelId: row.channel_id,
    ...(row.session_id ? { sessionId: row.session_id } : {}), buyerId: row.buyer_id,
    ...(row.customer_id ? { customerId: row.customer_id } : {}),
    productKey: row.product_key, kind: row.kind, amount: Number(row.amount), currency: row.currency,
    platformFeeAmount: Number(row.platform_fee_amount), state: row.state,
    ...(row.stripe_checkout_session_id ? { stripeCheckoutSessionId: row.stripe_checkout_session_id } : {}),
    ...(row.stripe_payment_intent_id ? { stripePaymentIntentId: row.stripe_payment_intent_id } : {}),
    ...(row.stripe_charge_id ? { stripeChargeId: row.stripe_charge_id } : {}),
    ...(row.stripe_transfer_id ? { stripeTransferId: row.stripe_transfer_id } : {}),
    ...(row.stripe_application_fee_id ? { stripeApplicationFeeId: row.stripe_application_fee_id } : {}),
    refundedAmount: Number(row.refunded_amount), ...(row.settled_at ? { settledAt: iso(row.settled_at) } : {}),
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}

function outboxFromRow(row: QueryResultRow): BillingOutboxEvent {
  return {
    id: row.id, type: row.type, aggregateId: row.aggregate_id, payload: row.payload,
    createdAt: iso(row.created_at), attempts: Number(row.attempts ?? 0),
    ...(row.last_error ? { lastError: row.last_error } : {}),
    ...(row.dead_at ? { deadAt: iso(row.dead_at) } : {}),
  };
}

function iso(value: Date | string): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }

/**
 * Durable entitlement store. Grants are keyed `(rule_id, purchase_id)` so a
 * redelivered settlement outbox event cannot double-grant, and `consume` takes
 * a row lock per grant so two concurrent consumers cannot both spend the last
 * unit.
 */
export class PostgresEntitlementStore implements EntitlementStore {
  constructor(private readonly pool: Pool) {}

  async saveRule(rule: EntitlementRule): Promise<void> {
    validateRule(rule);
    await this.pool.query(
      `INSERT INTO monetization_entitlement_rules
        (id, tenant_id, kind, scope, conditions, quantity, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET kind=EXCLUDED.kind, scope=EXCLUDED.scope,
         conditions=EXCLUDED.conditions, quantity=EXCLUDED.quantity`,
      [rule.id, rule.tenantId, rule.kind, rule.scope, rule.conditions, rule.quantity, rule.createdAt],
    );
  }

  async getRule(id: string): Promise<EntitlementRule | undefined> {
    const result = await this.pool.query("SELECT * FROM monetization_entitlement_rules WHERE id = $1", [id]);
    return result.rows[0] ? ruleFromRow(result.rows[0]) : undefined;
  }

  async listRules(tenantId: string): Promise<readonly EntitlementRule[]> {
    const result = await this.pool.query("SELECT * FROM monetization_entitlement_rules WHERE tenant_id = $1 ORDER BY created_at", [tenantId]);
    return result.rows.map(ruleFromRow);
  }

  async grant(grants: readonly EntitlementGrant[]): Promise<void> {
    if (grants.length === 0) return;
    const values: unknown[] = [];
    const tuples = grants.map((grant, index) => {
      const at = index * 10;
      values.push(grant.id, grant.ruleId, grant.tenantId, grant.consumerId, grant.kind,
        grant.scope, grant.quantity, grant.remaining, grant.purchaseId,
        grant.expiresAt ?? null);
      return `($${at + 1},$${at + 2},$${at + 3},$${at + 4},$${at + 5},$${at + 6},$${at + 7},$${at + 8},$${at + 9},$${at + 10}, now(), now())`;
    });
    await this.pool.query(
      `INSERT INTO monetization_entitlements
        (id, rule_id, tenant_id, consumer_id, kind, scope, quantity, remaining, purchase_id, expires_at, created_at, updated_at)
       VALUES ${tuples.join(",")}
       ON CONFLICT (rule_id, purchase_id) DO NOTHING`,
      values,
    );
  }

  async consume(consumerId: string, kind: string, site: EntitlementScope, n: number): Promise<boolean> {
    if (!Number.isInteger(n) || n < 1) throw new TypeError("consume count must be a positive integer");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Plain FOR UPDATE, not SKIP LOCKED: skipping locked rows would let two
      // concurrent consumers each see a partial balance, both conclude there is
      // enough, and both commit — spending the last unit twice. Serializing here
      // costs throughput on a low-frequency path and buys correctness.
      const candidates = await client.query(
        `SELECT id, scope, remaining FROM monetization_entitlements
         WHERE consumer_id = $1 AND kind = $2 AND remaining > 0
           AND (expires_at IS NULL OR expires_at >= now())
         ORDER BY created_at FOR UPDATE`,
        [consumerId, kind],
      );
      const applicable = candidates.rows.filter((row: QueryResultRow) => grantAppliesAt(row.scope as EntitlementScope, site));
      const available = applicable.reduce((total: number, row: QueryResultRow) => total + Number(row.remaining), 0);
      if (available < n) {
        await client.query("ROLLBACK");
        return false;
      }
      let owed = n;
      for (const row of applicable) {
        if (owed === 0) break;
        const taken = Math.min(owed, Number(row.remaining));
        await client.query("UPDATE monetization_entitlements SET remaining = remaining - $2, updated_at = now() WHERE id = $1", [row.id, taken]);
        owed -= taken;
      }
      await client.query("COMMIT");
      return true;
    } catch (cause) {
      await client.query("ROLLBACK");
      throw cause;
    } finally {
      client.release();
    }
  }

  async remaining(consumerId: string, kind: string, site: EntitlementScope): Promise<number> {
    const result = await this.pool.query(
      `SELECT scope, remaining FROM monetization_entitlements
       WHERE consumer_id = $1 AND kind = $2 AND (expires_at IS NULL OR expires_at >= now())`,
      [consumerId, kind],
    );
    return result.rows
      .filter((row: QueryResultRow) => grantAppliesAt(row.scope as EntitlementScope, site))
      .reduce((total: number, row: QueryResultRow) => total + Number(row.remaining), 0);
  }

  async revokeForPurchase(purchaseId: string): Promise<void> {
    await this.pool.query("DELETE FROM monetization_entitlements WHERE purchase_id = $1", [purchaseId]);
  }
}

function ruleFromRow(row: QueryResultRow): EntitlementRule {
  return { id: row.id, tenantId: row.tenant_id, kind: row.kind, scope: row.scope, conditions: row.conditions, quantity: Number(row.quantity), createdAt: iso(row.created_at) };
}
