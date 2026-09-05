import { Chat, type ChatMessage } from "./chat.js";

export interface ExternalChatEvent {
  /** The queue-broadcast endpoint URL; it becomes the Portals chat session id. */
  streamEndpoint: string;
  provider: string;
  providerMessageId: string;
  authorId: string;
  authorDisplayName?: string;
  text: string;
  sentAt: string;
}

/** Normalize a broadcast endpoint before using it as a fan-out topic suffix. */
export function normalizeExternalStreamEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (!url.protocol.match(/^https?:$/) || url.username || url.password || url.search || url.hash) {
    throw new Error("streamEndpoint must be an http(s) URL without credentials, query, or fragment");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

/**
 * A provider-neutral ingress seam. YouTube/Twitch connectors can live outside
 * this package and submit normalized events without coupling to fan-out internals.
 */
export class ExternalChatIngress {
  constructor(private readonly chat: Chat) {}

  /** Normalize without publishing so applications can persist before fan-out. */
  normalize(event: ExternalChatEvent): ChatMessage {
    const provider = event.provider.trim();
    const providerMessageId = event.providerMessageId.trim();
    const authorId = event.authorId.trim();
    const text = event.text.trim();
    if (!provider || !providerMessageId || !authorId || !text) {
      throw new Error("provider, providerMessageId, authorId, and text are required");
    }
    const sentAt = new Date(event.sentAt);
    if (Number.isNaN(sentAt.getTime())) throw new Error("sentAt must be a valid date-time");

    const message: ChatMessage = {
      messageId: `external:${provider}:${providerMessageId}`,
      sessionId: normalizeExternalStreamEndpoint(event.streamEndpoint),
      authorId: `external:${provider}:${authorId}`,
      authorDisplayName: event.authorDisplayName?.trim() || undefined,
      text,
      sentAt: sentAt.toISOString(),
      provenance: { kind: "external", provider, providerMessageId },
    };
    return message;
  }

  async ingest(event: ExternalChatEvent): Promise<ChatMessage> {
    const message = this.normalize(event);
    await this.chat.send(message);
    return message;
  }
}
