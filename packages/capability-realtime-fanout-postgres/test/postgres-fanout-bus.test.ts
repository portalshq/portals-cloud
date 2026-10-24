import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type pg from "pg";
import { createPostgresFanoutBus } from "../src/postgres-fanout-bus.js";

type QueryResult = { rows: Array<{ id: number | string; payload: unknown }> };
type QueryImpl = (sql: string, params?: unknown[]) => Promise<QueryResult>;

function mockPool(queryImpl?: QueryImpl) {
  const query = vi.fn(queryImpl ?? (async (): Promise<QueryResult> => ({ rows: [] })));
  return { pool: { query } as unknown as pg.Pool, query };
}

function headResult(id: number): QueryResult {
  return { rows: [{ id, payload: null }] };
}

describe("createPostgresFanoutBus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("publishes messages as JSON payloads", async () => {
    const { pool, query } = mockPool();
    const bus = createPostgresFanoutBus(pool);

    await bus.publish("chat", { text: "hello" });

    expect(query).toHaveBeenCalledWith(
      "INSERT INTO fanout_messages (topic, payload) VALUES ($1, $2)",
      ["chat", JSON.stringify({ text: "hello" })],
    );
  });

  it("subscribes at the current head and delivers newer rows in order", async () => {
    const { pool, query } = mockPool(async (sql, params) => {
      if (sql.startsWith("SELECT COALESCE(MAX(id)")) return headResult(41);
      if (sql.startsWith("SELECT id, payload")) {
        const cursor = Number(params?.[1]);
        return {
          rows: [
            { id: 42, payload: JSON.stringify({ n: 1 }) },
            { id: 43, payload: JSON.stringify({ n: 2 }) },
          ].filter((row) => row.id > cursor),
        };
      }
      return { rows: [] };
    });
    const handler = vi.fn();
    const bus = createPostgresFanoutBus(pool);

    const unsubscribe = await bus.subscribe("chat", handler);
    await vi.advanceTimersByTimeAsync(1000);

    expect(handler).toHaveBeenNthCalledWith(1, { n: 1 });
    expect(handler).toHaveBeenNthCalledWith(2, { n: 2 });
    // Second poll resumes from the last delivered row, not the head.
    await vi.advanceTimersByTimeAsync(1000);
    expect(handler).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("passes through object payloads already decoded by the pg driver", async () => {
    const { pool } = mockPool(async (sql) => {
      if (sql.startsWith("SELECT COALESCE(MAX(id)")) return headResult(0);
      return { rows: [{ id: 1, payload: { already: "parsed" } }] };
    });
    const handler = vi.fn();
    const bus = createPostgresFanoutBus(pool);

    await bus.subscribe("chat", handler);
    await vi.advanceTimersByTimeAsync(1000);

    expect(handler).toHaveBeenCalledWith({ already: "parsed" });
  });

  it("uses the default batch size and honors a custom one", async () => {
    const { pool, query } = mockPool(async (sql) =>
      sql.startsWith("SELECT COALESCE(MAX(id)") ? headResult(0) : { rows: [] });

    const bus = createPostgresFanoutBus(pool);
    const unsubscribe = await bus.subscribe("chat", vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("LIMIT $3"), ["chat", 0, 100]);
    unsubscribe();

    const { pool: poolCustom, query: queryCustom } = mockPool(async (sql) =>
      sql.startsWith("SELECT COALESCE(MAX(id)") ? headResult(0) : { rows: [] });
    const busCustom = createPostgresFanoutBus(poolCustom, { batchSize: 25 });
    const unsubscribeCustom = await busCustom.subscribe("chat", vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    expect(queryCustom).toHaveBeenCalledWith(expect.stringContaining("LIMIT $3"), ["chat", 0, 25]);
    unsubscribeCustom();
  });

  it("redelivers a row when the handler fails (at-least-once)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { pool } = mockPool(async (sql, params) => {
      if (sql.startsWith("SELECT COALESCE(MAX(id)")) return headResult(0);
      const cursor = Number(params?.[1]);
      return { rows: [{ id: 5, payload: { retry: true } }].filter((row) => row.id > cursor) };
    });
    const handler = vi.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue(undefined);
    const bus = createPostgresFanoutBus(pool);

    await bus.subscribe("chat", handler);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(2, { retry: true });
    expect(errorSpy).toHaveBeenCalledWith(
      "[fanout] PostgreSQL polling failed",
      expect.any(Error),
    );
  });

  it("logs poll failures and keeps polling", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let fetchCount = 0;
    const { pool } = mockPool(async (sql) => {
      if (sql.startsWith("SELECT COALESCE(MAX(id)")) return headResult(0);
      fetchCount += 1;
      if (fetchCount === 1) throw new Error("connection lost");
      return { rows: [{ id: 1, payload: { ok: true } }] };
    });
    const handler = vi.fn();
    const bus = createPostgresFanoutBus(pool);

    await bus.subscribe("chat", handler);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(errorSpy).toHaveBeenCalledWith(
      "[fanout] PostgreSQL polling failed",
      expect.any(Error),
    );
    expect(handler).toHaveBeenCalledWith({ ok: true });
  });

  it("stops polling after unsubscribe", async () => {
    const { pool, query } = mockPool(async (sql) =>
      sql.startsWith("SELECT COALESCE(MAX(id)") ? headResult(0) : { rows: [] });
    const bus = createPostgresFanoutBus(pool);

    const unsubscribe = await bus.subscribe("chat", vi.fn());
    const callsBefore = query.mock.calls.length;
    unsubscribe();
    await vi.advanceTimersByTimeAsync(5000);

    expect(query.mock.calls.length).toBe(callsBefore);
  });

  it("close resolves without ending the caller-owned pool", async () => {
    const { pool } = mockPool();
    const bus = createPostgresFanoutBus(pool);

    await expect(bus.close()).resolves.toBeUndefined();
  });
});
