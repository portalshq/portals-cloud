/**
 * Event Publisher - Publishes interaction events via SSE/outbox.
 *
 * This is a stub implementation. Full implementation coming in Phase 2.
 */
import type {
  InteractionEvent,
} from "./types.js";

export interface EventPublisher {
  publish(event: InteractionEvent): Promise<void>;
  subscribe(worldId: string, afterSequence?: number): AsyncIterable<InteractionEvent>;
  getEvents(worldId: string, afterSequence?: number): Promise<InteractionEvent[]>;
  drainOutbox(): Promise<void>;
}

export class StubEventPublisher implements EventPublisher {
  async publish(_event: InteractionEvent): Promise<void> {
    throw new Error("EventPublisher.publish not implemented - Phase 2");
  }

  async *subscribe(_worldId: string, _afterSequence?: number): AsyncIterable<InteractionEvent> {
    throw new Error("EventPublisher.subscribe not implemented - Phase 2");
  }

  async getEvents(_worldId: string, _afterSequence?: number): Promise<InteractionEvent[]> {
    throw new Error("EventPublisher.getEvents not implemented - Phase 2");
  }

  async drainOutbox(): Promise<void> {
    throw new Error("EventPublisher.drainOutbox not implemented - Phase 2");
  }
}
