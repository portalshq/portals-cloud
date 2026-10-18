import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EventPublisher } from "../src/index.js";
import { InMemoryFanoutBus } from "../../realtime-fanout/src/fanout-bus.js";
import { createPostgresFanoutBus } from "../../capability-realtime-fanout-postgres/src/postgres-fanout-bus.js";
import { database } from "./database.js";

describe("durable event publication and replay", () => {
  let db: Awaited<ReturnType<typeof database>>;
  beforeAll(async () => {
    db = await database();
  });
  afterAll(async () => {
    await db?.close();
  });
  const event = (worldId: string, n = 1) => ({
    worldId,
    eventType: "test",
    data: { n },
    occurredAt: new Date().toISOString(),
  });
  it("persists monotonic per-world sequences across publisher instances and restarts", async () => {
    const bus = new InMemoryFanoutBus();
    const world = crypto.randomUUID();
    const a = new EventPublisher(bus, db.repository);
    const b = new EventPublisher(bus, db.repository);
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? a : b).publish(event(world, i))
      )
    );
    expect((await a.getEvents(world)).map((e) => e.sequence)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1)
    );
    expect(await db.repository.eventHead("unknown")).toBe(0);
  });
  it("retains failed deliveries and retries using the same event id", async () => {
    const world = crypto.randomUUID();
    const memory = new InMemoryFanoutBus({ historySize: 100 });
    let fail = true;
    const publisher = new EventPublisher(
      {
        subscribe: (...args) => memory.subscribe(...args),
        publish: async (...args) => {
          if (fail) throw new Error("fanout offline");
          await memory.publish(...args);
        },
      },
      db.repository
    );
    await publisher.publish(event(world));
    await expect(publisher.drainOutbox()).rejects.toThrow("fanout offline");
    fail = false;
    await publisher.drainOutbox();
    await publisher.drainOutbox();
    expect(memory.getHistory(`interaction:${world}`)).toHaveLength(1);
    expect(await publisher.getEvents(world)).toHaveLength(1);
  });
  it("replays pages then streams live with duplicate and out-of-order fanout hints", async () => {
    const world = crypto.randomUUID();
    const bus = new InMemoryFanoutBus();
    const publisher = new EventPublisher(bus, db.repository, 5);
    for (let i = 0; i < 105; i++) await publisher.publish(event(world, i));
    const stream = publisher.subscribe(world, 0);
    for (let i = 1; i <= 105; i++)
      expect((await stream.next()).value?.sequence).toBe(i);
    const pending = stream.next();
    await publisher.publish(event(world, 106));
    await bus.publish(`interaction:${world}`, { sequence: 999 });
    await bus.publish(`interaction:${world}`, { sequence: 2 });
    expect((await pending).value?.sequence).toBe(106);
    await stream.return!();
    expect(bus.getSubscriberCount()).toBe(0);
  });
  it("starts live-only subscriptions at head and cleans up a pending read immediately", async () => {
    const world = crypto.randomUUID();
    const bus = new InMemoryFanoutBus();
    const publisher = new EventPublisher(bus, db.repository, 5000);
    await publisher.publish(event(world));
    const stream = publisher.subscribe(world);
    const pending = stream.next();
    await vi.waitFor(() => expect(bus.getSubscriberCount()).toBe(1));
    await stream.return!();
    expect(await pending).toEqual({ done: true, value: undefined });
    expect(bus.getSubscriberCount()).toBe(0);
  });
  it("cleans up aborts both before and after subscription starts", async () => {
    const bus = new InMemoryFanoutBus();
    const publisher = new EventPublisher(bus, db.repository, 5);
    const controller = new AbortController();
    const stream = publisher.subscribe(crypto.randomUUID(), 0, {
      signal: controller.signal,
    });
    const pending = stream.next();
    controller.abort();
    expect((await pending).done).toBe(true);
    const other = publisher.subscribe("aborted", 0, {
      signal: controller.signal,
    });
    expect((await other.next()).done).toBe(true);
    expect(bus.getSubscriberCount()).toBe(0);
    const thrown = publisher.subscribe("throws");
    await expect(thrown.throw!(new Error("cancel"))).rejects.toThrow("cancel");
  });
  it("uses actual fanout-postgres transport and releases polling on stream return", async () => {
    await db.pool.query(
      "CREATE TABLE fanout_messages(id bigserial PRIMARY KEY,topic text NOT NULL,payload jsonb NOT NULL)"
    );
    const fanout = createPostgresFanoutBus(db.pool);
    const publisher = new EventPublisher(fanout, db.repository, 10);
    const world = crypto.randomUUID();
    const stream = publisher.subscribe(world, 0);
    const pending = stream.next();
    await publisher.publish(event(world));
    await publisher.drainOutbox();
    expect((await pending).value?.worldId).toBe(world);
    await stream.return!();
    await fanout.close();
    expect(
      (await db.pool.query("SELECT count(*)::int AS n FROM fanout_messages"))
        .rows[0].n
    ).toBeGreaterThan(0);
  });
  it("recovers expired dispatcher claims and rejects invalid cursors and configuration", async () => {
    const world = crypto.randomUUID();
    await db.repository.publishEvent(event(world));
    const first = await db.repository.claimOutbox();
    expect(first.events.length).toBeGreaterThan(0);
    expect((await db.repository.claimOutbox()).events).toEqual([]);
    await db.pool.query(
      "UPDATE interaction_outbox SET claimed_until=now()-interval '1 second' WHERE claim_token=$1",
      [first.token]
    );
    const next = await db.repository.claimOutbox();
    expect(next.events.map((e) => e.id)).toEqual(first.events.map((e) => e.id));
    await db.repository.acknowledgeEvent(next.events[0].id!, first.token);
    expect(
      (
        await db.pool.query(
          "SELECT published_at FROM interaction_outbox WHERE id=$1",
          [next.events[0].id]
        )
      ).rows[0].published_at
    ).toBeNull();
    await db.repository.releaseClaim(next.token);
    const publisher = new EventPublisher(
      new InMemoryFanoutBus(),
      db.repository
    );
    expect(() => publisher.subscribe("world", -1)).toThrow();
    expect(
      () => new EventPublisher(new InMemoryFanoutBus(), db.repository, 0)
    ).toThrow();
    await expect(publisher.getEvents("world", -1)).rejects.toThrow();
  });
});

describe("stream cleanup during asynchronous failures", () => {
  it("unsubscribes if cancelled while subscription initialization is pending", async () => {
    const db = await database();
    try {
      let release!: (unsubscribe: () => void) => void;
      const stopped = vi.fn();
      const publisher = new EventPublisher(
        {
          publish: async () => {},
          subscribe: async () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        },
        db.repository,
        5
      );
      const stream = publisher.subscribe("late", 0);
      const pending = stream.next();
      await vi.waitFor(() => expect(release).toBeTypeOf("function"));
      await stream.return!();
      release(stopped);
      expect((await pending).done).toBe(true);
      expect(stopped).toHaveBeenCalledTimes(1);
    } finally {
      await db.close();
    }
  });
  it("propagates a replay error and releases the transport subscription", async () => {
    const db = await database();
    const bus = new InMemoryFanoutBus();
    try {
      const publisher = new EventPublisher(bus, db.repository, 5);
      const spy = vi
        .spyOn(db.repository, "getEvents")
        .mockRejectedValue(new Error("read failed"));
      const stream = publisher.subscribe("failure", 0);
      await expect(stream.next()).rejects.toThrow("read failed");
      expect(bus.getSubscriberCount()).toBe(0);
      spy.mockRestore();
      expect((await stream.next()).done).toBe(true);
    } finally {
      await db.close();
    }
  });
});
