import type { InteractionEvent } from "./types.js";
import type {
  InteractionRepository,
  NewInteractionEvent,
} from "./db/repository.js";
import { integer, text } from "./validation.js";

/** Satisfied by createPostgresFanoutBus and InMemoryFanoutBus. */
export interface InteractionFanout {
  publish(topic: string, message: unknown): Promise<void>;
  subscribe(
    topic: string,
    handler: (message: unknown) => void | Promise<void>
  ): Promise<() => void>;
}
export interface IEventPublisher {
  publish(event: NewInteractionEvent): Promise<void>;
  subscribe(
    worldId: string,
    afterSequence?: number,
    options?: { signal?: AbortSignal }
  ): AsyncIterableIterator<InteractionEvent>;
  getEvents(
    worldId: string,
    afterSequence?: number
  ): Promise<InteractionEvent[]>;
  drainOutbox(): Promise<void>;
}

type StreamState = {
  cursor: number;
  initialized: boolean;
  closed: boolean;
  page: InteractionEvent[];
  waiting?: () => void;
  error?: unknown;
};

type TopicPump = {
  worldId: string;
  streams: Set<StreamState>;
  timer?: ReturnType<typeof setTimeout>;
  unsubscribe?: () => void;
  starting?: Promise<void>;
  polling: boolean;
  idleDelayMs: number;
};

/** PostgreSQL is the replay source; fanout is a wake-up hint, so reordered/duplicated delivery is harmless. */
export class EventPublisher implements IEventPublisher {
  private readonly topics = new Map<string, TopicPump>();
  constructor(
    private readonly fanout: InteractionFanout,
    private readonly repository: InteractionRepository,
    private readonly pollIntervalMs = 1000
  ) {
    integer(pollIntervalMs, "pollIntervalMs", 1, 60000);
  }
  async publish(event: NewInteractionEvent): Promise<void> {
    await this.repository.publishEvent(event);
  }
  getEvents(worldId: string, afterSequence = 0) {
    return this.repository.getEvents(worldId, afterSequence);
  }
  async drainOutbox(): Promise<void> {
    const { token, events } = await this.repository.claimOutbox();
    try {
      for (const event of events) {
        await this.fanout.publish(this.topic(event.worldId), event);
        await this.repository.acknowledgeEvent(event.id!, token);
      }
    } finally {
      await this.repository.releaseClaim(token);
    }
  }
  private topic(worldId: string) {
    return `interaction:${worldId}`;
  }
  private wake(stream: StreamState) {
    const resolve = stream.waiting;
    stream.waiting = undefined;
    resolve?.();
  }
  private stopPump(pump: TopicPump) {
    clearTimeout(pump.timer);
    pump.timer = undefined;
    pump.unsubscribe?.();
    pump.unsubscribe = undefined;
    this.topics.delete(pump.worldId);
  }
  private remove(pump: TopicPump, stream: StreamState) {
    pump.streams.delete(stream);
    if (pump.streams.size === 0) this.stopPump(pump);
  }
  private schedule(pump: TopicPump, delay = this.pollIntervalMs) {
    if (pump.timer || pump.polling || pump.streams.size === 0) return;
    pump.timer = setTimeout(() => {
      pump.timer = undefined;
      void this.poll(pump);
    }, delay);
    pump.timer.unref();
  }
  private async startPump(pump: TopicPump) {
    if (pump.unsubscribe || pump.starting) return pump.starting;
    pump.starting = this.fanout
      .subscribe(this.topic(pump.worldId), () => {
        if (pump.timer) clearTimeout(pump.timer);
        pump.timer = undefined;
        pump.idleDelayMs = this.pollIntervalMs;
        this.schedule(pump, 0);
      })
      .then((unsubscribe) => {
        if (pump.streams.size === 0 || this.topics.get(pump.worldId) !== pump)
          unsubscribe();
        else {
          pump.unsubscribe = unsubscribe;
          pump.idleDelayMs = this.pollIntervalMs;
        }
      })
      .finally(() => {
        pump.starting = undefined;
      });
    return pump.starting;
  }
  private async poll(pump: TopicPump) {
    if (
      pump.polling ||
      pump.streams.size === 0 ||
      this.topics.get(pump.worldId) !== pump
    )
      return;
    pump.polling = true;
    let nextDelay = this.pollIntervalMs;
    try {
      await this.startPump(pump);
      if (pump.streams.size === 0) return;
      const cursor = Math.min(...[...pump.streams].map((stream) => stream.cursor));
      const events = await this.repository.getEvents(pump.worldId, cursor);
      for (const stream of pump.streams) {
        const fresh = events.filter((event) => event.sequence > stream.cursor);
        if (!fresh.length) continue;
        stream.page.push(...fresh);
        stream.cursor = fresh.at(-1)!.sequence;
        this.wake(stream);
      }
      pump.idleDelayMs = events.length
        ? this.pollIntervalMs
        : Math.min(pump.idleDelayMs * 2, 30_000);
      nextDelay = events.length ? 0 : pump.idleDelayMs;
    } catch (cause) {
      for (const stream of pump.streams) {
        stream.error = cause;
        this.wake(stream);
      }
      this.stopPump(pump);
    } finally {
      pump.polling = false;
      if (this.topics.get(pump.worldId) === pump) this.schedule(pump, nextDelay);
    }
  }
  subscribe(
    worldId: string,
    afterSequence?: number,
    options: { signal?: AbortSignal } = {}
  ): AsyncIterableIterator<InteractionEvent> {
    text(worldId, "worldId");
    if (afterSequence !== undefined) integer(afterSequence, "afterSequence", 0);
    const state: StreamState = {
      cursor: afterSequence ?? 0,
      initialized: false,
      closed: false,
      page: [],
    };
    let pump: TopicPump | undefined;
    let serial = Promise.resolve<IteratorResult<InteractionEvent>>({
      done: true,
      value: undefined,
    });
    const close = () => {
      state.closed = true;
      state.page = [];
      if (pump) this.remove(pump, state);
      this.wake(state);
      options.signal?.removeEventListener("abort", close);
    };
    options.signal?.addEventListener("abort", close, { once: true });
    if (options.signal?.aborted) close();
    const pull = async (): Promise<IteratorResult<InteractionEvent>> => {
      try {
        if (!state.initialized && !state.closed) {
          if (afterSequence === undefined)
            state.cursor = await this.repository.eventHead(worldId);
          if (state.closed) return { done: true, value: undefined };
          pump = this.topics.get(worldId) ?? {
            worldId,
            streams: new Set(),
            polling: false,
            idleDelayMs: this.pollIntervalMs,
          };
          this.topics.set(worldId, pump);
          pump.streams.add(state);
          state.initialized = true;
          this.schedule(pump, 0);
        }
        while (!state.closed) {
          if (state.error) throw state.error;
          if (state.page.length) {
            const value = state.page.shift()!;
            return { done: false, value };
          }
          await new Promise<void>((resolve) => {
            state.waiting = resolve;
          });
        }
        return { done: true, value: undefined };
      } catch (cause) {
        close();
        throw cause;
      }
    };
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      next: () => {
        serial = serial.then(pull, pull);
        return serial;
      },
      return: async () => {
        close();
        return { done: true, value: undefined };
      },
      throw: async (cause: unknown) => {
        close();
        throw cause;
      },
    };
  }
}
