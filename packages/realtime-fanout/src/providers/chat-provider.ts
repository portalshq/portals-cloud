/**
 * Provider-agnostic chat interface for realtime-fanout.
 * Supports multiple chat providers (Twitch, YouTube, etc.) with a unified interface.
 */

import type { ChatMessage } from "../chat.js";

export interface ChatProvider {
  /** Provider name (e.g., 'twitch', 'youtube', 'portals') */
  readonly providerName: string;

  /** Connect to the chat service */
  connect(): Promise<void>;

  /** Disconnect from the chat service */
  disconnect(): Promise<void>;

  /** Register a callback for incoming messages, returns unsubscribe function */
  onMessage(callback: (message: ChatMessage) => void): () => void;

  /** Send a message to the chat service */
  sendMessage(text: string): Promise<void>;

  /** Check if connected */
  isConnected(): boolean;
}

export interface ChatProviderOptions {
  sessionId: string;
  /** Provider-specific configuration */
  config?: Record<string, unknown>;
}

/**
 * Base class for chat providers with common functionality
 */
export abstract class BaseChatProvider implements ChatProvider {
  protected readonly sessionId: string;
  protected readonly config: Record<string, unknown>;
  protected messageCallbacks: Set<(message: ChatMessage) => void> = new Set();
  protected _isConnected: boolean = false;

  constructor(options: ChatProviderOptions) {
    this.sessionId = options.sessionId;
    this.config = options.config ?? {};
  }

  abstract get providerName(): string;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract sendMessage(text: string): Promise<void>;

  isConnected(): boolean {
    return this._isConnected;
  }

  onMessage(callback: (message: ChatMessage) => void): () => void {
    this.messageCallbacks.add(callback);
    return () => {
      this.messageCallbacks.delete(callback);
    };
  }

  /**
   * Notify all registered callbacks of a new message
   */
  protected notifyMessage(message: ChatMessage): void {
    for (const callback of this.messageCallbacks) {
      try {
        callback(message);
      } catch (error) {
        console.error(`Error in chat message callback: ${error}`);
      }
    }
  }

  /**
   * Normalize provider-specific event to ChatMessage format
   */
  protected normalizeMessage(
    externalEvent: Record<string, unknown>,
    providerMessageId: string
  ): ChatMessage {
    return {
      messageId: `${this.providerName}-${providerMessageId}`,
      sessionId: this.sessionId,
      authorId: String(externalEvent.authorId ?? 'unknown'),
      authorDisplayName: externalEvent.authorDisplayName as string | undefined,
      text: String(externalEvent.text ?? ''),
      sentAt: externalEvent.sentAt as string ?? new Date().toISOString(),
      provenance: {
        kind: 'external',
        provider: this.providerName,
        providerMessageId,
      },
    };
  }
}