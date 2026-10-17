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
/** PostgreSQL is the replay source; fanout is a wake-up hint, so reordered/duplicated delivery is harmless. */
export class EventPublisher implements IEventPublisher {
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
  subscribe(
    worldId: string,
    afterSequence?: number,
    options: { signal?: AbortSignal } = {}
  ): AsyncIterableIterator<InteractionEvent> {
    text(worldId, "worldId");
    if (afterSequence !== undefined) integer(afterSequence, "afterSequence", 0);
    let cursor = afterSequence ?? 0;
    let initialized = false;
    let closed = false;
    let unsubscribe: (() => void) | undefined;
    let waiting: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let page: InteractionEvent[] = [];
    let serial = Promise.resolve<IteratorResult<InteractionEvent>>({
      done: true,
      value: undefined,
    });
    const wake = () => {
      const resolve = waiting;
      waiting = undefined;
      clearTimeout(timer);
      resolve?.();
    };
    const close = () => {
      closed = true;
      page = [];
      unsubscribe?.();
      unsubscribe = undefined;
      wake();
      options.signal?.removeEventListener("abort", close);
    };
    options.signal?.addEventListener("abort", close, { once: true });
    if (options.signal?.aborted) close();
    const pull = async (): Promise<IteratorResult<InteractionEvent>> => {
      try {
        if (!initialized && !closed) {
          if (afterSequence === undefined)
            cursor = await this.repository.eventHead(worldId);
          // Head is read first. A write between head and subscribe is caught by the subsequent replay query.
          const stop = await this.fanout.subscribe(this.topic(worldId), wake);
          if (closed) stop();
          else unsubscribe = stop;
          initialized = true;
        }
        while (!closed) {
          if (page.length) {
            const value = page.shift()!;
            cursor = value.sequence;
            return { done: false, value };
          }
          // Install the wake-up before the database read to cover publication during that read.
          const awakened = new Promise<void>((resolve) => {
            waiting = resolve;
            timer = setTimeout(wake, this.pollIntervalMs);
          });
          page = await this.repository.getEvents(worldId, cursor);
          if (page.length || closed) {
            wake();
            continue;
          }
          await awakened;
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
