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
  type TopicPump = {
    cursor: number;
    handlers: Set<FanoutHandler>;
    timer?: ReturnType<typeof setTimeout>;
    polling: boolean;
    closed: boolean;
  };
  const topics = new Map<string, TopicPump>();
  const initializing = new Map<string, Promise<TopicPump>>();
  let busClosed = false;

  function schedule(topic: string, state: TopicPump, delay = POLL_INTERVAL_MS): void {
    if (state.closed || state.timer || state.handlers.size === 0) return;
    state.timer = setTimeout(() => {
      state.timer = undefined;
      void poll(topic, state);
    }, delay);
    state.timer.unref();
  }

  async function poll(topic: string, state: TopicPump): Promise<void> {
    if (state.closed || state.polling || state.handlers.size === 0) return;
    state.polling = true;
    try {
      const result = await pool.query(
        "SELECT id, payload FROM fanout_messages WHERE topic = $1 AND id > $2 ORDER BY id LIMIT $3",
        [topic, state.cursor, batchSize],
      );
      for (const row of result.rows) {
        const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
        await Promise.all([...state.handlers].map(handler => handler(payload)));
        state.cursor = Number(row.id);
      }
    } catch (cause) {
      console.error("[fanout] PostgreSQL polling failed", { topic, cause });
    } finally {
      state.polling = false;
      schedule(topic, state);
    }
  }

  return {
    async publish(topic, message) {
      if (busClosed) throw new Error("Fanout bus is closed");
      await pool.query("INSERT INTO fanout_messages (topic, payload) VALUES ($1, $2)", [
        topic,
        JSON.stringify(message),
      ]);
      const state = topics.get(topic);
      if (state?.timer) {
        clearTimeout(state.timer);
        state.timer = undefined;
        schedule(topic, state, 0);
      }
    },

    async subscribe(topic, handler) {
      if (busClosed) throw new Error("Fanout bus is closed");
      let state = topics.get(topic);
      if (!state) {
        let pending = initializing.get(topic);
        if (!pending) {
          pending = pool.query(
            "SELECT COALESCE(MAX(id), 0) AS id FROM fanout_messages WHERE topic = $1",
            [topic],
          ).then(latest => {
            const created = { cursor: Number(latest.rows[0].id), handlers: new Set<FanoutHandler>(), polling: false, closed: false };
            topics.set(topic, created);
            return created;
          }).finally(() => initializing.delete(topic));
          initializing.set(topic, pending);
        }
        state = await pending;
        if (busClosed) {
          state.closed = true;
          topics.delete(topic);
          throw new Error("Fanout bus is closed");
        }
      }
      state.handlers.add(handler);
      schedule(topic, state);
      return () => {
        state!.handlers.delete(handler);
        if (state!.handlers.size === 0) {
          state!.closed = true;
          if (state!.timer) clearTimeout(state!.timer);
          topics.delete(topic);
        }
      };
    },

    async close() {
      busClosed = true;
      for (const state of topics.values()) {
        state.closed = true;
        state.handlers.clear();
        if (state.timer) clearTimeout(state.timer);
      }
      topics.clear();
      initializing.clear();
    },
  };
}

export type { FanoutHandler };
