import type { QueryRunner } from "./postgres-store.js";

/**
 * Durable guest-trial accounting, scoped to the application database — guest
 * caps are per-app by design (each channel gets a fresh trial budget), so
 * this store runs on the app pool, never the central one.
 *
 * Required schema (app migration):
 *
 *   CREATE TABLE guest_trial_usage (
 *     guest_id text PRIMARY KEY,
 *     vote_used_at timestamptz,
 *     reaction_count integer NOT NULL DEFAULT 0
 *   );
 *   CREATE TABLE guest_trial_claims (
 *     guest_id text PRIMARY KEY,
 *     user_id text NOT NULL,
 *     claimed_at timestamptz NOT NULL DEFAULT now()
 *   );
 *
 * Every claim is a single atomic `INSERT ... ON CONFLICT` (or guarded UPDATE)
 * so a racing double-tap cannot exceed a cap, and claims survive restarts and
 * hold across instances. `vote_used_at` and `reaction_count` are independent:
 * spending reactions does not consume the vote and vice versa.
 */

export const MAX_GUEST_TRIAL_REACTIONS = 3;

export class GuestUsageStore {
  constructor(private readonly pool: QueryRunner) {}

  /** Atomically claim the guest's one-ever free vote. True = first claim. */
  async claimVote(guestId: string): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO guest_trial_usage(guest_id, vote_used_at) VALUES($1, now())
       ON CONFLICT (guest_id) DO UPDATE SET vote_used_at = now()
       WHERE guest_trial_usage.vote_used_at IS NULL
       RETURNING guest_id`,
      [guestId],
    );
    return result.rows.length > 0;
  }

  /** Give back a vote claimed by `claimVote` when the downstream submit
   *  failed. Only call after a successful claim in the same request. */
  async releaseVote(guestId: string): Promise<void> {
    await this.pool.query(
      `UPDATE guest_trial_usage SET vote_used_at = NULL WHERE guest_id = $1`,
      [guestId],
    );
  }

  /** Atomically increment the guest's free-reaction count up to `max`. */
  async claimReaction(guestId: string, max = MAX_GUEST_TRIAL_REACTIONS): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO guest_trial_usage(guest_id, reaction_count) VALUES($1, 1)
       ON CONFLICT (guest_id) DO UPDATE SET reaction_count = guest_trial_usage.reaction_count + 1
       WHERE guest_trial_usage.reaction_count < $2
       RETURNING guest_id`,
      [guestId, max],
    );
    return result.rows.length > 0;
  }

  /** Give back a reaction claimed by `claimReaction` when the downstream
   *  submit failed, so a transient error does not burn the allowance. */
  async releaseReaction(guestId: string): Promise<void> {
    await this.pool.query(
      `UPDATE guest_trial_usage SET reaction_count = GREATEST(reaction_count - 1, 0) WHERE guest_id = $1`,
      [guestId],
    );
  }

  /**
   * Record that `guestId` upgraded to verified user `userId`. Returns true
   * only for the first claim — the durable record that replaces in-memory
   * dedupe sets, safe across restarts and instances. The credit grant itself
   * is separately idempotent on its operationId; this records the claim.
   */
  async claimUpgrade(guestId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO guest_trial_claims(guest_id, user_id, claimed_at) VALUES($1, $2, now())
       ON CONFLICT (guest_id) DO NOTHING
       RETURNING guest_id`,
      [guestId, userId],
    );
    return result.rows.length > 0;
  }
}
