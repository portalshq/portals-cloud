import { describe, expect, it, vi } from "vitest";

import { FanoutHub } from "../src/index.js";

describe("FanoutHub", () => {
  it("orders direct connection messages with topic fanout", async () => {
    const delivered: string[] = [];
    const hub = new FanoutHub({ serialize: ({ payload }) => String(payload) });
    hub.register({ id: "viewer", send: async (message) => { await Promise.resolve(); delivered.push(message); } });
    hub.subscribe("viewer", "channel:one");
    hub.send("viewer", "initial");
    hub.publish("channel:one", "broadcast");
    hub.send("viewer", "ack");
    await vi.waitFor(() => expect(delivered).toEqual(["initial", "broadcast", "ack"]));
  });

  it("drops a late direct reply after its connection has gone away", () => {
    const hub = new FanoutHub();
    const unregister = hub.register({ id: "viewer", send: vi.fn() });
    unregister();
    expect(hub.send("viewer", "late reply")).toBe(false);
  });

  it("keeps reliable messages ordered and coalesces snapshots", async () => {
    const sent: string[] = [];
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const send = vi.fn().mockReturnValueOnce(blocked).mockImplementation((value: string) => { sent.push(value); });
    const hub = new FanoutHub();
    hub.register({ id: "one", send });
    hub.subscribe("one", "channel:a");

    hub.publish("channel:a", { sequence: 1 });
    hub.publish("channel:a", { presence: 1 }, "snapshot");
    hub.publish("channel:a", { presence: 2 }, "snapshot");
    hub.publish("channel:a", { sequence: 2 });
    release();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    expect(send.mock.calls.map(([value]) => JSON.parse(value).payload)).toEqual([
      { sequence: 1 }, { sequence: 2 }, { presence: 2 },
    ]);
  });

  it("disconnects a slow connection rather than dropping reliable messages", () => {
    const close = vi.fn();
    const hub = new FanoutHub({ maxReliableQueue: 1 });
    hub.register({ id: "slow", send: () => new Promise(() => {}), close });
    hub.subscribe("slow", "chat:a");
    hub.publish("chat:a", 1);
    hub.publish("chat:a", 2);
    hub.publish("chat:a", 3);
    expect(close).toHaveBeenCalledWith(1013, "reliable fanout queue exhausted");
    expect(hub.connectionCount()).toBe(0);
  });
});
