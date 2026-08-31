/**
 * In-memory chat provider for local development and testing.
 * Simulates chat functionality without external dependencies.
 */

import { BaseChatProvider, ChatProviderOptions } from "./chat-provider.js";
import type { ChatMessage } from "../chat.js";

export interface InMemoryChatOptions extends ChatProviderOptions {
  /** Simulated message delay in ms */
  messageDelay?: number;
  /** Auto-generate simulated messages */
  simulateMessages?: boolean;
}

/**
 * In-memory chat provider for development and testing.
 * Supports message buffering and simple simulation.
 */
export class InMemoryChatProvider extends BaseChatProvider {
  private messageDelay: number;
  private simulateMessages: boolean;
  private simulationInterval: NodeJS.Timeout | null = null;
  private messageBuffer: ChatMessage[] = [];
  private messageCounter: number = 0;

  readonly providerName = "in-memory";

  constructor(options: InMemoryChatOptions) {
    super(options);
    this.messageDelay = options.messageDelay ?? 1000;
    this.simulateMessages = options.simulateMessages ?? false;
  }

  async connect(): Promise<void> {
    if (this._isConnected) {
      console.warn('InMemoryChatProvider already connected');
      return;
    }

    console.log('Connecting to in-memory chat provider');
    this._isConnected = true;

    if (this.simulateMessages) {
      this.startSimulation();
    }
  }

  async disconnect(): Promise<void> {
    if (!this._isConnected) {
      return;
    }

    console.log('Disconnecting from in-memory chat provider');
    this._isConnected = false;

    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    this.messageBuffer = [];
  }

  async sendMessage(text: string): Promise<void> {
    if (!this._isConnected) {
      throw new Error('InMemoryChatProvider not connected');
    }

    const message: ChatMessage = {
      messageId: `in-memory-${this.messageCounter++}`,
      sessionId: this.sessionId,
      authorId: 'local-user',
      authorDisplayName: 'Local User',
      text,
      sentAt: new Date().toISOString(),
      provenance: {
        kind: 'portals',
      },
    };

    this.messageBuffer.push(message);
    this.notifyMessage(message);
  }

  /**
   * Get buffered messages
   */
  getBufferedMessages(): ChatMessage[] {
    return [...this.messageBuffer];
  }

  /**
   * Clear message buffer
   */
  clearBuffer(): void {
    this.messageBuffer = [];
  }

  /**
   * Start simulated message generation
   */
  private startSimulation(): void {
    const simulatedMessages = [
      'Hello everyone!',
      'This is a test message',
      'Great stream!',
      'Nice work',
      'Keep it up',
    ];

    this.simulationInterval = setInterval(() => {
      if (!this._isConnected) {
        return;
      }

      const randomMessage = simulatedMessages[
        Math.floor(Math.random() * simulatedMessages.length)
      ];

      const message: ChatMessage = {
        messageId: `simulated-${this.messageCounter++}`,
        sessionId: this.sessionId,
        authorId: `user-${Math.floor(Math.random() * 100)}`,
        authorDisplayName: `User ${Math.floor(Math.random() * 100)}`,
        text: randomMessage,
        sentAt: new Date().toISOString(),
        provenance: {
          kind: 'external',
          provider: 'in-memory',
        },
      };

      this.messageBuffer.push(message);
      this.notifyMessage(message);
    }, this.messageDelay);
  }
}