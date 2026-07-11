import { FanoutBus } from "./fanout-bus.js";

export interface ChatMessage {
  sessionId: string;
  authorId: string;
  text: string;
  sentAt: string;
  /** Structured extraction hooks — e.g. sentiment, mentions, flagged terms.
   *  Populated server-side, not client-side, per the infra requirement
   *  for chat extraction on the infra side rather than client display only. */
  extracted?: Record<string, unknown>;
}

export class Chat {
  constructor(private bus: FanoutBus) {}

  async send(message: ChatMessage): Promise<void> {
    // TODO: run extraction pipeline (moderation, sentiment, mentions) before publish
    await this.bus.publish(`chat:${message.sessionId}`, message);
  }

  async onMessage(sessionId: string, handler: (m: ChatMessage) => void): Promise<() => void> {
    return this.bus.subscribe(`chat:${sessionId}`, handler as (m: unknown) => void);
  }
}
