import { describe, expect, it, vi } from "vitest";

import {
  ChatMetricsCollector,
  ChatProviderRegistry,
  InMemoryChatProvider,
  InMemoryFanoutBus,
} from "../src/index.js";

describe("InMemoryFanoutBus", () => {
  it("routes messages by topic, isolates subscriber failures, and cleans up subscriptions", async () => {
    const subscriberError = vi.fn();
    const bus = new InMemoryFanoutBus({ historySize: 2, onSubscriberError: subscriberError });
    const received = vi.fn();
    const unsubscribe = await bus.subscribe("chat:one", received);
    await bus.subscribe("chat:one", () => { throw new Error("subscriber failed"); });
    await bus.publish("chat:one", { text: "first" });
    await bus.publish("chat:two", { text: "other" });
    await bus.publish("chat:one", { text: "second" });

    expect(received).toHaveBeenCalledTimes(2);
    expect(subscriberError).toHaveBeenCalledWith(expect.any(Error), "chat:one");
    expect(bus.getHistory("chat:one")).toEqual([{ text: "first" }, { text: "second" }]);
    expect(bus.getSubscriberCount("chat:one")).toBe(2);
    expect(bus.getSubscriberCount()).toBe(2);
    unsubscribe();
    unsubscribe();
    expect(bus.getSubscriberCount("chat:one")).toBe(1);
  });

  it("rejects empty topics and invalid history configuration", async () => {
    expect(() => new InMemoryFanoutBus({ historySize: -1 })).toThrow("historySize");
    const bus = new InMemoryFanoutBus();
    await expect(bus.publish("", {})).rejects.toThrow("topic");
    await expect(bus.subscribe(" ", () => {})).rejects.toThrow("topic");
  });

  it("does not make fast subscribers wait for a slow subscriber", async () => {
    const bus = new InMemoryFanoutBus();
    let releaseSlow!: () => void;
    const slow = new Promise<void>((resolve) => { releaseSlow = resolve; });
    const received = vi.fn();
    await bus.subscribe("chat:one", () => slow);
    await bus.subscribe("chat:one", received);

    const publishing = bus.publish("chat:one", { text: "hello" });
    await vi.waitFor(() => expect(received).toHaveBeenCalledOnce());
    releaseSlow();
    await publishing;
  });
});

describe("ChatProviderRegistry", () => {
  it("connects a provider, forwards messages to the bus, reports health, and disconnects", async () => {
    const bus = new InMemoryFanoutBus();
    const metrics = new ChatMetricsCollector();
    const registry = new ChatProviderRegistry(bus, metrics);
    const provider = new InMemoryChatProvider({ sessionId: "session-a" });
    const received: unknown[] = [];
    await bus.subscribe("chat:session-a", (message) => received.push(message));

    await registry.register(provider, "local-session-a");
    await provider.sendMessage("hello");
    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
      expect(metrics.getSnapshot().messagesReceived).toBe(1);
    });

    expect(registry.getHealth()).toEqual([{
      providerId: "local-session-a", providerName: "in-memory", isConnected: true,
    }]);
    expect(metrics.getSnapshot()).toMatchObject({ messagesReceived: 1, connectedProviders: 1 });
    await registry.disconnect("local-session-a");
    expect(registry.getHealth()).toEqual([]);
    expect(provider.isConnected()).toBe(false);
  });

  it("rejects duplicate provider registrations", async () => {
    const registry = new ChatProviderRegistry(new InMemoryFanoutBus());
    const provider = new InMemoryChatProvider({ sessionId: "session-a" });
    await registry.register(provider);
    await expect(registry.register(new InMemoryChatProvider({ sessionId: "session-b" }))).rejects.toThrow("already registered");
    await registry.disconnectAll();
  });

  it("records delivery failures without letting provider callbacks throw", async () => {
    const registry = new ChatProviderRegistry({
      async publish() { throw new Error("bus unavailable"); },
      async subscribe() { return () => {}; },
    });
    const provider = new InMemoryChatProvider({ sessionId: "session-a" });
    await registry.register(provider, "failing-bus");
    await provider.sendMessage("hello");

    await vi.waitFor(() => expect(registry.getHealth()).toEqual([{
      providerId: "failing-bus", providerName: "in-memory", isConnected: true, lastError: "bus unavailable",
    }]));
    await registry.disconnect("missing");
    await registry.disconnectAll();
  });
});
