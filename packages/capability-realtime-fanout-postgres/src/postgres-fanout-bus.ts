/**
 * Durable `FanoutBus` backed by PostgreSQL.
 *
 * This is a conforming implementation of the `FanoutBus` interface exported by
 * `@portalshq/capability-realtime-fanout`. It provides durable message delivery
 * through PostgreSQL polling, making messages survive process restarts and enabling
 * cross-process delivery.
 *
 * The polling interval is fixed at 1 second, which is appropriate for current scale.
 * NOTIFY/LISTEN could be added in the future for lower latency at higher scale.
 */
import type { FanoutBus, FanoutHandler } from "@portalshq/capability-realtime-fanout";
import type pg from "pg";

const POLL_INTERVAL_MS = 1000;
const DEFAULT_BATCH_SIZE = 100;

export interface PostgresFanoutBusOptions {
  /** Maximum number of messages to fetch per poll. Default: 100 */
  batchSize?: number;
}

export interface PostgresFanoutBus extends FanoutBus {
  close(): Promise<void>;
}

/**
 * Creates a PostgreSQL-backed fanout bus.
 *
 * @param pool - PostgreSQL connection pool
 * @param options - Configuration options
 * @returns A fanout bus instance
 */
export function createPostgresFanoutBus(
  pool: pg.Pool,
  options?: PostgresFanoutBusOptions,
): PostgresFanoutBus {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;

  return {
    async publish(topic, message) {
      await pool.query("INSERT INTO fanout_messages (topic, payload) VALUES ($1, $2)", [
        topic,
        JSON.stringify(message),
      ]);
    },

    async subscribe(topic, handler) {
      // Start at the current head: a browser joining now wants live chat, not
      // the backlog of a channel that has been running all week.
      const latest = await pool.query(
        "SELECT COALESCE(MAX(id), 0) AS id FROM fanout_messages WHERE topic = $1",
        [topic],
      );
      let cursor = Number(latest.rows[0].id);
      let closed = false;
      let busy = false;

      async function poll(): Promise<void> {
        if (closed || busy) return;
        busy = true;
        try {
          const result = await pool.query(
            "SELECT id, payload FROM fanout_messages WHERE topic = $1 AND id > $2 ORDER BY id LIMIT $3",
            [topic, cursor, batchSize],
          );
          for (const row of result.rows) {
            const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
            await handler(payload);
            cursor = Number(row.id);
          }
        } finally {
          busy = false;
        }
      }

      const timer = setInterval(() => {
        void poll().catch((cause) => {
          console.error("[fanout] PostgreSQL polling failed", cause);
        });
      }, POLL_INTERVAL_MS);
      // Without unref the poll timer alone would hold the process open and
      // SIGTERM would wait on it.
      timer.unref();

      return () => {
        closed = true;
        clearInterval(timer);
      };
    },

    async close() {
      // The pool is owned by the caller, so we don't close it here
    },
  };
}

export type { FanoutHandler };
