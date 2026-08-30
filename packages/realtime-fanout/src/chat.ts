import { FanoutBus } from "./fanout-bus.js";

export interface ChatProvenance {
  kind: "portals" | "external";
  /** Required when kind is external, e.g. youtube-live or twitch. */
  provider?: string;
  /** The provider event id used to reconcile reconnect replays. */
  providerMessageId?: string;
}

export interface ChatMessage {
  /** Stable across delivery retries; consumers may de-duplicate on this field. */
  messageId: string;
  sessionId: string;
  authorId: string;
  authorDisplayName?: string;
  text: string;
  sentAt: string;
  provenance: ChatProvenance;
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
