import type { ChatMessage } from "../chat.js";
import type { FanoutBus } from "../fanout-bus.js";
import type { ChatMetricsCollector } from "../monitoring/chat-metrics.js";

import type { ChatProvider } from "./chat-provider.js";

export interface ChatProviderHealth {
  providerId: string;
  providerName: string;
  isConnected: boolean;
  lastError?: string;
}

interface RegisteredProvider {
  provider: ChatProvider;
  unsubscribe: () => void;
  lastError?: string;
}

/** Connects provider messages to the in-process chat fan-out bus. */
export class ChatProviderRegistry {
  private readonly providers = new Map<string, RegisteredProvider>();

  constructor(
    private readonly bus: FanoutBus,
    private readonly metrics?: ChatMetricsCollector,
  ) {}

  async register(provider: ChatProvider, providerId = provider.providerName): Promise<void> {
    assertProviderId(providerId);
    if (this.providers.has(providerId)) throw new Error(`Chat provider already registered: ${providerId}`);

    await provider.connect();
    const registration: RegisteredProvider = {
      provider,
      unsubscribe: provider.onMessage((message) => this.forward(providerId, message)),
    };
    this.providers.set(providerId, registration);
    this.metrics?.registerProvider(providerId);
  }

  async disconnect(providerId: string): Promise<void> {
    const registration = this.providers.get(providerId);
    if (!registration) return;

    registration.unsubscribe();
    this.providers.delete(providerId);
    this.metrics?.unregisterProvider(providerId);
    await registration.provider.disconnect();
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.providers.keys()].map((providerId) => this.disconnect(providerId)));
  }

  getHealth(): readonly ChatProviderHealth[] {
    return [...this.providers.entries()].map(([providerId, registration]) => ({
      providerId,
      providerName: registration.provider.providerName,
      isConnected: registration.provider.isConnected(),
      ...(registration.lastError ? { lastError: registration.lastError } : {}),
    }));
  }

  private forward(providerId: string, message: ChatMessage): void {
    void this.publishProviderMessage(providerId, message);
  }

  private async publishProviderMessage(providerId: string, message: ChatMessage): Promise<void> {
    const registration = this.providers.get(providerId);
    if (!registration) return;

    try {
      await this.bus.publish(`chat:${message.sessionId}`, message);
      registration.lastError = undefined;
      this.metrics?.recordMessageReceived();
    } catch (error) {
      registration.lastError = error instanceof Error ? error.message : String(error);
      this.metrics?.recordMessageDropped();
    }
  }
}

function assertProviderId(providerId: string): void {
  if (!providerId.trim()) throw new TypeError("providerId is required");
}
