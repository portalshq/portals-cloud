import type { QueryRunner } from "./postgres-store.js";

/**
 * Durable "welcome bonus" claim records, scoped to the application database.
 *
 * The bonus itself is granted through the platform's credit ledger (an
 * idempotent `grantCredits` operationId); this store records *that the claim
 * happened* so the app can skip the grant attempt on every subsequent request
 * without touching the central database. Keyed by (consumer, tenant): a user
 * new to one program may already be welcomed in another.
 *
 * Required schema (app migration):
 *
 *   CREATE TABLE signup_bonus_claims (
 *     consumer_id text NOT NULL,
 *     tenant_id text NOT NULL,
 *     claimed_at timestamptz NOT NULL DEFAULT now(),
 *     PRIMARY KEY (consumer_id, tenant_id)
 *   );
 */
export class SignupBonusStore {
  constructor(private readonly pool: QueryRunner) {}

  /**
   * Record that `consumerId` claimed the signup bonus for `tenantId`.
   * Returns true only for the first claim — safe across restarts and
   * instances because the primary key is the dedupe.
   */
  async claim(consumerId: string, tenantId: string): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO signup_bonus_claims(consumer_id, tenant_id, claimed_at) VALUES($1, $2, now())
       ON CONFLICT (consumer_id, tenant_id) DO NOTHING
       RETURNING consumer_id`,
      [consumerId, tenantId],
    );
    return result.rows.length > 0;
  }
}
